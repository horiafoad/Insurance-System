#!/usr/bin/env node
// Collapses the 29 per-table export statements into 2 single statements that
// each return ONE cell containing every table for that group.
//
// Why: the OLD project can only be read through the SQL Editor, which a human
// has to open. 29 copy/paste rounds is 29 chances to lose data. This makes it 2.
//
// Fidelity is unchanged from the per-table plan: every row is
// row_to_json(t)::text over "select t.*", so no column is named, none is
// dropped and no type is assumed. Strictly SELECT. No DDL, no writes.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLAN = join(HERE, '..', 'export-old-data', 'run-plan');
const manifest = existsSync(join(PLAN, 'manifest.json'))
  ? JSON.parse(readFileSync(join(PLAN, 'manifest.json'), 'utf8')) : { tables: [] };
const counts = new Map(manifest.tables.map((t) => [t.table, t.exact_count]));
if (!counts.size) { console.error('run-plan/manifest.json missing. Run generate.mjs first.'); process.exit(1); }

const SENSITIVE = new Set(['users', 'push_subscriptions']);
const all = [...counts.keys()];
const groups = [
  { name: 'A-sensitive', tables: all.filter((t) => SENSITIVE.has(t)) },
  { name: 'B-rest', tables: all.filter((t) => !SENSITIVE.has(t)) },
];

for (const g of groups) {
  if (!g.tables.length) continue;
  const rows = g.tables.reduce((a, t) => a + counts.get(t), 0);
  const sel = g.tables.map((t) => [
    `  select '${t}' as t,`,
    `         coalesce(string_agg(row_to_json(x)::text, E'\\n' order by to_jsonb(x)::text),`,
    `                  'EMPTY_TABLE ${t}') as nd`,
    `    from public.${t} x`,
  ].join('\n')).join('\n  union all\n');

  const sql = [
    `-- ============================================================================`,
    `-- ALL-IN-ONE READ-ONLY export  |  group ${g.name}  |  ${g.tables.length} tables  |  ${rows} rows`,
    `-- OLD project only. One statement, one result cell. Nothing is written.`,
    `--`,
    `-- Every row is row_to_json(t)::text over "select t.*": all columns, exact values,`,
    `-- no name guessed, none dropped. NULL, arrays, json, numeric and uuid are verbatim.`,
    `--`,
    `-- HOW TO USE`,
    `--   1. OLD project -> SQL Editor`,
    `--   2. paste this whole file, Run`,
    `--   3. copy the single "ndjson_all" cell`,
    `--   4. save it as  scripts/export-old-data/raw/${g.name}.txt   (UTF-8, one file)`,
    `--   5. run:  node scripts/migration/split-all-in-one.mjs`,
    `--`,
    `-- Tables and their authoritative expected row counts:`,
    ...g.tables.map((t) => `--   ${t.padEnd(28)} ${String(counts.get(t)).padStart(5)}`),
    g.name === 'A-sensitive'
      ? `--\n-- !! SENSITIVE: this cell contains real user credentials and push endpoints.\n--    Save the file locally only. Never paste it into chat, logs or a commit.`
      : `--\n-- No credentials in this group. Safe to paste into a private channel if needed.`,
    `-- ============================================================================`,
    `select string_agg('###TABLE ' || t || E'\\n' || nd || E'\\n###END ' || t, E'\\n' order by t) as ndjson_all`,
    `from (`,
    sel,
    `) s;`,
    ``,
  ].join('\n');

  const out = join(PLAN, `ALL-IN-ONE-${g.name}.sql`);
  writeFileSync(out, sql);
  console.log(`${g.name.padEnd(12)} ${String(g.tables.length).padStart(2)} tables  ${String(rows).padStart(5)} rows  -> ${out.split('\\').pop()}`);
}
console.log('\n2 SQL Editor runs total (was 29).');
console.log('then: node scripts/migration/split-all-in-one.mjs');
