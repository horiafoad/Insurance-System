// تحليل ملف الإجازات الجديد ومقارنته بقاعدة البيانات - قراءة فقط.
import fs from "node:fs";
import * as XLSX from "xlsx";
import { analyzeStudyLeavesWorkbook } from "../../src/dashboard/studyLeaves.js";
import { createClient } from "@supabase/supabase-js";

const SRC = "F:/system/الاجازات الدراسيه.xlsx";
const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const wb = XLSX.read(fs.readFileSync(SRC), { type: "buffer", cellDates: true });
const { sheetName, leaves, report } = analyzeStudyLeavesWorkbook(wb);

const codes = leaves.map((l) => l.employeeCode).filter(Boolean);
const keyOf = (l) => `${String(l.employeeCode || "").trim()}|${String(l.startDate || "").trim()}`;

async function all(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const db = await all("study_leaves");
const dbByKey = new Map(db.map((r) => [`${String(r.employee_code || "").trim()}|${String(r.start_date || "").trim()}`, r]));
const dbByCode = new Map();
for (const r of db) {
  const code = String(r.employee_code || "").trim();
  if (!code) continue;
  const list = dbByCode.get(code) || [];
  list.push(r);
  dbByCode.set(code, list);
}

const fileKeys = leaves.map(keyOf);
const matched = fileKeys.filter((k) => dbByKey.has(k));
const unmatched = leaves.filter((l) => !dbByKey.has(keyOf(l)));
const unmatchedByCode = unmatched.filter((l) => dbByCode.has(String(l.employeeCode || "").trim()));
const newRows = unmatched.filter((l) => !dbByCode.has(String(l.employeeCode || "").trim()));
const dbMissing = db.filter((r) => !fileKeys.includes(`${String(r.employee_code || "").trim()}|${String(r.start_date || "").trim()}`));

const salaryStatuses = leaves.reduce((acc, l) => {
  const key = l.salaryStatus || "(فارغ)";
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const summary = {
  source: SRC,
  sheetName,
  file: {
    rows: leaves.length,
    uniqueCodes: new Set(codes).size,
    uniqueNames: new Set(leaves.map((l) => l.name).filter(Boolean)).size,
    salaryStatuses,
    withPdfInDbByKey: matched.filter((k) => dbByKey.get(k)?.pdf_url).length,
    missingCode: leaves.filter((l) => !l.employeeCode).length,
    missingStart: leaves.filter((l) => !l.startDate).length,
    missingEnd: leaves.filter((l) => !l.endDate).length,
    missingFiveYear: leaves.filter((l) => !l.fiveYearEnd).length,
    invalidDates: report.invalidDates,
    duplicates: report.duplicates,
    skippedRows: report.skippedRows,
    unknownColumns: report.unknownColumns,
    missingColumns: report.missingColumns,
  },
  db: {
    rows: db.length,
    withPdf: db.filter((r) => r.pdf_url).length,
    matchedByCodeAndStart: matched.length,
    unmatchedFileRows: unmatched.length,
    unmatchedButSameCode: unmatchedByCode.length,
    brandNewByCode: newRows.length,
    dbRowsNotInFile: dbMissing.length,
  },
  unmatched: unmatched.map((l) => ({
    serial: l.serial,
    code: l.employeeCode,
    name: l.name,
    start: l.startDate,
    end: l.endDate,
    sameCodeInDb: (dbByCode.get(String(l.employeeCode || "").trim()) || []).map((r) => ({ id: r.id, start: r.start_date, end: r.end_date, name: r.name })),
  })),
  dbRowsNotInFile: dbMissing.map((r) => ({ id: r.id, code: r.employee_code, name: r.name, start: r.start_date, end: r.end_date, pdf: Boolean(r.pdf_url) })),
};

fs.writeFileSync("scripts/study-leaves/new-file-analysis.json", JSON.stringify({ summary, leaves }, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
