// ============================================================================
// facultyArchiveService.js
// ---------------------------------------------------------------------------
// طبقة الوصول للبيانات الخاصة بـ«الأرشيف الذكي لأعضاء هيئة التدريس».
// كل استعلامات Supabase الخاصة بهذه الصفحة في هذا الملف، حتى تبقى الصفحة
// في src/dashboard/SmartFacultyArchivePage.jsx مسؤولة عن العرض فقط.
//
// قواعد ثابتة في هذه الطبقة:
//   • لا يتم دمج عضوين بأي حال — الربط بالرقم/المعرّف فقط.
//   • أسماء الملفات تُحفظ على جهاز المستخدم (local://) ولا تُرفع للسحابة.
// ============================================================================

import { supabase } from "../supabaseClient";
import {
  uploadFile,
  deleteFile as storageDeleteFile,
  downloadFileToDisk,
  openLocalFile,
  getLocalStorageDir,
  canSaveOnDevice,
} from "./fileStorage";
import { normalizeArabicKey, toDisplayName, normalizeMemberCode } from "../utils/arabicText";

export const FACULTY_MEMBERS_TABLE = "faculty_members";
export const FACULTY_ALIASES_TABLE = "faculty_member_aliases";
export const FACULTY_DOCUMENTS_TABLE = "faculty_member_documents";
export const FACULTY_LINKS_TABLE = "faculty_member_links";

/** البِكِت المنطقي داخل مجلد التخزين المحلي على جهاز المستخدم. */
export const FACULTY_ARCHIVE_BUCKET = "faculty-archive";

/* ------------------------------------------------------------------ */
/* سجل الأقسام التي يمكن الربط بها                                     */
/* ------------------------------------------------------------------ */
export const LINK_SOURCES = {
  claim: {
    table: "claims",
    label: "مطالبات",
    icon: "📋",
    color: "#E0F2FE",
    title: (r) => r.claim_number || r.sheet_name || "مطالبة",
    subtitle: (r) =>
      [claimantNameOf(r), r.status, r.amount ? `المبلغ: ${r.amount}` : null]
        .filter(Boolean)
        .join(" • "),
  },
  service_request: {
    table: "service_requests",
    label: "طلبات واردة",
    icon: "📥",
    color: "#DBEAFE",
    title: (r) => r.service_type || "طلب",
    subtitle: (r) =>
      [r.name, r.status, r.directed_to || r.requested_details]
        .filter(Boolean)
        .join(" • "),
  },
  issue: {
    table: "issues",
    label: "قضايا",
    icon: "⚖️",
    color: "#ECE9FE",
    title: (r) => r.case_number || r.case_title || "قضية",
    subtitle: (r) => [r.case_title, r.status].filter(Boolean).join(" • "),
  },
  study_leave: {
    table: "study_leaves",
    label: "إجازات دراسية",
    icon: "🎓",
    color: "#FEF9C3",
    title: (r) =>
      r.name
        ? `${r.leaveKind || "إجازة دراسية"} — ${r.name}`
        : r.leaveKind || "إجازة دراسية",
    subtitle: (r) =>
      [r.startDate, r.endDate, r.salaryStatus].filter(Boolean).join(" • "),
  },
  letter: {
    table: "letters",
    label: "خطابات",
    icon: "📨",
    color: "#D1FAE5",
    title: (r) => r.letter_number || r.subject || "خطاب",
    subtitle: (r) => [r.subject, r.status].filter(Boolean).join(" • "),
  },
  executive_order: {
    table: "executive_order_persons",
    label: "أوامر تنفيذية",
    icon: "📜",
    color: "#FEF3C7",
    title: (r) => r.full_name || "ملف أوامر تنفيذية",
    subtitle: (r) =>
      r.order_count ? `عدد الأوامر: ${r.order_count}` : "ملف أوامر تنفيذية",
  },
  task: {
    table: "tasks",
    label: "مهام",
    icon: "✅",
    color: "#F1F5F9",
    title: (r) => r.title || "مهمة",
    subtitle: (r) => [r.type, r.status].filter(Boolean).join(" • "),
  },
  salary_document: {
    table: "faculty_salary_archive",
    label: "مفردات مرتب",
    icon: "🧾",
    color: "#F3E8FF",
    title: (r) =>
      r.year ? `مفردة ${r.year}/${String(r.month || "").padStart(2, "0")}` : "مفردة مرتب",
    subtitle: (r) => r.original_filename || "",
  },
  other: {
    table: null,
    label: "معاملات أخرى",
    icon: "🔗",
    color: "#F1F5F9",
    title: (r) => r.ref_label || "معاملة",
    subtitle: () => "",
  },
};

