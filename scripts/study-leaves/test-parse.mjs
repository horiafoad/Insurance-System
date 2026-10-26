// اختبار فعلي لمحلّل الإجازات الدراسية على ملف Excel الحقيقي.
// التشغيل: node scripts/study-leaves/test-parse.mjs "F:\\system\\الاجازات الدراسيه.xlsx"
import fs from "node:fs";
import * as XLSX from "xlsx";
import { createServer } from "vite";

const filePath = process.argv[2] || "F:\\system\\الاجازات الدراسيه.xlsx";
if (!fs.existsSync(filePath)) {
  console.error("الملف غير موجود:", filePath);
  process.exit(1);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const mod = await server.ssrLoadModule("/src/dashboard/studyLeaves.js");
  const workbook = XLSX.read(fs.readFileSync(filePath), {
    type: "buffer",
    cellDates: true,
  });
  const analysis = mod.analyzeStudyLeavesWorkbook(workbook);

  console.log("sheet:", analysis.sheetName);
  console.log("imported rows:", analysis.report.importedRows);
  console.log("skipped rows:", analysis.report.skippedRows.length);
  console.log("unknown columns:", JSON.stringify(analysis.report.unknownColumns));
  console.log("missing columns:", JSON.stringify(analysis.report.missingColumns));
  console.log("duplicates:", JSON.stringify(analysis.report.duplicates));
  console.log("invalid dates:", JSON.stringify(analysis.report.invalidDates));
  console.log("missing values:", JSON.stringify(analysis.report.missingValues));
  console.log("salary status:", JSON.stringify(analysis.report.salaryStatusCounts));

  const first = analysis.leaves[0];
  console.log("\nfirst row:", JSON.stringify({
    serial: first.serial,
    employeeCode: first.employeeCode,
    name: first.name,
    jobTitle: first.jobTitle,
    orderNumber: first.orderNumber,
    orderDate: first.orderDate,
    orderNote: first.orderNote,
    startDate: first.startDate,
    endDate: first.endDate,
    fiveYearEnd: first.fiveYearEnd,
    salaryStatus: first.salaryStatus,
  }, null, 2));

  const bad = analysis.leaves.filter((leave) => !/^[0-9-]+$/.test(leave.employeeCode));
  console.log("\nrows with non-latin employee code:", bad.length);
  const noStart = analysis.leaves.filter((leave) => !leave.startDate).length;
  console.log("rows without start date:", noStart);
  const paying = analysis.leaves.filter((leave) => leave.salaryStatus === "يصرف المرتب").length;
  const stopped = analysis.leaves.filter((leave) => leave.salaryStatus === "يوقف المرتب" || leave.salaryStatus === "بدون مرتب").length;
  const unset = analysis.leaves.filter((leave) => !leave.salaryStatus).length;
  console.log("salary paying/stopped/unset:", paying, stopped, unset);
  console.log("stats:", JSON.stringify(mod.getLeaveStats(analysis.leaves)));
} finally {
  await server.close();
}
