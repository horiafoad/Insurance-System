// استيراد فعلي لبيانات الإجازات الدراسية من Excel إلى جدول study_leaves.
// يأخذ نسخة احتياطية على القرص قبل الاستبدال، ثم يتحقق من النتيجة.
//
// التشغيل:
//   node scripts/study-leaves/import-db.mjs "F:\\system\\الاجازات الدراسيه.xlsx"
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { createServer } from "vite";

const filePath = process.argv[2] || "F:\\system\\الاجازات الدراسيه.xlsx";
if (!fs.existsSync(filePath)) {
  console.error("الملف غير موجود:", filePath);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupDir = path.join("scripts", "backup", `study-leaves-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const parser = await server.ssrLoadModule("/src/dashboard/studyLeaves.js");
  const service = await server.ssrLoadModule("/src/services/studyLeavesService.js");
  const { supabase } = await server.ssrLoadModule("/src/supabaseClient.js");

  const workbook = XLSX.read(fs.readFileSync(filePath), {
    type: "buffer",
    cellDates: true,
  });
  const analysis = parser.analyzeStudyLeavesWorkbook(workbook);
  console.log("parsed rows:", analysis.leaves.length);

  const before = await service.fetchStudyLeaveRowsRaw();
  fs.writeFileSync(
    path.join(backupDir, "before.json"),
    JSON.stringify({ savedAt: new Date().toISOString(), count: before.length, rows: before }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(backupDir, "parsed-import.json"),
    JSON.stringify(analysis.leaves, null, 2),
    "utf8"
  );
  console.log("backup before.json rows:", before.length);

  const { leaves } = await service.replaceStudyLeaves(analysis.leaves, {
    user: { full_name: "استيراد سكربت" },
  });
  console.log("rows after import:", leaves.length);

  const after = await service.fetchStudyLeaveRowsRaw();
  fs.writeFileSync(
    path.join(backupDir, "after.json"),
    JSON.stringify({ savedAt: new Date().toISOString(), count: after.length, rows: after }, null, 2),
    "utf8"
  );

  const codes = leaves.map((leave) => leave.employeeCode).filter(Boolean);
  const unique = new Set(codes);
  console.log("unique employee codes:", unique.size, "of", leaves.length);

  // تحقق من مطابقة الأكواد مع السجل المركزي.
  const members = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("faculty_members")
      .select("member_code")
      .range(from, from + 999);
    if (error) throw error;
    members.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const memberCodes = new Set(members.map((m) => String(m.member_code || "").trim()));
  const matched = codes.filter((code) => memberCodes.has(code)).length;
  console.log("member_code matches:", matched, "of", codes.length);

  console.log("with PDF:", leaves.filter((leave) => leave.hasPdf).length);
  console.log("salary paying/stopped/unset:", leaves.filter((l) => l.salaryStatus === "يصرف المرتب").length, leaves.filter((l) => ["يوقف المرتب", "بدون مرتب"].includes(l.salaryStatus)).length, leaves.filter((l) => !l.salaryStatus).length);
  console.log("backup dir:", backupDir);
} finally {
  await server.close();
}
