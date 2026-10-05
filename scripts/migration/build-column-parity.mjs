// Generates the ADD COLUMN statements needed to make the NEW schema match OLD.
//
// The NEW project is built from the project's own .sql files. Where those files
// disagree with the live OLD database, a column can exist in OLD and be missing
// in NEW. jsonb_populate_record does not fail in that case - it leaves the
// column at its default - so the import would report a perfect row count while
// silently dropping real data. This script closes that gap by reading the exact
// column types from OLD and emitting an idempotent ALTER for each one.
//
// OLD is touched with a single read-only SELECT; the shared read-only guard is
// applied to it like everywhere else.
//
//   node scripts/migration/build-column-parity.mjs
//
// Output: scripts/migration/03-column-parity.sql

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReadOnlyOrThrow, OLD_REF } from './readonly-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ND = join(HERE, '..', 'export-old-data', 'ndjson');
const OUT = join(HERE, '03-column-parity.sql');
const API = 'https://api.supabase.com/v1';

const newRefArg = process.argv.indexOf('--new-ref');
const NEW_REF = newRefArg >= 0 ? process.argv[newRefArg + 1] : process.env.NEW_PROJECT_REF;
if (!NEW_REF) {
  console.error('usage: node scripts/migration/build-column-parity.mjs --new-ref <ref>');
  process.exit(2);
}

const supaDir = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const newTokenPath = join(supaDir, 'access-token');
const oldTokenPath = join(supaDir, 'access-token.old-backup');
for (const p of [newTokenPath, oldTokenPath]) {
  if (!existsSync(p)) { console.error(`missing token file: ${p}`); process.exit(2); }
}
const NEW_TOKEN = readFileSync(newTokenPath, 'utf8').trim();
const OLD_TOKEN = readFileSync(oldTokenPath, 'utf8').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isTransient = (msg) => /\b429\b|ThrottlerException|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(msg);

