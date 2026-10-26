import fs from "node:fs";
const dir = "scripts/backup/claims-old-project-2026-10-25";
const read = (p) => fs.readFileSync(p, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const norm = (rows) => rows.map((r) => JSON.stringify(r, Object.keys(r).sort())).sort();
const fresh = read(`${dir}/claims.ndjson`);
const a = norm(fresh);
for (const p of ["scripts/backup/claims-backup-20261021-222738.ndjson", "scripts/export-old-data/ndjson/claims.ndjson"]) {
  const b = norm(read(p));
  const same = a.length === b.length && a.every((v, i) => v === b[i]);
  console.log(`${p}: rows=${b.length} identical=${same}`);
}
console.log("fresh rows:", fresh.length);
