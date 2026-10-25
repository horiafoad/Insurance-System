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

export async function startPayment(claimId) {
  const { data: claim } = await supabase.from("claims").select("payment_status").eq("id", claimId).maybeSingle();
  if (!claim) throw new Error("مطالبة غير موجودة");
  if (claim.payment_status === PAYMENT_STATUS.IN_PROGRESS) return true;
  const { error } = await supabase.from("claims").update({ payment_status: PAYMENT_STATUS.IN_PROGRESS, started_at: new Date().toISOString() }).eq("id", claimId);
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

export async function payInstallment(claimId, installmentNumber, amount, paid = true, receiptNumber = null, paidAt = null, notes = null) {
  if (installmentNumber < 1 || installmentNumber > 4) throw new Error("رقم القسط غير صحيح");
  const { data: existing } = await supabase.from("claim_installments").select("*").eq("claim_id", claimId).eq("installment_number", installmentNumber).maybeSingle();
  const payload = {
    claim_id: claimId,
    installment_number: installmentNumber,
    amount: Number(amount) || 0,
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

export async function settleClaim(claimId, reason, notes = null) {
  const { error } = await supabase.rpc("claims_settle_claim", {
    p_claim_id: claimId,
    p_reason: reason,
    p_notes: notes,
  });
  if (error) throw error;
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
  if (Number(claim.remaining_amount) > 0) return false;
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