export const LINK_TYPES = Object.keys(LINK_SOURCES);

/**
 * اسم صاحب المطالبة: العمود المخصّص غالبًا فارغ، والاسم الحقيقي مخزّن
 * داخل كائن JSON في المفتاح " " (مسافة واحدة) أو أحد مفاتيح الاسم العربية.
 */
export function claimantNameOf(claim) {
  if (!claim) return "";
  if (claim.claimant_name) return String(claim.claimant_name).trim();
  const data = claim.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const keys = [" ", "الاسم", "الاسم ", "اسم"];
    for (const key of keys) {
      if (typeof data[key] === "string" && data[key].trim()) {
        return data[key].trim();
      }
    }
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* قراءة البيانات                                                       */
/* ------------------------------------------------------------------ */

async function fetchAllRows(table, columns, { pageSize = 1000 } = {}) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

/** كل أعضاء هيئة التدريس (السجل المركزي). */
export async function fetchMembers() {
  return fetchAllRows(
    FACULTY_MEMBERS_TABLE,
    "id,member_code,member_code_raw,full_name,full_name_raw,full_name_normalized,job_title,group_name,grade,grade_date,salary_306,salary_306_raw,source_row_no,source_file,status,created_at,updated_at"
  );
}

export async function createOrFindMember({ fullName, memberCode, jobTitle, status } = {}) {
  const name = toDisplayName(fullName);
  if (!name) throw new Error("الاسم مطلوب.");
  const code = normalizeMemberCode(memberCode);
  if (!code) throw new Error("رقم الصرف مطلوب.");

  const { data: existing } = await supabase
    .from(FACULTY_MEMBERS_TABLE)
    .select("*")
    .eq("member_code", code)
    .limit(1);

  if (existing && existing.length) return existing[0];

  const { data: byName } = await supabase
    .from(FACULTY_MEMBERS_TABLE)
    .select("*")
    .eq("full_name_normalized", normalizeArabicKey(name))
    .limit(1);

  if (byName && byName.length) return byName[0];

  const { data, error } = await supabase
    .from(FACULTY_MEMBERS_TABLE)
    .insert({
      member_code: code,
      member_code_raw: memberCode || code,
      full_name: name,
      full_name_raw: fullName || name,
      full_name_normalized: normalizeArabicKey(name),
      job_title: jobTitle || null,
      status: status || "active",
      source_file: "smart-upload",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** روابط عضو واحد. */
export async function fetchMemberLinks(memberId) {
  const { data, error } = await supabase
    .from(FACULTY_LINKS_TABLE)
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** كل الروابط (لصفحة سجل الربط). */
export async function fetchAllLinks() {
  return fetchAllRows(
    FACULTY_LINKS_TABLE,
    "id,member_id,link_type,ref_table,ref_id,ref_label,ref_date,matched_by,confidence,created_at"
  );
}

/** وثائق عضو واحد. */
export async function fetchMemberDocuments(memberId) {
  const { data, error } = await supabase
    .from(FACULTY_DOCUMENTS_TABLE)
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** كل الوثائق. */
export async function fetchAllDocuments() {
  return fetchAllRows(
    FACULTY_DOCUMENTS_TABLE,
    "id,member_id,doc_type,title,year,month,storage_provider,storage_key,file_path,file_url,original_filename,mime_type,size_bytes,notes,created_by,created_at"
  );
}

/** الأسماء البديلة لكل الأعضاء. */
export async function fetchAliases() {
  return fetchAllRows(
    FACULTY_ALIASES_TABLE,
    "id,member_id,alias,alias_normalized,created_by,created_at"
  );
}

/**
 * يجلب السجل الأصلي المرتبط (حيًّا) من جدوله.
 * يعيد null إن كان الجدول غير متاح أو السجل محذوف.
 */
export async function fetchSourceRecord(refTable, refId) {
  if (!refTable) return null;
  const { data, error } = await supabase
    .from(refTable)
    .select("*")
    .eq("id", refId)
    .limit(1);
  if (error) return null;
  return data && data.length ? data[0] : null;
}

/* ------------------------------------------------------------------ */
/* البحث في الأقسام المصدر (للربط اليدوي)                               */
/* ------------------------------------------------------------------ */

/** نص البحث في سجل مصدر: يجمع الحقول النصية المهمة. */
function searchableText(row) {
  const direct = [row.name, row.claimant_name, row.case_title, row.case_description,
    row.subject, row.letter_title, row.final_text, row.responsible, row.full_name,
    row.sheet_name, row.claim_number, row.case_number, row.letter_number,
    row.employee_name, row.notes, row.description,
  ].filter(Boolean);

  // المطالبات تخزّن اسم صاحب المطالبة داخل كائن JSON (data) — نضمّه للبحث
  const data = row.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    Object.values(data).forEach((value) => {
      if (typeof value === "string" && value.trim()) direct.push(value);
    });
  }
  return direct.join(" ");
}

/**
 * يبحث في قسم من الأقسام المصدر لربط يدوي.
 * @returns {Promise<Array<{id,label,sub,row}>>}
 */
export async function searchSourceRecords(linkType, query) {
  const source = LINK_SOURCES[linkType];
  if (!source || !source.table) return [];

  const q = String(query || "").trim();
  const table = source.table;
  const columns = "*";
  let rows = [];
  try {
    rows = await fetchAllRows(table, columns);
  } catch {
    return [];
  }

  const needle = normalizeArabicKey(q);
  const scored = [];
  rows.forEach((row) => {
    const hay = normalizeArabicKey(searchableText(row));
    if (!hay) return;
    if (needle && !hay.includes(needle)) return;
    scored.push({
      id: String(row.id),
      label: source.title(row) || q || "بدون عنوان",
      sub: source.subtitle ? source.subtitle(row) : "",
      row,
    });
  });
  return scored.slice(0, 60);
}

/* ------------------------------------------------------------------ */
/* تعديل البيانات                                                       */
/* ------------------------------------------------------------------ */

export async function addAlias(memberId, alias, createdBy) {
  const clean = toDisplayName(alias);
  if (!clean) throw new Error("الاسم البديل فارغ.");
  const { data, error } = await supabase
    .from(FACULTY_ALIASES_TABLE)
    .upsert(
      {
        member_id: memberId,
        alias: clean,
        alias_normalized: normalizeArabicKey(clean),
        created_by: createdBy || null,
      },
      { onConflict: "member_id,alias_normalized" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeAlias(aliasId) {
  const { error } = await supabase
    .from(FACULTY_ALIASES_TABLE)
    .delete()
    .eq("id", aliasId);
  if (error) throw error;
}

/** ينشئ رابطًا يدويًا (لا يعتمد على المطابقة التلقائية). */
export async function createLink({
  memberId,
  linkType,
  refTable,
  refId,
  refLabel,
  refDate,
  snapshot,
  matchedBy = "manual",
  confidence = 1,
}) {
  const { data, error } = await supabase
    .from(FACULTY_LINKS_TABLE)
    .upsert(
      {
        member_id: memberId,
        link_type: linkType,
        ref_table: refTable,
        ref_id: String(refId),
        ref_label: refLabel || null,
        ref_date: refDate || null,
        matched_by: matchedBy,
        confidence,
        snapshot: snapshot || null,
      },
      { onConflict: "member_id,link_type,ref_table,ref_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLink(linkId) {
  const { error } = await supabase
    .from(FACULTY_LINKS_TABLE)
    .delete()
    .eq("id", linkId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* الوثائق — تُحفظ على جهاز المستخدم                                    */
/* ------------------------------------------------------------------ */

/** يبني مسارًا منظّمًا داخل البِكِت المحلي. */
export function buildDocumentPath(member, file, { year, month } = {}) {
  const code = String(member?.member_code || "unknown").replace(/[^\d\-]/g, "");
  const yearPart = year ? String(year) : "unspecified";
  const monthPart = month ? String(month).padStart(2, "0") : "unspecified";
  const original = String(file?.name || "document.pdf")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 80);
  return `${code}/${yearPart}/${monthPart}/${Date.now()}-${original}`;
}

/**
 * يرفع ملفًا محليًا إلى مجلد الأرشيف على جهاز المستخدم ويسجّله.
 * لا يُرفع أي بايت إلى Supabase Storage أو R2.
 */
export async function uploadMemberDocument(member, file, options = {}) {
  if (!member?.id) throw new Error("العضو غير محدد.");
  if (!file) throw new Error("لم يتم اختيار ملف.");

  const path = buildDocumentPath(member, file, options);
  const contentType = file.type || "application/pdf";

  const saved = await uploadFile(FACULTY_ARCHIVE_BUCKET, path, file, {
    contentType,
    upsert: true,
    provider: "local",
  });

  const { data, error } = await supabase
    .from(FACULTY_DOCUMENTS_TABLE)
    .insert({
      member_id: member.id,
      doc_type: options.docType || "other",
      title: options.title || file.name,
      year: options.year || null,
      month: options.month || null,
      storage_provider: saved.provider,
      storage_key: saved.key,
      file_path: path,
      file_url: saved.url,
      original_filename: file.name,
      mime_type: contentType,
      size_bytes: file.size || null,
      notes: options.notes || null,
      created_by: options.createdBy || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** يحذف الوثيقة من القاعدة ومن مجلد الجهاز. */
export async function deleteMemberDocument(doc) {
  if (doc?.file_url) {
    try {
      await storageDeleteFile(doc.file_url, { path: doc.file_path });
    } catch {
      /* الملف قد يكون محذوفًا أصلًا — نكمل حذف السجل */
    }
  }
  const { error } = await supabase
    .from(FACULTY_DOCUMENTS_TABLE)
    .delete()
    .eq("id", doc.id);
  if (error) throw error;
}

/** تنزيل وثيقة إلى جهاز المستخدم. */
export async function downloadMemberDocument(doc) {
  if (!doc?.file_url) throw new Error("لا يوجد ملف لهذه الوثيقة.");
  const name =
    doc.original_filename ||
    `${doc.title || "document"}${doc.year ? `_${doc.year}` : ""}.pdf`;
  await downloadFileToDisk(doc.file_url, name, { path: doc.file_path });
}

/** فتح وثيقة بالبرنامج الافتراضي. */
export async function openMemberDocument(doc) {
  if (!doc?.file_url) throw new Error("لا يوجد ملف لهذه الوثيقة.");
  return openLocalFile(doc.file_url, { path: doc.file_path });
}

/** مجلد التخزين المحلي على الجهاز (لعرضه للمستخدم). */
export async function localArchiveDir() {
  return getLocalStorageDir();
}

/** هل يمكن حفظ الملفات على هذا الجهاز؟ (ديسكتوب أو متصفح حديث) */
export function canStoreLocally() {
  return canSaveOnDevice();
}
