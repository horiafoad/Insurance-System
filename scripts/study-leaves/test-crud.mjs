// اختبار فعلي لدورة CRUD على جدول study_leaves + التحقق من صحة ملفات PDF.
// ينشئ سجلًا مؤقتًا واضح الاسم ثم يحذفه في النهاية (يعود العدد كما كان).
// التشغيل: node scripts/study-leaves/test-crud.mjs
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

let createdId = null;
try {
  const service = await server.ssrLoadModule("/src/services/studyLeavesService.js");
  const statusService = await server.ssrLoadModule(
    "/src/services/facultySalaryStatusService.js"
  );

  const before = await service.fetchStudyLeaves();
  console.log("rows before:", before.length);

  const created = await service.saveStudyLeaveRecord(
    {
      name: "اختبار مؤقت — حذف تلقائي",
      employeeCode: "TEST-DELETE-ME",
      jobTitle: "اختبار",
      leaveKind: "اختبار CRUD",
      orderNumber: "000123",
      orderDate: "2026-01-01",
      startDate: "2026-02-01",
      endDate: "2027-02-01",
      fiveYearEnd: "2031-02-01",
      salaryStatus: "",
      notes: "سجل اختبار آلي — يُحذف فورًا",
    },
    { user: { full_name: "اختبار آلي" } }
  );
  createdId = created.id;
  console.log("created:", created.id, "| code:", created.employeeCode, "| order:", created.orderNumber);

  const afterCreate = await service.fetchStudyLeaves();
  console.log("rows after create:", afterCreate.length);

  const updated = await service.setStudyLeaveSalaryStatus(created.id, "يوقف المرتب");
  console.log("updated salary status:", updated.salaryStatus);

  const edited = await service.saveStudyLeaveRecord(
    { ...updated, jobTitle: "اختبار معدّل" },
    { user: { full_name: "اختبار آلي" } }
  );
  console.log("edited job title:", edited.jobTitle);

  const statuses = await statusService.fetchFacultySalaryStatuses();
  console.log("salary status rows (read-only):", statuses.length);

  const pdfInvalid = service.validatePdfFile(
    new File([new Uint8Array([1, 2, 3])], "x.txt", { type: "text/plain" })
  );
  console.log("validate non-pdf:", pdfInvalid || "(accepted!)");
  const pdfOk = service.validatePdfFile(
    new File([new Uint8Array([1, 2, 3])], "x.pdf", { type: "application/pdf" })
  );
  console.log("validate pdf:", pdfOk || "(ok)");
} finally {
  try {
    if (createdId) {
      const service = await server.ssrLoadModule("/src/services/studyLeavesService.js");
      await service.deleteStudyLeaveRecord(createdId);
      const after = await service.fetchStudyLeaves();
      console.log("deleted temp record. rows after cleanup:", after.length);
      console.log(
        "temp record still exists?",
        after.some((row) => row.id === createdId)
      );
    }
  } catch (cleanupError) {
    console.error("CLEANUP FAILED:", cleanupError);
  }
  await server.close();
}
