// تفريغ التواريخ غير الصالحة (4 صفوف) مع نسخة احتياطية كاملة قبل التعديل.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const TARGETS = [
  { id: 378, key: "حتى تاريخ", expected: "2022-02-30" },
  { id: 462, key: "الى", expected: "2025-11-31" },
  { id: 510, key: "الى", expected: "2019-02-30" },
  { id: 511, key: "الى", expected: "2022-02-30" },
];

const { data: rows, error: readError } = await supabase
  .from("claims")
  .select("*")
  .in("id", TARGETS.map((t) => t.id));
if (readError) throw readError;
if (!rows || rows.length !== TARGETS.length) {
  throw new Error(`عدد الصفوف المقروءة ${rows?.length || 0} بدل ${TARGETS.length}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = path.join("scripts", "backup", `claims-invalid-dates-${stamp}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, "claims.ndjson"),
  rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  "utf8"
);
fs.writeFileSync(
  path.join(dir, "meta.json"),
  JSON.stringify({ savedAt: new Date().toISOString(), targets: TARGETS }, null, 2),
  "utf8"
);
console.log("backup:", dir, "rows:", rows.length);

for (const target of TARGETS) {
  const row = rows.find((item) => item.id === target.id);
  const actual = row?.data?.[target.key];
  if (actual !== target.expected) {
    throw new Error(
      `الصف ${target.id}: القيمة الحالية (${actual}) لا تطابق المتوقع (${target.expected})`
    );
  }
  const nextData = { ...row.data, [target.key]: null };
  const { data, error } = await supabase
    .from("claims")
    .update({ data: nextData, updated_at: new Date().toISOString() })
    .eq("id", target.id)
    .select("id,sheet_name,row_number,claimant_name,data")
    .single();
  if (error) throw error;
  console.log(
    "updated:",
    data.id,
    data.sheet_name,
    data.row_number,
    data.claimant_name,
    "|",
    target.key,
    "=>",
    data.data[target.key]
  );
}

const { data: after, error: afterError } = await supabase
  .from("claims")
  .select("id,data")
  .in("id", TARGETS.map((t) => t.id));
if (afterError) throw afterError;
const stillInvalid = TARGETS.filter((target) => {
  const row = after.find((item) => item.id === target.id);
  return row?.data?.[target.key] != null;
});
console.log("remaining invalid date cells:", stillInvalid.length);
