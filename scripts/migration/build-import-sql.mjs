#!/usr/bin/env node
// Builds one paste-ready INSERT script per table, from the NDJSON produced by
// scripts/export-old-data/ingest.mjs.
//
// Fidelity: the old side exported with row_to_json(t)::text and the new side
// rebuilds the row with jsonb_populate_record(null::public.<table>, ...). Those
// are exact inverses, so uuid / bigint / numeric / json / jsonb / arrays /
// timestamptz / NULL all round-trip with no JavaScript in the path and no
// hand-written column list or type cast.
//
// Tables are emitted in foreign-key order (parents first).
// It REFUSES to emit anything while any table's row count differs from the
// authoritative exact counts. No database connection is made.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPORT = join(HERE, '..', 'export-old-data');
const ND = join(EXPORT, 'ndjson');
const OUT = join(HERE, 'import-sql');

const manifest = existsSync(join(EXPORT, 'run-plan', 'manifest.json'))
  ? JSON.parse(readFileSync(join(EXPORT, 'run-plan', 'manifest.json'), 'utf8')) : { tables: [] };
const report = existsSync(join(ND, 'report.json'))
  ? JSON.parse(readFileSync(join(ND, 'report.json'), 'utf8')) : { tables: [] };
const counts = new Map(manifest.tables.map((t) => [t.table, t.exact_count]));

// ---------------------------------------------- FK order from the project's DDL
const ROOT = join(HERE, '..', '..');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const unq = (s) => s.replace(/^public\./i, '').replace(/["'`]/g, '').trim().toLowerCase();
const deps = new Map();
for (const f of readdirSync(ROOT).filter((x) => x.toLowerCase().endsWith('.sql'))) {
  const sql = strip(readFileSync(join(ROOT, f), 'utf8'));
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\n\s*\)\s*(?:with|;|tablespace)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const name = unq(m[1]);
    if (!deps.has(name)) deps.set(name, new Set());
    const inl = /references\s+(?:public\.)?["'`]?(\w+)["'`]?/gi;
    let r;
    while ((r = inl.exec(m[2]))) deps.get(name).add(unq(r[1]));
  }
}
const wanted = [...counts.keys()];
const inScope = new Set(wanted);
const ordered = [], done = new Set();
for (let guard = 0; guard < wanted.length + 2; guard++) {
  const ready = wanted.filter((t) => !done.has(t) && [...(deps.get(t) || [])].every((d) => !inScope.has(d) || done.has(d)));
  if (!ready.length) break;
  for (const t of ready) { ordered.push(t); done.add(t); }
}
for (const t of wanted) if (!done.has(t)) ordered.push(t);

// ---------------------------------------------------------------- validation
const problems = [];
for (const t of report.tables) {
  const exp = counts.get(t.table);
  if (exp === undefined) { problems.push(`${t.table}: not in exact counts`); continue; }
  if (t.rows !== exp) problems.push(`${t.table}: have ${t.rows} rows, exact count says ${exp}`);
  if (t.invalid_json) problems.push(`${t.table}: ${t.invalid_json} invalid JSON line(s)`);
}
const absent = wanted.filter((t) => !report.tables.some((r) => r.table === t));
for (const t of absent) problems.push(`${t}: no NDJSON produced yet (run ingest.mjs)`);

const totalExpected = wanted.reduce((a, t) => a + (counts.get(t) || 0), 0);
console.log(`tables in exact counts : ${wanted.length}`);
console.log(`rows to import         : ${totalExpected}`);
console.log(`ndjson files present   : ${report.tables.length}`);

if (problems.length) {
  console.log(`\nBLOCKED - ${problems.length} problem(s). Nothing emitted:`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log('\nFix by exporting the missing/short tables in the SQL Editor, then re-run');
  console.log('  node scripts/export-old-data/ingest.mjs');
  console.log('  node scripts/migration/build-import-sql.mjs');
  process.exit(1);
}

// ------------------------------------------------------------------- emit
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let emitted = 0;
for (const t of ordered) {
  const p = join(ND, `${t}.ndjson`);
  if (!existsSync(p)) continue;
  const lines = readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = '[' + lines.join(',\n') + ']';
  const sensitive = t === 'users' || t === 'push_subscriptions';
  writeFileSync(join(OUT, `${t}.sql`), [
    `-- =============================================================================`,
    `-- IMPORT into the NEW project only | table = ${t} | rows = ${lines.length}`,
    `-- exact count from OLD project: ${counts.get(t)}`,
    `-- order position: ${ordered.indexOf(t) + 1} of ${ordered.length} (parents first)`,
    sensitive ? `-- SENSITIVE: contains real credentials/endpoints. Do not paste into chat.` : `-- Safe to paste.`,
    `-- =============================================================================`,
    `begin;`,
    `insert into public.${t}`,
    `select (jsonb_populate_record(null::public.${t}, e.j)).*`,
    `from jsonb_array_elements($json$${rows}$json$) as e(j);`,
    `commit;`,
    `select '${t}' as imported, count(*) as rows_now from public.${t};`,
    ``,
  ].join('\n'));
  emitted++;
}
writeFileSync(join(OUT, 'ORDER.txt'), `Paste order (parents first):\n${ordered.map((t, i) => `${i + 1}. ${t}.sql   (${counts.get(t)} rows)`).join('\n')}\n`);
console.log(`\nemitted ${emitted} import script(s) -> scripts/migration/import-sql/`);
console.log(`paste order: scripts/migration/import-sql/ORDER.txt`);
