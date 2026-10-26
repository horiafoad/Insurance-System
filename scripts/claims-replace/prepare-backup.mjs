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
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = path.join("scripts", "backup", `claims-replace-${stamp}`);
fs.mkdirSync(dir, { recursive: true });

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const claims = await fetchAll("claims");
let installments = [];
let installmentsError = null;
try { installments = await fetchAll("claim_installments"); } catch (e) { installmentsError = e.message; }

const writeNdjson = (file, rows) => fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
writeNdjson(path.join(dir, "claims.ndjson"), claims);
writeNdjson(path.join(dir, "claim_installments.ndjson"), installments);

const sqlEscape = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
let restore = `-- Rollback script for claims replacement ${stamp}\n-- Generated from a live backup of ${env.VITE_SUPABASE_URL}\n-- WARNING: this removes all current claims and restores the backed-up rows.\n\nBEGIN;\n`;
restore += `DELETE FROM public.claim_installments;\nDELETE FROM public.claims;\n`;
if (claims.length) {
  const cols = Object.keys(claims[0]);
  for (const row of claims) {
    restore += `INSERT INTO public.claims (${cols.map(c => `"${c}"`).join(", ")}) VALUES (${cols.map(c => sqlEscape(row[c])).join(", ")});\n`;
  }
  restore += `SELECT setval('public.claims_id_seq', COALESCE((SELECT MAX(id) FROM public.claims), 1), (SELECT COUNT(*) > 0 FROM public.claims));\n`;
}
if (installments.length) {
  const cols = Object.keys(installments[0]);
  for (const row of installments) {
    restore += `INSERT INTO public.claim_installments (${cols.map(c => `"${c}"`).join(", ")}) VALUES (${cols.map(c => sqlEscape(row[c])).join(", ")});\n`;
  }
}
restore += `COMMIT;\n`;
fs.writeFileSync(path.join(dir, "restore.sql"), restore, "utf8");

const meta = {
  createdAt: new Date().toISOString(),
  projectUrl: env.VITE_SUPABASE_URL,
  claimsCount: claims.length,
  installmentsCount: installments.length,
  installmentsError,
  sourceFile: "C:/Users/DELL/Downloads/مطالبات (4).xlsx",
  note: "Backup taken before replacing claims with the new Excel file.",
};
fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(meta, null, 2), "utf8");

const files = fs.readdirSync(dir).sort();
const hashes = {};
for (const f of files) {
  hashes[f] = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex");
}
fs.writeFileSync(path.join(dir, "SHA256SUMS.json"), JSON.stringify(hashes, null, 2), "utf8");
console.log(JSON.stringify({ dir, meta, files }, null, 2));
