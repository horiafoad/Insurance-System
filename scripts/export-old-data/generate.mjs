#!/usr/bin/env node
// READ-ONLY old-DB export plan generator.
//
// Source of truth = the catalog pasted from the OLD project's SQL Editor
// (02-catalog.sql). No local DDL parsing, so nothing can silently drift.
//
// Emits run-plan/*.sql (one statement per table chunk) + manifest.json.
// Never connects to any database and never prints row data.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'raw');
const PLAN = join(HERE, 'run-plan');

const opts = { rows: 5000, verbose: false, all: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--rows') opts.rows = Math.max(1, Number(process.argv[++i]) || opts.rows);
  if (a === '--verbose') opts.verbose = true;
  if (a === '--all') opts.all = true;
}

const APP_TABLES = [
  'users', 'letter_sectors', 'letter_departments', 'letter_senders',
  'letter_templates', 'letters', 'letter_movements', 'letter_number_counter',
  'issues', 'issue_details', 'case_documents', 'archive_qr_codes',
  'executive_orders', 'executive_order_persons',
  'faculty_salary_archive', 'faculty_salary_imports', 'faculty_salary_pages',
  'salary_import_files', 'employee_salary_archive', 'employee_salary_imports',
  'claims', 'tasks', 'service_requests', 'performance_evaluations',
  'training_courses', 'course_registrations', 'employee_tasks',
  'notifications', 'public_feedback', 'push_subscriptions',
  'support_requests', 'scanner_inbox',
];

const SENSITIVE = new Set(['users', 'push_subscriptions']);

function readIfExists(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

function loadCatalog() {
  const raw = readIfExists(join(RAW, '02-catalog.txt'));
  const map = new Map();
  if (!raw) return { map, bad: 0 };
  let bad = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('{') || !t.endsWith('}')) continue;
    let o;
    try { o = JSON.parse(t); } catch { bad++; continue; }
    if (!o.table || !o.col) continue;
    if (!map.has(o.table)) map.set(o.table, { cols: [], pk: [], fks: new Map() });
    const e = map.get(o.table);
    e.cols.push({ col: o.col, type: o.udt || o.type, lossless: !!o.lossless });
    if (o.pk) e.pk.push(o.col);
    if (o.fk) e.fks.set(o.col, o.fk);
  }
  return { map, bad };
}

function loadCounts() {
  const raw = readIfExists(join(RAW, '01-discovery.txt'));
  const map = new Map();
  if (!raw) return map;
  const section = { exact: false, approx: false };
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('--- app tables (exact count)')) { section.exact = true; section.approx = false; continue; }
    if (t.startsWith('--- app tables ---')) { section.exact = false; section.approx = true; continue; }
    if (t.startsWith('---')) { section.exact = false; section.approx = false; continue; }
    const m = /^([a-z_0-9]+)\s+EXISTS\s+approx=(\d+)/.exec(t);
    if (m && section.approx && !map.has(m[1])) map.set(m[1], { n: Number(m[2]), exact: false });
    const e = /^([a-z_0-9]+)\s+(\d+)$/.exec(t);
    if (e && section.exact) map.set(e[1], { n: Number(e[2]), exact: true });
  }
  return map;
}

function topoSort(tables, catalog) {
  const deps = new Map(tables.map((n) => [n, new Set()]));
  for (const n of tables) {
    const c = catalog.get(n);
    if (!c) continue;
    for (const ref of c.fks.values()) {
      const parent = String(ref).replace(/^public\./, '').split('.')[0];
      if (deps.has(parent) && parent !== n) deps.get(n).add(parent);
    }
  }
  const out = [], done = new Set();
  while (out.length < tables.length) {
    const ready = tables.filter((n) => !done.has(n) && [...deps.get(n)].every((d) => done.has(d)));
    if (!ready.length) {
      for (const n of tables) if (!done.has(n)) { out.push(n); done.add(n); }
      break;
    }
    for (const n of ready) { out.push(n); done.add(n); }
  }
  return out;
}

const { map: catalog, bad: badLines } = loadCatalog();
const counts = loadCounts();

const catalogFree = catalog.size === 0;
if (catalogFree) {
  console.log('! No raw/02-catalog.txt  ->  CATALOG-FREE mode.');
  console.log('  Rows are exported as row_to_json(t)::text over "select t.*",');
  console.log('  so no column can be dropped and no column type is guessed.');
  console.log('  Trade-off: row ordering uses to_jsonb(t)::text instead of the PK.');
  console.log('  Table existence is taken from raw/01-discovery.txt exact counts.');
}

let tables;
if (opts.all) tables = [...(catalog.size ? catalog.keys() : APP_TABLES)].sort();
else if (catalog.size) tables = APP_TABLES.filter((t) => catalog.has(t));
else tables = APP_TABLES.filter((t) => counts.has(t));
const missing = APP_TABLES.filter((t) => !tables.includes(t));
if (missing.length) console.log(`! not in old database: ${missing.join(', ')}`);
if (badLines) console.log(`! ${badLines} unparsable catalog line(s) ignored`);

const known = [...catalog.keys()].filter((t) => !tables.includes(t));
if (opts.verbose && known.length) console.log(`(also in DB, not in app list): ${known.join(', ')}`);

const ordered = topoSort(tables, catalog);

if (existsSync(PLAN)) rmSync(PLAN, { recursive: true });
mkdirSync(PLAN, { recursive: true });

const manifest = {
  generated_from: 'SQL Editor catalog (authoritative)',
  rows_per_chunk: opts.rows,
  read_only: true,
  old_project_ref: 'jpybzalxcezxhokzmwdx',
  tables: [],
};

