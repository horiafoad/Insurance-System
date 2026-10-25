import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const stamp = Date.now().toString().slice(-8);
const fmt = (n) => Number(n).toFixed(2);

// 1) Claim without any installment plan (mirrors row 87 / row 99)
const { data: created, error: insErr } = await supabase
  .from("claims")
  .insert({
    sheet_name: "اختبار_مؤقت",
    row_number: 0,
    data: { "الاسم": "اختبار خطة " + stamp },
    claimant_name: "اختبار خطة " + stamp,
    amount: 529298.66,
    total_amount: 529298.66,
    paid_amount: 396974,
    remaining_amount: 132324.66,
    payment_status: "جاري السداد",
    file_name: "test",
  })
  .select()
  .single();
if (insErr) throw new Error("insert: " + insErr.message);
const id = created.id;
console.log("created:", id);

const { data: added, error: planErr } = await supabase.rpc(
  "claims_ensure_installment_plan",
  { p_claim_id: id }
);
if (planErr) throw new Error("plan: " + planErr.message);
console.log("installments added:", added);

let { data: inst } = await supabase
  .from("claim_installments")
  .select("installment_number, amount, paid")
  .eq("claim_id", id)
  .order("installment_number");
console.log("plan:", inst);

let { data: afterPlan } = await supabase
  .from("claims")
  .select("total_amount, paid_amount, remaining_amount, payment_status")
  .eq("id", id)
  .single();
console.log("after plan (must be unchanged):", afterPlan);
if (fmt(afterPlan.total_amount) !== "529298.66") throw new Error("total changed!");
if (fmt(afterPlan.paid_amount) !== "396974.00") throw new Error("paid changed!");
if (fmt(afterPlan.remaining_amount) !== "132324.66") throw new Error("remaining changed!");

// 2) Idempotency
const { data: addedAgain, error: plan2Err } = await supabase.rpc(
  "claims_ensure_installment_plan",
  { p_claim_id: id }
);
if (plan2Err) throw new Error("plan2: " + plan2Err.message);
console.log("second call added:", addedAgain);
if (Number(addedAgain) !== 0) throw new Error("plan not idempotent");

// 3) Pay the pending installment in full (UI: ensure -> getSummary -> pay -> restore)
const pending = inst.find((i) => !i.paid);
console.log("paying pending installment:", pending);

const { data: before } = await supabase
  .from("claims")
  .select("total_amount, paid_amount, remaining_amount")
  .eq("id", id)
  .single();
const originalTotal = Number(before.total_amount);
const originalPaid = Number(before.paid_amount);
const remaining = Number(before.remaining_amount);
const safeAmount = Math.min(Number(pending.amount), remaining);

const { error: payErr } = await supabase
  .from("claim_installments")
  .update({
    amount: safeAmount,
    paid: true,
    paid_at: new Date().toISOString(),
    receipt_number: "TEST-" + stamp,
  })
  .eq("claim_id", id)
  .eq("installment_number", pending.installment_number);
if (payErr) throw new Error("pay: " + payErr.message);

const newPaid = originalPaid + safeAmount;
const { error: restoreErr } = await supabase
  .from("claims")
  .update({
    total_amount: originalTotal,
    paid_amount: newPaid,
    remaining_amount: Math.max(0, originalTotal - newPaid),
  })
  .eq("id", id);
if (restoreErr) throw new Error("restore: " + restoreErr.message);

const { data: afterPay } = await supabase
  .from("claims")
  .select("total_amount, paid_amount, remaining_amount")
  .eq("id", id)
  .single();
console.log("after full pay (must be total 529298.66 / paid 529298.66 / remaining 0):", afterPay);
if (fmt(afterPay.total_amount) !== "529298.66") throw new Error("total lost after payment");
if (fmt(afterPay.remaining_amount) !== "0.00") throw new Error("remaining not zero");

// 4) Partial payment keeps total and computes remaining from real paid
const { data: part, error: partErr } = await supabase
  .from("claims")
  .insert({
    sheet_name: "اختبار_مؤقت",
    row_number: 0,
    data: {},
    claimant_name: "اختبار جزئي " + stamp,
    amount: 1000,
    total_amount: 1000,
    paid_amount: 0,
    remaining_amount: 1000,
    payment_status: "جاري السداد",
  })
  .select()
  .single();
if (partErr) throw new Error("insert part: " + partErr.message);

await supabase.rpc("claims_ensure_installment_plan", { p_claim_id: part.id });
const { data: partBefore } = await supabase
  .from("claims")
  .select("total_amount, paid_amount, remaining_amount")
  .eq("id", part.id)
  .single();

const partialAmount = 300;
const { error: partPayErr } = await supabase
  .from("claim_installments")
  .update({
    amount: partialAmount,
    paid: true,
    paid_at: new Date().toISOString(),
  })
  .eq("claim_id", part.id)
  .eq("installment_number", 1);
if (partPayErr) throw new Error("part pay: " + partPayErr.message);

const partNewPaid = Number(partBefore.paid_amount) + partialAmount;
await supabase
  .from("claims")
  .update({
    total_amount: Number(partBefore.total_amount),
    paid_amount: partNewPaid,
    remaining_amount: Math.max(0, Number(partBefore.total_amount) - partNewPaid),
  })
  .eq("id", part.id);

const { data: partAfter } = await supabase
  .from("claims")
  .select("total_amount, paid_amount, remaining_amount")
  .eq("id", part.id)
  .single();
console.log("after partial 300 of 1000:", partAfter);
if (fmt(partAfter.total_amount) !== "1000.00") throw new Error("partial total broken");
if (fmt(partAfter.paid_amount) !== "300.00") throw new Error("partial paid broken");
if (fmt(partAfter.remaining_amount) !== "700.00") throw new Error("partial remaining broken");

// 5) Re-open plan after partial payment (must exist for the 700 gap)
const { data: gapAdded, error: gapErr } = await supabase.rpc(
  "claims_ensure_installment_plan",
  { p_claim_id: part.id }
);
if (gapErr) throw new Error("gap plan: " + gapErr.message);
const { data: gapInst } = await supabase
  .from("claim_installments")
  .select("installment_number, amount, paid")
  .eq("claim_id", part.id)
  .order("installment_number");
console.log("gap added:", gapAdded, "plan now:", gapInst);

const { data: partAfterGap } = await supabase
  .from("claims")
  .select("total_amount, paid_amount, remaining_amount")
  .eq("id", part.id)
  .single();
console.log("after gap fill (total 1000 / paid 300 / remaining 700):", partAfterGap);
if (fmt(partAfterGap.total_amount) !== "1000.00") throw new Error("gap total broken");
if (fmt(partAfterGap.remaining_amount) !== "700.00") throw new Error("gap remaining broken");

// 6) Cleanup
const { error: delErr } = await supabase
  .from("claims")
  .delete()
  .in("id", [id, part.id]);
if (delErr) throw new Error("cleanup: " + delErr.message);
const { count } = await supabase.from("claims").select("*", { count: "exact", head: true });
const { count: instCount } = await supabase.from("claim_installments").select("*", { count: "exact", head: true });
console.log("after cleanup -> claims:", count, "installments:", instCount);
if (count !== 275 || instCount !== 43) throw new Error("data count drifted!");
console.log("ALL CHECKS PASSED");
