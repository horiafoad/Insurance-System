import { supabase } from "../supabaseClient";
import {
  PAYMENT_STATUS,
  normalizePaymentStatus,
  parseNumeric,
} from "./claimParsing";

export { PAYMENT_STATUS, normalizePaymentStatus, parseNumeric };

export function extractClaimIdentity(data) {
  const claimNumber = data?.["رقم المطالبة"] || data?.["رقم المطالبه"] || data?.["claimNumber"] || data?.["claim_number"] || null;
  const claimantName = data?.["اسم صاحب المطالبة"] || data?.["اسم المطالبة"] || data?.["claimantName"] || data?.["claimant_name"] || null;
  return {
    claimNumber: claimNumber ? String(claimNumber).trim() : null,
    claimantName: claimantName ? String(claimantName).trim() : null,
  };
}

export function extractTotalAmount(data) {
  return parseNumeric(
    data?.["مبلغ مطلوب"] || data?.["المبلغ"] || data?.["amount"] || data?.["total_amount"] || data?.["المبلغ الإجمالي"]
  );
}

export function extractInstallments(data) {
  const result = [];
  for (let i = 1; i <= 4; i++) {
    const key = `ق ${i}`;
    const val = data?.[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      result.push({ number: i, amount: parseNumeric(val) });
    }
  }
  return result;
}

