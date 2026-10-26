import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
async function all(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(table + ": " + error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const claims = await all("claims");
const installments = await all("claim_installments");
const byId = new Map(claims.map(c => [c.id, c]));
const perSheet = {};
for (const c of claims) perSheet[c.sheet_name] = (perSheet[c.sheet_name] || 0) + 1;
const dup = {};
for (const c of claims) { const k = c.sheet_name + "||" + c.row_number; dup[k] = (dup[k] || 0) + 1; }
const dupKeys = Object.entries(dup).filter(([, n]) => n > 1);
const instByClaim = {};
for (const i of installments) (instByClaim[i.claim_id] ||= []).push(i);
const sum = (arr, k) => Math.round(arr.reduce((a, x) => a + Number(x[k] || 0), 0) * 100) / 100;
const claimSum = sum(claims, "total_amount");
const paidSum = sum(claims, "paid_amount");
const remSum = sum(claims, "remaining_amount");
const badInst = claims.filter(c => {
  const list = instByClaim[c.id] || [];
  if (!list.length) return false;
  const s = Math.round(list.reduce((a, i) => a + Number(i.amount), 0) * 100) / 100;
  return Math.abs(s - Number(c.total_amount)) > 0.02;
}).map(c => ({ id: c.id, name: c.claimant_name, total: c.total_amount, instSum: (instByClaim[c.id] || []).reduce((a, i) => a + Number(i.amount), 0) }));
const missingData = claims.filter(c => !c.data || !c.data["الاسم"] || c.data["مبلغ مطلوب"] === undefined && c.data["المبلغ"] === undefined);
const sample = claims.filter(c => (c.sheet_name === "جاري السداد" && [87, 99].includes(c.row_number))).map(c => ({ id: c.id, row: c.row_number, name: c.claimant_name, total: c.total_amount, paid: c.paid_amount, remaining: c.remaining_amount, status: c.payment_status, installments: instByClaim[c.id] || [] }));
console.log(JSON.stringify({ claims: claims.length, installments: installments.length, perSheet, claimSum, paidSum, remSum, dupKeys: dupKeys.length, badInst, missingData: missingData.length, sample }, null, 2));
