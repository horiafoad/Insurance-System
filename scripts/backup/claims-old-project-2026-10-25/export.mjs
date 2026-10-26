import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const dir = "scripts/backup/claims-old-project-2026-10-25";
const cmd = 'supabase db query "select jsonb_agg(to_jsonb(c) order by c.id) as rows from public.claims c;" --linked --project-ref jpybzalxcezxhokzmwdx';
const buf = execSync(cmd, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
const raw = buf.toString("utf8");
const start = raw.indexOf("{");
const parsed = JSON.parse(raw.slice(start));
const rows = parsed.rows?.[0]?.rows;
if (!Array.isArray(rows)) throw new Error("unexpected shape");
fs.writeFileSync(`${dir}/raw-export.json`, raw.slice(start), "utf8");
const lines = rows.map((r) => JSON.stringify(r));
fs.writeFileSync(`${dir}/claims.ndjson`, lines.join("\n") + "\n", "utf8");
const canonical = (o) => JSON.stringify(o, Object.keys(o).sort());
const hash = crypto.createHash("sha256").update(rows.map(canonical).join("\n")).digest("hex");
const bySheet = {};
for (const r of rows) bySheet[r.sheet_name] = (bySheet[r.sheet_name] || 0) + 1;
const meta = {
  exportedAt: new Date().toISOString(),
  projectRef: "jpybzalxcezxhokzmwdx",
  source: "public.claims (live export via Supabase Management API, UTF-8)",
  rows: rows.length,
  minId: Math.min(...rows.map((r) => Number(r.id))),
  maxId: Math.max(...rows.map((r) => Number(r.id))),
  bySheet,
  fileNames: [...new Set(rows.map((r) => r.file_name))],
  rowsWithPdf: rows.filter((r) => r.pdf_url).length,
  sha256Canonical: hash,
  fileSha256: crypto.createHash("sha256").update(fs.readFileSync(`${dir}/claims.ndjson`)).digest("hex"),
};
fs.writeFileSync(`${dir}/metadata.json`, JSON.stringify(meta, null, 2), "utf8");
console.log(JSON.stringify(meta, null, 2));
