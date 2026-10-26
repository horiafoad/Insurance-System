import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const stamp = Date.now().toString().slice(-8);
const { data: created, error: insErr } = await supabase
  .from("claims")
  .insert({
    sheet_name: "اختبار_مؤقت",
    row_number: 0,
    data: { "الاسم": "اختبار " + stamp, "مبلغ مطلوب": 1000 },
    claimant_name: "اختبار " + stamp,
    amount: 1000,
    total_amount: 1000,
    paid_amount: 0,
    remaining_amount: 1000,
    payment_status: "لم يسدد",
    file_name: "test",
  })
  .select()
  .single();
if (insErr) throw new Error("insert claim: " + insErr.message);
const id = created.id;
console.log("created claim", id);

const { error: i1 } = await supabase.from("claim_installments").upsert(
  { claim_id: id, installment_number: 1, amount: 500, paid: false },
  { onConflict: "claim_id,installment_number", ignoreDuplicates: true }
);
if (i1) throw new Error("inst1: " + i1.message);
const { error: i2 } = await supabase.from("claim_installments").upsert(
  { claim_id: id, installment_number: 2, amount: 500, paid: false },
  { onConflict: "claim_id,installment_number", ignoreDuplicates: true }
);
if (i2) throw new Error("inst2: " + i2.message);

let { data: afterInsert } = await supabase.from("claims").select("total_amount, paid_amount, remaining_amount, payment_status").eq("id", id).single();
console.log("after installments:", afterInsert);

// pay installment 1
const { error: payErr } = await supabase.from("claim_installments").upsert(
  { claim_id: id, installment_number: 1, amount: 500, paid: true, paid_at: new Date().toISOString().slice(0, 10), receipt_number: "TEST-1" },
  { onConflict: "claim_id,installment_number", ignoreDuplicates: false }
);
if (payErr) throw new Error("pay: " + payErr.message);
let { data: afterPay } = await supabase.from("claims").select("total_amount, paid_amount, remaining_amount").eq("id", id).single();
console.log("after pay #1:", afterPay);

// pay installment 2 -> should zero remaining
const { error: payErr2 } = await supabase.from("claim_installments").upsert(
  { claim_id: id, installment_number: 2, amount: 500, paid: true, paid_at: new Date().toISOString().slice(0, 10), receipt_number: "TEST-2" },
  { onConflict: "claim_id,installment_number", ignoreDuplicates: false }
);
if (payErr2) throw new Error("pay2: " + payErr2.message);
let { data: afterPay2 } = await supabase.from("claims").select("total_amount, paid_amount, remaining_amount, payment_status").eq("id", id).single();
console.log("after pay #2:", afterPay2);

// closeClaimIfFullyPaid equivalent
if (Number(afterPay2.remaining_amount) <= 0 && afterPay2.payment_status !== "خالي الطرف") {
  const { error } = await supabase.from("claims").update({
    payment_status: "خالي الطرف",
    settled_at: new Date().toISOString(),
    settlement_reason: "سداد كامل",
  }).eq("id", id);
  if (error) throw new Error("close: " + error.message);
}
const { data: closed } = await supabase.from("claims").select("payment_status, settled_at, settlement_reason").eq("id", id).single();
console.log("closed:", closed);

// settle RPC on a fresh claim with remaining
const { data: claim2, error: e2 } = await supabase.from("claims").insert({
  sheet_name: "اختبار_مؤقت", row_number: 0, data: {}, claimant_name: "اختبار تسوية " + stamp,
  amount: 100, total_amount: 100, paid_amount: 0, remaining_amount: 100, payment_status: "جاري السداد",
}).select().single();
if (e2) throw new Error("insert2: " + e2.message);
const { error: settleErr } = await supabase.rpc("claims_settle_claim", { p_claim_id: claim2.id, p_reason: "تنازل", p_notes: "اختبار" });
if (settleErr) throw new Error("settle: " + settleErr.message);
const { data: settled } = await supabase.from("claims").select("payment_status, settlement_reason, remaining_amount").eq("id", claim2.id).single();
console.log("settled:", settled);

// cleanup
const { error: delErr } = await supabase.from("claims").delete().in("id", [id, claim2.id]);
if (delErr) throw new Error("cleanup: " + delErr.message);
const { count } = await supabase.from("claims").select("*", { count: "exact", head: true });
const { count: instCount } = await supabase.from("claim_installments").select("*", { count: "exact", head: true });
console.log("after cleanup -> claims:", count, "installments:", instCount);
