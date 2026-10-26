// ============================================================================
// auto-link.mjs
// ---------------------------------------------------------------------------
// ربط تلقائي بين سجلات النظام والأرشيف الذكي (مطالبات + قضايا [+ إجازات]).
//
// التشغيل:
//   node scripts/faculty-archive/auto-link.mjs            # معاينة فقط (dry-run)
//   node scripts/faculty-archive/auto-link.mjs --apply    # حفظ الروابط
//   node scripts/faculty-archive/auto-link.mjs --leaves <study-leaves.json>
//
// لا يحذف ولا يعدّل أي رابط قائم، ويكتب فقط الروابط الجديدة.
// ============================================================================

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildAutoLinkPlan } from "../../src/utils/facultyAutoLinkPlan.js";

const APPLY = process.argv.includes("--apply");
const leavesArg = process.argv.indexOf("--leaves");
const leavesPath = leavesArg > -1 ? process.argv[leavesArg + 1] : null;

const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
}
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("❌ لم يتم العثور على VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY في .env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function selectAll(table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const [members, aliases, links] = await Promise.all([
  selectAll(
    "faculty_members",
    "id,member_code,full_name,full_name_normalized,job_title"
  ),
  selectAll("faculty_member_aliases", "id,member_id,alias,alias_normalized"),
  selectAll("faculty_member_links", "link_type,ref_table,ref_id"),
]);
const claims = await selectAll(
  "claims",
  "id,claimant_name,claim_number,claim_date,sheet_name,status,amount,data"
);
const issues = await selectAll(
  "issues",
  "id,case_number,case_title,case_description,status,created_at"
);

let studyLeaves = [];
if (leavesPath) {
  studyLeaves = JSON.parse(fs.readFileSync(leavesPath, "utf8"));
}

const plan = buildAutoLinkPlan({
  members,
  aliases,
  claims,
  issues,
  studyLeaves,
  existingLinks: links,
  sources: ["claim", "issue", "study_leave"],
});

const r = plan.report;
console.log("\n────────── تقرير الربط التلقائي ──────────");
console.log(`👥 أعضاء الأرشيف        : ${r.members}`);
console.log(`🎓 إجازات مستوردة        : ${studyLeaves.length}`);
console.log(`🔗 روابط موجودة مسبقًا   : ${r.existing}`);
console.log(`🔗 روابط جديدة           : ${plan.links.length}`);
console.log(`⚠️  تحتاج مراجعة          : ${r.needsReview}`);
console.log(`➖ بلا مطابقة             : ${r.noMatch}`);
Object.entries(r.sources).forEach(([type, s]) => {
  console.log(
    `\n• ${type}: مقروء ${s.scanned} | جديد ${s.linked} | موجود ${s.existing} | مراجعة ${s.needsReview} | بلا مطابقة ${s.noMatch}`
  );
  if (Object.keys(s.matchedBy).length) {
    console.log(`  طرق المطابقة: ${JSON.stringify(s.matchedBy)}`);
  }
});

const samples = plan.review.filter((item) => item.candidates.length).slice(0, 12);
if (samples.length) {
  console.log("\n⚠️  أمثلة تحتاج مراجعة (لم تُربط):");
  samples.forEach((item) => {
    console.log(`  • [${item.linkType}] ${item.name || item.label}`);
    item.candidates.slice(0, 3).forEach((c) => {
      console.log(`      - ${c.name} (#${c.code || "—"}) ${(c.score * 100).toFixed(1)}%`);
    });
  });
}

if (!APPLY) {
  console.log("\nℹ️  معاينة فقط. أضيفي --apply للحفظ.");
  process.exit(0);
}

const backupDir = `scripts/backup/faculty-links-${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.mkdirSync(backupDir, { recursive: true });
const allLinks = await selectAll("faculty_member_links", "*");
fs.writeFileSync(
  `${backupDir}/faculty_member_links.json`,
  JSON.stringify(allLinks, null, 2),
  "utf8"
);
console.log(`\n💾 نسخة احتياطية للروابط: ${backupDir} (${allLinks.length})`);

let created = 0;
const errors = [];
for (let i = 0; i < plan.links.length; i += 200) {
  const chunk = plan.links.slice(i, i + 200);
  const { error } = await supabase.from("faculty_member_links").upsert(chunk, {
    onConflict: "member_id,link_type,ref_table,ref_id",
    ignoreDuplicates: true,
  });
  if (error) errors.push(error.message);
  else created += chunk.length;
}

const { count, error: countError } = await supabase
  .from("faculty_member_links")
  .select("*", { count: "exact", head: true });
console.log(`✅ أُضيف ${created} رابطًا. إجمالي الروابط الآن: ${countError ? "?" : count}`);
if (errors.length) {
  console.log(`⚠️  أخطاء الكتابة (${errors.length}): ${errors[0]}`);
  process.exitCode = 1;
}
