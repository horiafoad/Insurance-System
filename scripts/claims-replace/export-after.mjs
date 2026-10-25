import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const dir = "scripts/backup/claims-replace-2026-10-25T12-06-03";
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
const w = (f, rows) => fs.writeFileSync(path.join(dir, f), rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
w("claims-after.ndjson", claims);
w("claim_installments-after.ndjson", installments);
const report = {
  importedAt: new Date().toISOString(),
  claims: claims.length,
  installments: installments.length,
  totalAmount: Math.round(claims.reduce((a, c) => a + Number(c.total_amount || 0), 0) * 100) / 100,
  paidAmount: Math.round(claims.reduce((a, c) => a + Number(c.paid_amount || 0), 0) * 100) / 100,
  remainingAmount: Math.round(claims.reduce((a, c) => a + Number(c.remaining_amount || 0), 0) * 100) / 100,
  perSheet: claims.reduce((m, c) => { m[c.sheet_name] = (m[c.sheet_name] || 0) + 1; return m; }, {}),
};
fs.writeFileSync(path.join(dir, "post-import-report.json"), JSON.stringify(report, null, 2), "utf8");
const hashes = {};
for (const f of fs.readdirSync(dir).filter(x => x !== "SHA256SUMS.json").sort()) {
  hashes[f] = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex");
}
fs.writeFileSync(path.join(dir, "SHA256SUMS.json"), JSON.stringify(hashes, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
