// ============================================================================
// facultyAutoLinkService.js
// ---------------------------------------------------------------------------
// التنفيذ الفعلي للربط التلقائي: يقرأ السجل المركزي والروابط الحالية
// والمطالبات والقضايا (والإجازات الدراسية المحلية)، ثم يبني خطة الربط
// عبر facultyAutoLinkPlan ويكتب النتائج في faculty_member_links.
//
// الضمانات:
//   • لا يحذف رابطًا ولا يعدّل رابطًا قائمًا (ON CONFLICT DO NOTHING).
//   • لا يربط اسمًا مشابهًا غير حاسم — يرجعه ضمن «تحتاج مراجعة».
//   • لا يلمس أي جدول آخر.
// ============================================================================

import { supabase } from "../supabaseClient";
import { fetchAliases, fetchMembers, fetchAllLinks } from "./facultyArchiveService";
import { buildAutoLinkPlan } from "../utils/facultyAutoLinkPlan";

const PAGE_SIZE = 1000;
const WRITE_CHUNK = 200;

async function fetchAllRows(table, columns) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

const CLAIM_COLUMNS =
  "id,claimant_name,claim_number,claim_date,sheet_name,status,amount,data";
const ISSUE_COLUMNS =
  "id,case_number,case_title,case_description,status,created_at";

/**
 * يبني خطة الربط ويحفظها (أو يعيدها فقط عند dryRun).
 *
 * @param {object} options
 * @param {Array} [options.studyLeaves] سجلات الإجازات الدراسية من الذاكرة المحلية
 * @param {Array} [options.sources]     مصادر الربط المطلوبة
 * @param {boolean} [options.dryRun]    true = لا تكتب شيئًا
 * @returns {Promise<object>} تقرير بالنتائج + قائمة «تحتاج مراجعة»
 */
export async function autoLinkFacultySources({
  studyLeaves = [],
  sources = ["claim", "issue", "study_leave"],
  dryRun = false,
  onProgress = null,
} = {}) {
  const wanted = new Set(sources);

  const [members, aliases, existingLinks] = await Promise.all([
    fetchMembers(),
    fetchAliases(),
    fetchAllLinks(),
  ]);

  let claims = [];
  let issues = [];

  if (wanted.has("claim")) {
    onProgress?.({ step: "fetch_claims" });
    claims = await fetchAllRows("claims", CLAIM_COLUMNS);
  }
  if (wanted.has("issue")) {
    onProgress?.({ step: "fetch_issues" });
    issues = await fetchAllRows("issues", ISSUE_COLUMNS);
  }

  onProgress?.({ step: "plan" });
  const plan = buildAutoLinkPlan({
    members,
    aliases,
    claims,
    issues,
    studyLeaves,
    existingLinks,
    sources: [...wanted],
  });

  const result = {
    ...plan.report,
    review: plan.review,
    dryRun,
    created: 0,
    writeErrors: [],
  };

  if (dryRun || plan.links.length === 0) {
    if (dryRun) result.planned = plan.links;
    return result;
  }

  for (let i = 0; i < plan.links.length; i += WRITE_CHUNK) {
    const chunk = plan.links.slice(i, i + WRITE_CHUNK);
    onProgress?.({
      step: "write",
      done: Math.min(i + chunk.length, plan.links.length),
      total: plan.links.length,
    });
    const { error } = await supabase.from("faculty_member_links").upsert(chunk, {
      onConflict: "member_id,link_type,ref_table,ref_id",
      ignoreDuplicates: true,
    });
    if (error) {
      result.writeErrors.push(error.message);
      continue;
    }
    result.created += chunk.length;
  }

  return result;
}

/**
 * إحصاء سريع للروابط الحالية حسب النوع (لعرضه في الواجهة).
 */
export async function fetchLinkCountsByType() {
  const links = await fetchAllLinks();
  const counts = {};
  links.forEach((link) => {
    counts[link.link_type] = (counts[link.link_type] || 0) + 1;
  });
  return counts;
}
