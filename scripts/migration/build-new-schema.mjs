#!/usr/bin/env node
// Builds the ordered DDL bundle for the NEW Supabase project.
//
// Order = topological over foreign keys, derived from the project's own SQL
// files (there is no supabase/migrations/ directory in this repo).
//
// It also NEUTRALISES statements that would destroy imported data or touch
// Supabase Storage, and records every removal in a report so nothing is
// silently dropped.
//
// It never connects to a database. Output is a single .sql file to paste into
// the NEW project's SQL Editor.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { splitStatements, withoutLeadingComments, isCreate, isNoop } from './sql-split.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, '01-new-project-schema.sql');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const removed = [];

// ---------------------------------------------------------------- 1. analyze
const sqlFiles = readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith('.sql')).sort();
const tables = new Map();
const meta = new Map();

const unq = (s) => s.replace(/^public\./i, '').replace(/["'`]/g, '').trim().toLowerCase();

for (const f of sqlFiles) {
  const sql = strip(readFileSync(join(ROOT, f), 'utf8'));
  const m = meta.get(f) || { creates: [], alters: [], isPatch: false, hasRls: false, realtime: false, seeds: 0, pwUpdate: false };
  let x;
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\n\s*\)\s*(?:with|;|tablespace)/gi;
  while ((x = createRe.exec(sql))) {
    const name = unq(x[1]);
    m.creates.push(name);
    if (!tables.has(name)) tables.set(name, { name, deps: new Set(), files: new Set(), cols: new Set() });
    const t = tables.get(name);
    t.files.add(f);
    for (const c of parseCols(x[2])) t.cols.add(c);
    const inl = /references\s+(?:public\.)?["'`]?(\w+)["'`]?/gi;
    let r;
    while ((r = inl.exec(x[2]))) t.deps.add(unq(r[1]));
    // CREATE TABLE ... LIKE <other> is an implicit dependency on that table:
    // PostgreSQL resolves the LIKE at creation time, so the parent must be
    // built first or the whole bundle aborts with 42P01.
    const likeRe = /(?<!not\s)(?<!i)\blike\s+(?:public\.)?["'`]?(\w+)["'`]?/gi;
    let lk;
    while ((lk = likeRe.exec(x[2]))) {
      const src = unq(lk[1]);
      if (src && src !== name && !/^(text|varchar|int|uuid|jsonb|timestamptz|numeric|boolean)$/i.test(src)) t.deps.add(src);
    }
  }
  const alterRe = /alter\s+table\s+(?:if\s+exists\s+|only\s+)?(?:public\.)?["'`]?(\w+)["'`]?/gi;
  while ((x = alterRe.exec(sql))) m.alters.push(unq(x[1]));
  if (!m.creates.length && m.alters.length) m.isPatch = true;
  m.hasRls = /enable\s+row\s+level\s+security/i.test(sql) || /create\s+policy/i.test(sql);
  m.realtime = /alter\s+publication\s+supabase_realtime/i.test(sql);
  m.seeds = (sql.match(/insert\s+into/gi) || []).length;
  m.pwUpdate = /on\s+conflict[\s\S]{0,200}?do\s+update[\s\S]{0,200}?password\s*=/i.test(sql);
  meta.set(f, m);
}

// topological order of tables
const known = new Set(tables.keys());
const order = [], done = new Set(), state = new Map();
function visit(n, stack) {
  if (state.get(n) === 1) return;
  if (state.get(n) === 0) return; // cycle: break, order is still usable
  const node = tables.get(n);
  if (!node) { if (!known.has(n)) removed.push({ file: '(analyzer)', why: `FK target <${n}> is not defined by any project file`, sql: '' }); return; }
  state.set(n, 0);
  for (const d of node.deps) if (known.has(d) && d !== n) visit(d, [...stack, n]);
  state.set(n, 1); order.push(n);
}
for (const n of [...known].sort()) visit(n, []);

// file order: creates follow table topo order, then patches, then RLS, then realtime
const creates = sqlFiles.filter((f) => meta.get(f).creates.length);
// Emit a file only once EVERY table it depends on already exists. Using the
// highest dependency index (not the lowest created index) is what keeps a
// file that creates both a parent and its own LIKE-child from running too early.
const depKey = (f) => {
  let k = -1;
  for (const t of meta.get(f).creates) {
    const node = tables.get(t);
    if (!node) continue;
    for (const d of node.deps) {
      const i = order.indexOf(d);
      if (i > k) k = i;
    }
  }
  return k;
};
const phase = (f) => {
  const m = meta.get(f);
  if (m.creates.length) return 0;
  if (m.realtime) return 3;
  if (m.hasRls) return 2;
  return 1;
};
const fileOrder = [
  ...creates.sort((a, b) => depKey(a) - depKey(b) || a.localeCompare(b)),
  ...sqlFiles.filter((f) => !meta.get(f).creates.length).sort((a, b) => phase(a) - phase(b) || a.localeCompare(b)),
];

// Knowing each table's real column list is what lets us spot an index that can
// never be built. Columns are collected from the CREATE TABLE bodies plus every
// `ALTER TABLE ... ADD COLUMN` in the project. A table made with `LIKE` inherits
// another table's shape, so it contributes no columns of its own here.
function parseCols(body) {
  const parts = [];
  let depth = 0, buf = '', q = null;
  for (const c of body) {
    if (q) { buf += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; buf += c; continue; }
    if (c === '(') { depth++; buf += c; continue; }
    if (c === ')') { depth--; buf += c; continue; }
    if (c === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) parts.push(buf);
  const out = new Set();
  for (const p of parts) {
    const t = p.trim().match(/^["'`]?([a-z_0-9]+)["'`]?\s/i);
    if (!t) continue;
    const w = t[1].toLowerCase();
    if (['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude', 'like'].includes(w)) continue;
    out.add(w);
  }
  return out;
}

const addedCols = new Map();
for (const f of sqlFiles) {
  const addColRe = /alter\s+table\s+(?:if\s+exists\s+|only\s+)?(?:public\.)?["'`]?(\w+)["'`]?\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?["'`]?(\w+)["'`]?/gi;
  let x;
  while ((x = addColRe.exec(strip(readFileSync(join(ROOT, f), 'utf8'))))) {
    const t = unq(x[1]);
    if (!addedCols.has(t)) addedCols.set(t, new Set());
    addedCols.get(t).add(unq(x[2]));
  }
}
for (const [t, cs] of addedCols) if (tables.has(t)) for (const c of cs) tables.get(t).cols.add(c);

// ------------------------------------------------- 2. neutralise destructive
// Replace every string literal with a placeholder so that a removed
// statement can be reported without reprinting a real password or token.
const redact = (s) => s.replace(/'(?:[^']|'')*'/g, "'?'").replace(/\s+/g, ' ').trim().slice(0, 90);

// Blank out dollar-quoted regions (CREATE FUNCTION bodies) while keeping the
// string length, so a rule can never "remove" a statement that only exists
// inside a function definition and is therefore dormant anyway.
function maskDollarQuoted(s) {
  const chars = s.split('');
  const re = /\$\$[\s\S]*?\$\$/g;
  let m;
  while ((m = re.exec(s)) !== null) for (let i = m.index; i < m.index + m[0].length; i++) if (chars[i] !== '\n') chars[i] = ' ';
  return chars.join('');
}

// Tables whose authoritative rows come from the OLD export. A top-level INSERT
// into any of them is sample/reference data that would (a) invent rows and
// (b) make the count reconciliation fail.
const EXPORTED = new Set(
  (() => {
    try {
      const m = JSON.parse(readFileSync(join(HERE, '..', 'export-old-data', 'run-plan', 'manifest.json'), 'utf8'));
      return m.tables.map((t) => t.table.toLowerCase());
    } catch { return []; }
  })(),
);

function neutralise(f, sql) {
  let out = sql;
  // Find matches on the masked copy (same length, so indices line up) and then
  // splice the replacements into the real text back-to-front, which keeps the
  // not-yet-processed indices valid.
  const kill = (re, why) => {
    const masked = maskDollarQuoted(out);
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    const matches = [...masked.matchAll(new RegExp(re.source, flags))];
    for (const m of matches.reverse()) {
      const cut = out.slice(m.index, m.index + m[0].length);
      removed.push({ file: f, why, sql: redact(cut) });
      out = out.slice(0, m.index) + `\n-- [REMOVED by build-new-schema] ${why}\n` + out.slice(m.index + m[0].length);
    }
    return matches.length > 0;
  };
  // 1. any INSERT that upserts the users password -> would overwrite real logins
  kill(/insert\s+into\s+(?:public\.)?users\b[\s\S]*?on\s+conflict[\s\S]*?;/gi,
    'users password upsert would overwrite imported real credentials');
  // 2. Supabase Storage bucket seeds -> files live in Cloudflare R2, not Storage
  kill(/insert\s+into\s+(?:public\.)?storage\b[\s\S]*?;/gi,
    'Supabase Storage bucket seed; the project uses Cloudflare R2 for files');
  // 3. auth admin creation
  kill(/insert\s+into\s+auth\b[\s\S]*?;/gi,
    'auth.* insert would create a new Supabase Auth user');
  // 4. sample/reference rows for tables whose real data is being imported.
  //    Never invent rows, and never let a seed break the count reconciliation.
  if (EXPORTED.size) {
    const names = [...EXPORTED].join('|');
    kill(new RegExp(`insert\\s+into\\s+(?:public\\.)?(?:${names})\\b[\\s\\S]*?;`, 'gi'),
      'sample/reference seed for a table whose rows come from the OLD export');
  }
  // 5. index on a column that no project file ever creates. The schema bundle
  //    references columns that do not exist in OLD, so the index can never be
  //    built and would abort the entire bundle with 42703. Only bare column
  //    references are judged; an index on an expression is left alone.
  {
    const idxRe = /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?[^\s]+\s+on\s+(?:public\.)?["'`]?(\w+)["'`]?\s*\(([^()]*)\)/gi;
    const masked = maskDollarQuoted(out);
    const hits = [];
    let im;
    while ((im = idxRe.exec(masked))) {
      const tname = unq(im[1]);
      const node = tables.get(tname);
      if (!node || !node.cols.size) continue;
      const used = im[2].split(',')
        .map((s) => s.trim().match(/^["'`]?(\w+)["'`]?\s*(?:asc|desc)?\s*$/i))
        .filter(Boolean).map((c) => c[1].toLowerCase());
      if (!used.length) continue;
      const bad = used.filter((c) => !node.cols.has(c));
      if (bad.length) hits.push({ i: im.index, len: im[0].length, t: tname, bad });
    }
    for (const h of hits.reverse()) {
      removed.push({ file: f, why: `index on <${h.t}(${h.bad.join(', ')})>: column is never created by any project file`, sql: redact(out.slice(h.i, h.i + h.len)) });
      out = out.slice(0, h.i) + `\n-- [REMOVED by build-new-schema] index on non-existent column ${h.t}(${h.bad.join(', ')})\n` + out.slice(h.i + h.len);
    }
  }
  // 6. per-database GUCs. A managed Supabase instance does not allow these, and
  //    autovacuum is already enabled by default there, so dropping them is lossless.
  kill(/alter\s+database\s+[\s\S]*?;/gi,
    'per-database GUC is not settable on a managed Supabase instance (autovacuum is on by default)');
  return out;
}

// ---------------------------------------------------------------- 3. emit
// Split every file into individual statements, then emit ALL CREATE TABLEs
// before anything else. A file can contain both a CREATE and a patch on a
// table owned by a different file (create_letter_sectors.sql alters
// public.letter_departments, which a later file creates), so file-level
// ordering alone produces 42P01 "relation does not exist".
const createFiles = creates.slice().sort((a, b) => depKey(a) - depKey(b) || a.localeCompare(b));
const otherFiles = sqlFiles.filter((f) => !meta.get(f).creates.length)
  .sort((a, b) => phase(a) - phase(b) || a.localeCompare(b));

const stmts = new Map();
for (const f of [...createFiles, ...otherFiles]) {
  stmts.set(f, splitStatements(stripNeutralised(f)).filter((s) => !isNoop(s)));
}

const PHASE_TITLE = [
  'phase 1 - CREATE TABLE, foreign-key and LIKE parents first',
  'phase 2 - ALTER TABLE ADD COLUMN first, so later statements see every column',
  'phase 3 - indexes, types, functions, triggers and comments',
  'phase 4 - RLS policies and grants',
  'phase 5 - realtime publications',
];
const lines = [
  '-- ============================================================================',
  '-- NEW PROJECT SCHEMA - generated by scripts/migration/build-new-schema.mjs',
  '--',
  '-- Target: the NEW Supabase project only. NEVER run this on the OLD project.',
  '-- Order: ' + order.length + ' tables, topologically sorted by foreign key and LIKE.',
  '-- Every CREATE TABLE is emitted before any ALTER/INDEX/POLICY statement, so no',
  '-- statement can reference a table that does not exist yet.',
  '-- Removed statements are listed at the bottom of this file.',
  '-- ============================================================================',
  '',
  'set client_min_messages = warning;',
  '',
];
const section = (title) => lines.push('', '-- ############################################################################', `-- ${title}`, '-- ############################################################################');
const body = (f, filter) => {
  const picked = stmts.get(f).filter(filter);
  if (!picked.length) return false;
  lines.push('', `-- ==== ${f} ====================================`);
  for (const s of picked) lines.push(s.trim(), '');
  return true;
};

section(PHASE_TITLE[0]);
// Sort the CREATE TABLE statements themselves, not the files that contain them.
// A file can own both a parent and an unrelated child (optimize_database_performance.sql
// creates 4 archives with LIKE while create_service_requests_tables.sql creates their
// parents), so file-level ordering cannot guarantee parents-first.
const createIndex = new Map();
for (const f of [...createFiles, ...otherFiles]) {
  for (const s of stmts.get(f)) {
    if (!isCreate(s)) continue;
    const m = /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["'`]?(\w+)/i.exec(withoutLeadingComments(s));
    if (!m) continue;
    const n = unq(m[1]);
    if (!createIndex.has(n)) createIndex.set(n, { file: f, sql: s, name: n });
  }
}
const emittedTables = new Set();
const emitCreate = (name) => {
  if (emittedTables.has(name)) return;
  const rec = createIndex.get(name);
  if (!rec) return;
  emittedTables.add(name);
  const node = tables.get(name);
  if (node) for (const d of [...node.deps].sort()) emitCreate(d);
  lines.push(`-- from ${rec.file}`);
  lines.push(rec.sql.trim(), '');
};
for (const n of [...createIndex.keys()].sort()) emitCreate(n);

// A column added by ALTER must exist before any later statement refers to it.
// create_scanner_inbox.sql comments on scanner_inbox.source_fingerprint, but that
// column is created by a different file (add_scanner_r2_columns.sql), so every
// ADD COLUMN has to be hoisted above indexes, triggers and comments.
const isAddColumn = (s) => /^\s*alter\s+table\s+(?:if\s+exists\s+|only\s+)?(?:public\.)?["'`]?\w+["'`]?\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?["'`]?\w+["'`]?/i.test(withoutLeadingComments(s));

section(PHASE_TITLE[1]);
for (const f of createFiles) body(f, (s) => !isCreate(s) && isAddColumn(s));
for (const f of otherFiles) if (phase(f) === 1) body(f, isAddColumn);

section(PHASE_TITLE[2]);
for (const f of createFiles) body(f, (s) => !isCreate(s) && !isAddColumn(s));
for (const f of otherFiles) if (phase(f) === 1) body(f, (s) => !isAddColumn(s));

section(PHASE_TITLE[3]);
for (const f of otherFiles) if (phase(f) === 2) body(f, () => true);

section(PHASE_TITLE[4]);
for (const f of otherFiles) if (phase(f) === 3) body(f, () => true);

lines.push('', '-- ############################################################################', '-- REMOVED STATEMENTS (kept out on purpose)', '-- ############################################################################');
if (!removed.length) lines.push('-- (none)');
for (const r of removed) lines.push(`-- ${r.file}: ${r.why}\n--   ${r.sql.replace(/\s+/g, ' ')}`);

mkdirSync(HERE, { recursive: true });
writeFileSync(OUT, lines.join('\n'));

// Source SQL files contain commented-out example logins with real-looking
// passwords. Those comments are copied into the bundle verbatim, which would
// bake a credential into a file that gets shared and committed. Scrub
// credential-shaped literals from comment lines only - executable SQL is never
// touched, so this cannot change the schema.
function scrubSecretComments(s) {
  const CRED = /'([0-9]{4,}|\$2[aby]\$[A-Za-z0-9./]+|eyJ[A-Za-z0-9_-]{20,})'/g;
  return s.split('\n').map((line) => {
    if (!line.trimStart().startsWith('--')) return line;
    return line.replace(CRED, "'?'");
  }).join('\n');
}

function stripNeutralised(f) {
  return scrubSecretComments(neutralise(f, readFileSync(join(ROOT, f), 'utf8')));
}

console.log(`files      : ${fileOrder.length} / ${sqlFiles.length}`);
console.log(`tables     : ${order.length}`);
console.log(`removed    : ${removed.length}`);
for (const r of removed) console.log(`  - ${r.file}: ${r.why}`);
console.log(`out        : ${OUT}`);