export async function getClaimInstallments(claimId) {
  const { data, error } = await supabase
    .from("claim_installments")
    .select("*")
    .eq("claim_id", claimId)
    .order("installment_number", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function startPayment(claimId, actor = null) {
  const { data: claim } = await supabase.from("claims").select("payment_status").eq("id", claimId).maybeSingle();
  if (!claim) throw new Error("مطالبة غير موجودة");
  if (claim.payment_status === PAYMENT_STATUS.IN_PROGRESS) return true;
  const patch = {
    payment_status: PAYMENT_STATUS.IN_PROGRESS,
    started_at: new Date().toISOString(),
  };
  if (actor) patch.started_by = actor;
  const { error } = await supabase.from("claims").update(patch).eq("id", claimId);
  if (error) throw error;
  return true;
}

/**
 * يضمن وجود خطة أقساط تغطي إجمالي المطالبة قبل السداد.
 * ضروري لأن محفّز claims_recalc_amounts يعيد كتابة total_amount من مجموع
 * الأقساط، فأي مطالبة بلا خطة (أو بخطة ناقصة) تفقد إجماليها عند أول سداد.
 * الدالة idempotent وترجع عدد الأقساط التي أضافتها.
 */
export async function ensureInstallmentPlan(claimId) {
  const { data, error } = await supabase.rpc("claims_ensure_installment_plan", {
    p_claim_id: claimId,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export async function payInstallment(claimId, installmentNumber, amount, paid = true, receiptNumber = null, paidAt = null, notes = null, options = {}) {
  if (installmentNumber < 1 || installmentNumber > 4) throw new Error("رقم القسط غير صحيح");
  const { data: existing } = await supabase.from("claim_installments").select("*").eq("claim_id", claimId).eq("installment_number", installmentNumber).maybeSingle();

  // منع سداد القسط مرتين: التسجيل المكرر يحتاج «تصحيح السداد» صريحًا.
  if (existing?.paid && paid && !options.correct) {
    throw new Error(
      `القسط ${installmentNumber} مسدد بالفعل — لا يمكن سداده مرتين. استخدمي «تصحيح السداد» عند وجود خطأ.`
    );
  }

  const plannedAmount = Number(existing?.amount);
  const payload = {
    claim_id: claimId,
    installment_number: installmentNumber,
    amount:
      Number(amount) > 0
        ? Number(amount)
        : Number.isFinite(plannedAmount)
          ? plannedAmount
          : 0,
    paid,
    paid_at: paid ? (paidAt || new Date().toISOString()) : null,
    receipt_number: receiptNumber || null,
    notes: notes || null,
  };
  let error;
  if (existing) {
    ({ error } = await supabase.from("claim_installments").update(payload).eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("claim_installments").insert(payload));
  }
  if (error) throw error;
  return true;
}

/**
 * تصحيح سداد قسط مسدد: يُلغي تسجيل السداد (مع حفظ السبب والمستخدم في notes)
 * ثم يعيد المطالبة إلى «جاري السداد» لو كانت قد أُغلقت وصار عليها متبقٍ.
 * هذا هو المسار الوحيد المسموح لتعديل قسط مسدد — ولا يحذف القسط.
 */
export async function undoInstallmentPayment(claimId, installmentNumber, { user = null, reason = "" } = {}) {
  const actor = user?.full_name || user?.username || "مستخدم غير معروف";
  const { data: existing, error: loadError } = await supabase
    .from("claim_installments")
    .select("*")
    .eq("claim_id", claimId)
    .eq("installment_number", installmentNumber)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!existing) throw new Error("هذا القسط غير موجود.");
  if (!existing.paid) throw new Error("هذا القسط غير مسدد أصلًا.");

  const stamp = new Date().toISOString();
  const noteLine = `تصحيح سداد: أُلغي تسجيل السداد بواسطة ${actor} بتاريخ ${stamp}${
    String(reason || "").trim() ? ` — السبب: ${String(reason).trim()}` : ""
  }`;

  const { error } = await supabase
    .from("claim_installments")
    .update({
      paid: false,
      paid_at: null,
      receipt_number: null,
      notes: existing.notes ? `${existing.notes} | ${noteLine}` : noteLine,
    })
    .eq("id", existing.id);
  if (error) throw error;

  // المحفّز أعاد حساب المبالغ. لو كانت المطالبة «خالي الطرف» وصار عليها متبقٍ
  // نعيدها إلى «جاري السداد» بدل إبقائها مغلقة بالخطأ.
  const { data: claim } = await supabase
    .from("claims")
    .select("payment_status, remaining_amount")
    .eq("id", claimId)
    .maybeSingle();

  if (
    claim &&
    claim.payment_status === PAYMENT_STATUS.SETTLED &&
    Math.round(Number(claim.remaining_amount || 0) * 100) > 0
  ) {
    const { error: reopenError } = await supabase
      .from("claims")
      .update({
        payment_status: PAYMENT_STATUS.IN_PROGRESS,
        settled_at: null,
        settlement_reason: null,
      })
      .eq("id", claimId);
    if (reopenError) throw reopenError;
  }

  return true;
}

export async function settleClaim(claimId, reason, notes = null, actor = null) {
  const { error } = await supabase.rpc("claims_settle_claim", {
    p_claim_id: claimId,
    p_reason: reason,
    p_notes: notes,
  });
  if (error) throw error;
  if (actor) {
    const { error: actorError } = await supabase
      .from("claims")
      .update({ settled_by: actor })
      .eq("id", claimId);
    if (actorError) throw actorError;
  }
  return true;
}

/**
 * بعد سداد آخر قسط يصبح المتبقي صفرًا، فنغلق المطالبة تلقائيًا.
 * ترجع true إذا أصبحت المطالبة مسددة بالكامل.
 */
export async function closeClaimIfFullyPaid(claimId) {
  const { data: claim, error } = await supabase
    .from("claims")
    .select("remaining_amount, payment_status")
    .eq("id", claimId)
    .maybeSingle();
  if (error) throw error;
  if (!claim) return false;

  // شرط «خالي الطرف»: كل الأقساط مسددة AND المتبقي صفر بدقة العملة (قرشان).
  const installments = await getClaimInstallments(claimId);
  if (installments.length === 0) return false;
  if (installments.some((inst) => !inst.paid)) return false;

  const remainingCents = Math.round(Number(claim.remaining_amount || 0) * 100);
  if (remainingCents > 0) return false;
  if (claim.payment_status === PAYMENT_STATUS.SETTLED) return true;

  const { error: updateError } = await supabase
    .from("claims")
    .update({
      payment_status: PAYMENT_STATUS.SETTLED,
      settled_at: new Date().toISOString(),
      settlement_reason: "سداد كامل",
    })
    .eq("id", claimId);
  if (updateError) throw updateError;
  return true;
}

export async function getClaimSummary(claimId) {
  const { data: claim, error: ce } = await supabase.from("claims").select("*").eq("id", claimId).maybeSingle();
  if (ce) throw ce;
  if (!claim) return null;
  const installments = await getClaimInstallments(claimId);
  return { claim, installments };
}