function infoFor(t) {
  const c = catalog.get(t);
  if (c) return { cols: c.cols, pk: c.pk, fks: c.fks, star: false };
  return { cols: [], pk: [], fks: new Map(), star: true };
}

for (const t of ordered) {
  const info = infoFor(t);
  const star = info.star;
  const pk = info.pk;
  const total = counts.has(t) ? counts.get(t).n : null;
  const n = total === null ? 1 : Math.max(1, Math.ceil(total / opts.rows));
  const order = star ? 'to_jsonb(t)::text'
    : (pk.length ? pk.map((k) => `"${k}"`).join(', ') : 'to_jsonb(t)');
  const chunks = [];

  if (total === 0) {
    writeFileSync(join(PLAN, `${t}.empty.sql`),
      `-- READ-ONLY | table=${t} | source has 0 rows --\nselect 'EMPTY_TABLE ${t}' as ndjson;\n`);
    chunks.push({ file: `${t}.empty.sql`, from: 0, to: 0, rows: 0 });
  } else {
    for (let c = 0; c < n; c++) {
      const lo = c * opts.rows;
      const hi = lo + opts.rows;
      const proj = star ? 't.*'
        : info.cols.map((col) => (col.lossless ? `"${col.col}"::text` : `"${col.col}"`)).join(',\n         ');
      const sql = [
        `-- ============================================================================`,
        `-- READ-ONLY export | table = ${t} | chunk ${c + 1}/${n} | rows ${lo + 1}..${hi}`,
        `-- columns: ${star ? 'ALL (t.* via row_to_json)' : info.cols.length} | order by: ${order}`,
        star ? `-- Contains every column verbatim. This file DOES include real values.` : `-- pk: ${pk.length ? pk.join(', ') : '(none -> total order by to_jsonb)'}`,
        `-- Save the single "ndjson" cell into:  scripts/export-old-data/raw/${t}.${String(c + 1).padStart(3, '0')}.txt`,
        ...(SENSITIVE.has(t) ? [`-- WARNING: SENSITIVE table. Never paste this cell into chat, logs or commits.`] : []),
        `-- ============================================================================`,
        `select coalesce(string_agg(nd, E'\\n' order by rn), 'EMPTY_TABLE ${t}') as ndjson`,
        `from (`,
        `  select row_number() over (order by ${order}) as rn,`,
        `         row_to_json(t)::text as nd`,
        `  from (`,
        `    select ${proj}`,
        `    from public.${t}`,
        `  ) t`,
        `) s`,
        `where rn > ${lo} and rn <= ${hi};`,
        ``,
      ].join('\n');
      const file = `${t}.${String(c + 1).padStart(3, '0')}.sql`;
      writeFileSync(join(PLAN, file), sql);
      chunks.push({ file, from: lo + 1, to: hi });
    }
  }

  if (t === 'users') {
    const body = star
      ? [
          `from (`,
          `  select row_number() over (order by to_jsonb(u)::text) as rn,`,
          `         (to_jsonb(u) - 'password')::text as nd`,
          `  from public.users u`,
          `) s`,
        ]
      : [
          `from ( select row_number() over (order by ${order}) as rn,`,
          `       row_to_json(t)::text as nd`,
          `       from ( select ${info.cols
            .map((col) => (col.col === 'password' ? `'<<REDACTED>>'::text` : col.lossless ? `"${col.col}"::text` : `"${col.col}"`))
            .join(',\n         ')} from public.users ) t ) s`,
        ];
    writeFileSync(join(PLAN, 'users.NOPASSWORD.sql'), [
      `-- READ-ONLY export of users WITHOUT the password column.`,
      `-- For review/diff only. Do NOT use this copy for the migration.`,
      `select coalesce(string_agg(nd, E'\\n' order by rn), 'EMPTY_TABLE users') as ndjson`,
      ...body,
      `where rn > 0 and rn <= ${opts.rows};`,
      ``,
    ].join('\n'));
  }

  manifest.tables.push({
    table: t,
    exact_count: total,
    count_source: counts.has(t) ? (counts.get(t).exact ? 'exact' : 'approx') : 'unknown',
    columns: star ? ['* (row_to_json, all columns)'] : info.cols.map((c) => c.col),
    column_source: star ? 'catalog-free (t.*)' : '02-catalog.txt',
    lossless_columns: star ? 'all values verbatim as JSON text' : info.cols.filter((c) => c.lossless).map((c) => c.col),
    pk: star ? [] : pk,
    fks: Object.fromEntries(info.fks),
    sensitive: SENSITIVE.has(t),
    chunks,
  });
}

writeFileSync(join(PLAN, 'manifest.json'), JSON.stringify(manifest, null, 2));

const need = manifest.tables.filter((x) => x.exact_count === null || x.exact_count > 0);
const stmts = manifest.tables.reduce((a, x) => a + x.chunks.length, 0);
const rows = manifest.tables.reduce((a, x) => a + (x.exact_count ?? 0), 0);
console.log(`tables=${manifest.tables.length} statements=${stmts} rows=${rows} rows/chunk=${opts.rows}`);
const unknown = manifest.tables.filter((x) => x.exact_count === null).map((x) => x.table);
if (unknown.length) console.log(`no count yet: ${unknown.join(', ')}`);
const approx = manifest.tables.filter((x) => x.count_source === 'approx').map((x) => x.table);
if (approx.length) console.log(`approx counts only (run step 2 of 01-discovery.sql for exact): ${approx.join(', ')}`);
console.log(`order: ${need.map((x) => x.table).join(' -> ')}`);
console.log('manifest: scripts/export-old-data/run-plan/manifest.json');
