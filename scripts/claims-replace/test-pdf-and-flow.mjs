// اختبار فعلي لتدفق المطالبات على سجل مؤقت (يُحذف في النهاية).
// لا يلمس أي مطالبة إنتاجية.
//
// يغطي:
//   • تحويل المطالبة إلى «جاري السداد» مع تسجيل التاريخ والمستخدم.
//   • إنشاء 4 أقساط موزعة بدقة، مع تاريخ استحقاق شهري، وبلا تكرار.
//   • منع سداد القسط مرتين.
//   • عدم الإغلاق قبل سداد كل الأقساط، والإغلاق عند اكتمالها.
//   • تصحيح السداد (إلغاء سداد قسط) وإعادة فتح المطالبة ثم إغلاقها مجددًا.
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

const checks = [];
const check = (label, passed, details = "") => {
  checks.push({ label, passed: Boolean(passed), details });
  console.log(`${passed ? "PASS" : "FAIL"} — ${label}${details ? ` (${details})` : ""}`);
};

const expectError = async (fn) => {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
};

let claimId = null;
try {
  const { supabase } = await server.ssrLoadModule("/src/supabaseClient.js");
  const installments = await server.ssrLoadModule(
    "/src/services/claimInstallmentsService.js"
  );
  const docs = await server.ssrLoadModule("/src/services/claimDocumentsService.js");

  const { data: claim, error } = await supabase
    .from("claims")
    .insert({
      sheet_name: "اختبار آلي",
      claimant_name: "اختبار مؤقت — حذف تلقائي",
      row_number: 999999,
      amount: 1000,
      total_amount: 1000,
      payment_status: "لم يسدد",
      data: { note: "temp" },
    })
    .select()
    .single();
  if (error) throw error;
  claimId = claim.id;
  console.log("temp claim:", claimId, "| status:", claim.payment_status);

  /* 1) التحويل إلى جاري السداد */
  await installments.startPayment(claimId, "اختبار آلي");
  const { data: started } = await supabase
    .from("claims")
    .select("payment_status, started_at, started_by")
    .eq("id", claimId)
    .single();
  check(
    "startPayment يسجل الحالة والتاريخ والمستخدم",
    started.payment_status === "جاري السداد" &&
      Boolean(started.started_at) &&
      started.started_by === "اختبار آلي",
    JSON.stringify({ status: started.payment_status, by: started.started_by })
  );

  /* 2) خطة الأقساط الأربعة */
  const created = await installments.ensureInstallmentPlan(claimId);
  const plan = await installments.getClaimInstallments(claimId);
  const planSum = plan.reduce((sum, inst) => sum + Number(inst.amount), 0);
  check("إنشاء 4 أقساط", plan.length === 4, `created=${created}, count=${plan.length}`);
  check("مجموع الأقساط = إجمالي المطالبة", planSum === 1000, `sum=${planSum}`);
  check(
    "توزيع عادل 250 لكل قسط",
    plan.every((inst) => Number(inst.amount) === 250),
    plan.map((inst) => inst.amount).join(" | ")
  );
  check(
    "تاريخ استحقاق لكل قسط (شهري)",
    plan.every((inst) => Boolean(inst.due_date)) &&
      new Set(plan.map((inst) => inst.due_date)).size === 4,
    plan.map((inst) => inst.due_date).join(" | ")
  );

  const secondRun = await installments.ensureInstallmentPlan(claimId);
  const planAgain = await installments.getClaimInstallments(claimId);
  check(
    "لا تكرار للأقساط عند إعادة التحويل",
    secondRun === 0 && planAgain.length === 4,
    `added=${secondRun}, count=${planAgain.length}`
  );

  /* 3) سداد أول قسط */
  const first = planAgain.find((inst) => inst.installment_number === 1);
  await installments.payInstallment(
    claimId,
    1,
    Number(first.amount),
    true,
    "R-1"
  );
  let closed = await installments.closeClaimIfFullyPaid(claimId);
  check("لا يُغلق بعد سداد قسط واحد من أربعة", closed === false, `closed=${closed}`);

  /* 4) منع السداد المكرر */
  const duplicateError = await expectError(() =>
    installments.payInstallment(claimId, 1, Number(first.amount), true, "R-1-DUP")
  );
  check(
    "منع سداد القسط مرتين",
    Boolean(duplicateError),
    duplicateError?.message || "لم يُمنع!"
  );

  /* 5) سداد بقية الأقساط */
  for (const number of [2, 3, 4]) {
    const inst = planAgain.find((item) => item.installment_number === number);
    await installments.payInstallment(
      claimId,
      number,
      Number(inst.amount),
      true,
      `R-${number}`
    );
    const partial = await installments.closeClaimIfFullyPaid(claimId);
    if (number < 4) {
      check(
        `لا يُغلق بعد سداد ${number} من أربعة`,
        partial === false,
        `closed=${partial}`
      );
    } else {
      check("يُغلق بعد سداد الأقساط الأربعة", partial === true, `closed=${partial}`);
    }
  }

  const { data: finalClaim } = await supabase
    .from("claims")
    .select(
      "payment_status, total_amount, paid_amount, remaining_amount, settled_at"
    )
    .eq("id", claimId)
    .single();
  check(
    "المطالبة صارت «خالي الطرف» والمتبقي صفر",
    finalClaim.payment_status === "خالي الطرف" &&
      Number(finalClaim.remaining_amount) === 0 &&
      Number(finalClaim.paid_amount) === 1000 &&
      Number(finalClaim.total_amount) === 1000,
    JSON.stringify(finalClaim)
  );

  /* 6) تصحيح السداد */
  await installments.undoInstallmentPayment(claimId, 3, {
    user: { full_name: "اختبار آلي" },
    reason: "اختبار التصحيح",
  });
  const { data: reopened } = await supabase
    .from("claims")
    .select("payment_status, paid_amount, remaining_amount, settled_at")
    .eq("id", claimId)
    .single();
  check(
    "تصحيح السداد يعيد فتح المطالبة للمتبقي",
    reopened.payment_status === "جاري السداد" &&
      Number(reopened.remaining_amount) === 250 &&
      reopened.settled_at === null,
    JSON.stringify(reopened)
  );

  const corrected = await installments.getClaimInstallments(claimId);
  const inst3 = corrected.find((inst) => inst.installment_number === 3);
  check(
    "القسط المصحح غير مسدد ومحفوظ السبب في الملاحظات",
    inst3.paid === false && String(inst3.notes || "").includes("تصحيح")
  );

  await installments.payInstallment(claimId, 3, Number(inst3.amount), true, "R-3B");
  const reclosed = await installments.closeClaimIfFullyPaid(claimId);
  check("إعادة السداد بعد التصحيح تُغلق المطالبة", reclosed === true);

  /* 7) ملفات PDF */
  console.log(
    "pdf validation (txt):",
    docs.validateClaimPdf({ name: "a.txt", type: "text/plain", size: 10 })
  );
  check(
    "رفض ملف غير PDF",
    Boolean(
      docs.validateClaimPdf({ name: "a.txt", type: "text/plain", size: 10 })
    )
  );
  check(
    "قبول ملف PDF",
    docs.validateClaimPdf({ name: "a.pdf", type: "application/pdf", size: 10 }) === ""
  );
  const attachError = await expectError(() =>
    docs.attachClaimPdf(claim, { name: "a.pdf", type: "application/pdf", size: 10 }, {})
  );
  check(
    "الرفع خارج تطبيق الديسكتوب يفشل برسالة واضحة",
    String(attachError?.message || "").includes("الديسكتوب"),
    attachError?.message || ""
  );

  /* 8) عدم المساس بالمطالبات الإنتاجية */
  const { data: otherClaims } = await supabase
    .from("claims")
    .select("id")
    .neq("sheet_name", "اختبار آلي");
  check(
    "المطالبات الإنتاجية لم تُمس (275)",
    otherClaims.length === 275,
    `count=${otherClaims.length}`
  );
} finally {
  try {
    if (claimId) {
      const { supabase } = await server.ssrLoadModule("/src/supabaseClient.js");
      await supabase.from("claims").delete().eq("id", claimId);
      const { data: leftovers } = await supabase
        .from("claims")
        .select("id")
        .eq("id", claimId);
      const { data: leftoverInst } = await supabase
        .from("claim_installments")
        .select("id")
        .eq("claim_id", claimId);
      check(
        "حذف السجل المؤقت بالكامل",
        leftovers.length === 0 && leftoverInst.length === 0,
        `claims=${leftovers.length}, installments=${leftoverInst.length}`
      );
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
