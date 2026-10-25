// مسح كل بيانات الإجازات الدراسية (الجدول فقط) مع نسخة احتياطية كاملة على القرص.
// لا يحذف الجدول ولا أعمدته، ولا يمس المطالبات أو المرتبات أو المرفقات.
//
// التشغيل:
//   node scripts/study-leaves/clear-all.mjs
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function allRows() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("study_leaves")
      .select("*")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const rows = await allRows();
console.log("rows before:", rows.length);

const withPdf = rows.filter((r) => r.pdf_url);
if (withPdf.length) {
  console.error(
    `توقّف: ${withPdf.length} سجلًا بها مرفقات PDF. المسح سيفقد روابطها — احذفها أولًا أو وافق صراحة.`
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = path.join("scripts", "backup", `study-leaves-cleared-${stamp}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, "before-delete.json"),
  JSON.stringify(
    { savedAt: new Date().toISOString(), table: "study_leaves", count: rows.length, rows },
    null,
    2
  ),
  "utf8"
);
console.log("backup:", dir);

if (!rows.length) {
  console.log("لا توجد صفوف للمسح.");
} else {
  // حذف على دفعات بالمعرّف لتفادي أي حذف جماعي عشوائي.
  const ids = rows.map((r) => r.id);
  const CHUNK = 50;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("study_leaves")
      .delete()
      .in("id", batch)
      .select("id");
    if (error) throw error;
    deleted += data?.length || 0;
  }
  console.log("deleted:", deleted, "of", ids.length);
}

const remaining = await allRows();
console.log("rows after:", remaining.length);

const { data: columns, error: colError } = await supabase
  .from("study_leaves")
  .select("id")
  .limit(1);
if (colError) throw colError;
console.log("table still reachable, sample rows:", columns?.length || 0);

if (remaining.length) {
  console.error("لم يكتمل المسح — بقي", remaining.length, "صفًا.");
  process.exit(1);
}
console.log("OK: study_leaves cleared, schema intact.");
