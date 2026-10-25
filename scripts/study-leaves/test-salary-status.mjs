// اختبار فعلي لدورة إيقاف/إعادة تفعيل المرتب على سجل مؤقت يُحذف في النهاية.
// لا يمس faculty_salary_archive ولا أي ملفات.
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

const checks = [];
const check = (label, passed, details = "") => {
  checks.push({ label, passed: Boolean(passed) });
  console.log(`${passed ? "PASS" : "FAIL"} — ${label}${details ? ` (${details})` : ""}`);
};

const TEMP = {
  facultyName: "اختبار مؤقت — حذف تلقائي",
  computerNumber: "TEST-SALARY-999",
};

let createdRow = false;
try {
  const { supabase } = await server.ssrLoadModule("/src/supabaseClient.js");
  const service = await server.ssrLoadModule(
    "/src/services/facultySalaryStatusService.js"
  );

  const before = await service.fetchFacultySalaryStatuses();
  console.log("status rows before:", before.length);

  const stopped = await service.stopFacultySalary({
    ...TEMP,
    reason: "اختبار الإيقاف",
    user: { full_name: "اختبار آلي" },
  });
  createdRow = true;
  check(
    "الإيقاف يسجل الحالة والتاريخ والمستخدم والسبب",
    stopped.status === "stopped" &&
      Boolean(stopped.stoppedAt) &&
      stopped.stoppedBy === "اختبار آلي" &&
      stopped.stopReason === "اختبار الإيقاف",
    JSON.stringify({ status: stopped.status, by: stopped.stoppedBy })
  );

  const map = service.indexSalaryStatuses(
    await service.fetchFacultySalaryStatuses()
  );
  check(
    "الخريطة تعرض العضو كموقوف",
    map[service.salaryMemberKey(TEMP.facultyName, TEMP.computerNumber)]
      ?.status === "stopped"
  );

  const reactivated = await service.reactivateFacultySalary({
    ...TEMP,
    user: { full_name: "اختبار آلي" },
  });
  check(
    "إعادة التفعيل تسجل الحالة والتاريخ والمستخدم",
    reactivated.status === "active" &&
      Boolean(reactivated.reactivatedAt) &&
      reactivated.reactivatedBy === "اختبار آلي",
    JSON.stringify({ status: reactivated.status })
  );

  const { count: archiveCount } = await supabase
    .from("faculty_salary_archive")
    .select("id", { count: "exact", head: true });
  check(
    "أرشيف المرتبات لم يُمس",
    Number(archiveCount) === 0,
    `rows=${archiveCount}`
  );
} finally {
  try {
    if (createdRow) {
      const { supabase } = await server.ssrLoadModule("/src/supabaseClient.js");
      await supabase
        .from("faculty_salary_status")
        .delete()
        .eq("faculty_name", TEMP.facultyName)
        .eq("computer_number", TEMP.computerNumber);
      const { data: leftovers } = await supabase
        .from("faculty_salary_status")
        .select("id")
        .eq("faculty_name", TEMP.facultyName);
      check("حذف سجل الاختبار", (leftovers || []).length === 0);
    }
  } catch (cleanupError) {
    console.error("CLEANUP FAILED:", cleanupError);
  }
  await server.close();

  const failed = checks.filter((item) => !item.passed);
  console.log(
    `\nالنتيجة: ${checks.length - failed.length}/${checks.length} اختبار ناجح`
  );
  if (failed.length > 0) {
    console.error("فشل:", failed.map((item) => item.label).join(" | "));
    process.exitCode = 1;
  }
}