async function query(ref, token, sql, label) {
  assertReadOnlyOrThrow(ref, sql);
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(`${API}/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
    } catch (e) {
      if (attempt >= 7) throw e;
      await sleep(Math.min(30000, 1000 * 2 ** attempt));
      continue;
    }
    if (r.ok) return r.json();
    const t = await r.text();
    if (isTransient(t) && attempt < 7) {
      await sleep(Math.min(30000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400));
      continue;
    }
    throw new Error(`${label} on ${ref}: HTTP ${r.status} ${t.slice(0, 300)}`);
  }
}

// ---- what OLD has
const oldCols = new Map();
const oldRes = await query(
  OLD_REF, OLD_TOKEN,
  `select table_name, column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale
     from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position;`,
  'read OLD columns',
);
for (const row of oldRes) {
  const t = String(row.table_name).toLowerCase();
  if (!oldCols.has(t)) oldCols.set(t, new Map());
  oldCols.get(t).set(String(row.column_name).toLowerCase(), row);
}

// ---- what the export actually contains
const exportTables = readdirSync(ND).filter((f) => f.endsWith('.ndjson')).map((f) => f.replace(/\.ndjson$/, ''));

// ---- what NEW has (names, nullability and defaults)
const newRes = await query(
  NEW_REF, NEW_TOKEN,
  `select c.relname as table_name, a.attname as column_name, a.attnotnull as not_null,
          pg_get_expr(d.adbin, d.adrelid) as col_default
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum;`,
  'read NEW columns',
);
const newCols = new Map();
for (const row of newRes) {
  const t = String(row.table_name).toLowerCase();
  if (!newCols.has(t)) newCols.set(t, new Map());
  newCols.get(t).set(String(row.column_name).toLowerCase(), row);
}

// Rebuild a usable DDL type from information_schema.
function ddlType(row) {
  const dt = String(row.data_type).toLowerCase();
  if (dt === 'character varying') return `text`;
  if (dt === 'character') return `char(${row.character_maximum_length ?? 1})`;
  if (dt === 'numeric') {
    const p = row.numeric_precision, s = row.numeric_scale;
    return p != null ? `numeric(${p},${s ?? 0})` : 'numeric';
  }
  if (dt === 'array') return `text[]`;          // udt_name is _x; text[] keeps it importable
  if (dt === 'timestamp with time zone') return 'timestamptz';
  if (dt === 'timestamp without time zone') return 'timestamp';
  if (dt === 'time with time zone') return 'timetz';
  if (dt === 'double precision') return 'double precision';
  if (dt === 'USER-DEFINED' || dt === 'ARRAY') return 'jsonb'; // enums/arrays come through as jsonb
  return dt;
}

const lines = [
  '-- ============================================================================',
  '-- COLUMN PARITY - generated by scripts/migration/build-column-parity.mjs',
  '--',
  `-- Target: the NEW project only. NEVER run this on the OLD project.`,
  '-- Purpose: add any column that exists in OLD but is missing from the NEW schema,',
  '-- so the import cannot silently drop real values. Types are copied from OLD.',
  '-- Idempotent: every statement is ADD COLUMN IF NOT EXISTS.',
  '-- ============================================================================',
  '',
  'set client_min_messages = warning;',
  '',
];

let added = 0;
for (const t of exportTables.sort()) {
  const file = join(ND, `${t}.ndjson`);
  const first = readFileSync(file, 'utf8').split('\n').find((l) => l.trim().startsWith('{'));
  if (!first) continue;                          // empty table in OLD
  const keys = Object.keys(JSON.parse(first)).map((k) => k.toLowerCase());
  const have = newCols.get(t) || new Set();
  const oldTable = oldCols.get(t);
  if (!oldTable) { console.log(`  ! ${t}: not found in OLD information_schema, skipped`); continue; }
  for (const c of keys) {
    if (have.has(c)) continue;
    const oc = oldTable.get(c);
    if (!oc) { console.log(`  ! ${t}.${c}: in the export but not in OLD schema, skipped`); continue; }
    const type = ddlType(oc);
    const nullable = String(oc.is_nullable).toLowerCase() === 'yes' ? '' : ' not null';
    // A NOT NULL column cannot be added to a table that already holds rows unless
    // it has a default. Mirror OLD's default when one exists.
    const def = oc.column_default ? ` default ${oc.column_default}` : '';
    lines.push(`-- ${t}.${c} (${oc.data_type}) exists in OLD but was never created by the project SQL`);
    lines.push(nullable === ' not null' && !def
      ? `alter table public.${t} add column if not exists ${c} ${type};`
      : `alter table public.${t} add column if not exists ${c} ${type}${def}${nullable};`);
    lines.push('');
    added++;
    console.log(`  + ${t}.${c}  ${type}${def}${nullable}`);
  }
}

// ---- relax NOT NULL only where a row actually has to land
// The project SQL sometimes adds a column that OLD never had and declares it
// NOT NULL. The export has no value for such a column, jsonb_populate_record
// turns the missing key into NULL, and the insert is rejected. This is only
// relaxed for columns on tables that actually have rows to import - a NOT NULL
// column on an empty table is left exactly as the project intended, because the
// application will always supply a value when it inserts.
const RAW = join(HERE, '..', 'export-old-data', 'raw');
const rowCounts = new Map();
for (const t of exportTables) {
  const p = join(RAW, `${t}.001.txt`);
  if (!existsSync(p)) { rowCounts.set(t, 0); continue; }
  const n = readFileSync(p, 'utf8').split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{') && l.endsWith('}')).length;
  rowCounts.set(t, n);
}

lines.push('');
lines.push('-- --------------------------------------------------------------------');
lines.push('-- NOT NULL relaxed for columns OLD never had, on tables that do have rows.');
lines.push('-- The application still supplies these values on every new insert; only the');
lines.push('-- historical rows imported from OLD carry NULL here.');
lines.push('-- --------------------------------------------------------------------');
lines.push('');
let relaxed = 0;
for (const t of exportTables.sort()) {
  if (!rowCounts.get(t)) continue;                 // empty table: keep NOT NULL
  const have = newCols.get(t);
  if (!have) continue;
  const keys = (() => {
    const first = readFileSync(join(ND, `${t}.ndjson`), 'utf8').split('\n').find((l) => l.trim().startsWith('{'));
    return new Set(first ? Object.keys(JSON.parse(first)).map((k) => k.toLowerCase()) : []);
  })();
  for (const [c, info] of [...have].sort()) {
    if (keys.has(c)) continue;                     // the export supplies it
    if (info.not_null !== true || info.col_default) continue;
    lines.push(`-- ${t}.${c}: NOT NULL with no default, but OLD has no such column and ${rowCounts.get(t)} row(s) must be imported`);
    lines.push(`alter table public.${t} alter column ${c} drop not null;`);
    lines.push('');
    relaxed++;
    console.log(`  ~ ${t}.${c}  drop not null  (${rowCounts.get(t)} row(s) to import)`);
  }
}

lines.push('');
lines.push(`-- ${added} column(s) added, ${relaxed} NOT NULL constraint(s) relaxed.`);
writeFileSync(OUT, lines.join('\n'));
console.log(`\n  added   : ${added}`);
console.log(`  relaxed : ${relaxed}`);
console.log(`  out     : ${OUT}`);
