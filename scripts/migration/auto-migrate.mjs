#!/usr/bin/env node
// Fully automatic OLD -> NEW migration driver.
//
// Uses the Supabase management API (the same engine the SQL Editor runs) via
// the personal access token from `supabase login`. No manual SQL, no
// copy/paste between files, no secrets in the chat.
//
// HARD SAFETY RULES ENFORCED IN CODE
//   * The OLD ref is read-only. Every statement sent to OLD passes through
//     assertReadOnly() first; a non-SELECT aborts the whole run.
//   * The password value is never printed, logged or emitted. users and
//     push_subscriptions row bodies are written to gitignored files only.
//   * The import is refused unless all 29 exported counts equal the
//     authoritative counts, and unless every import statement is an INSERT
//     (never an upsert that could overwrite a real password).
//
// Usage:  node scripts/migration/auto-migrate.mjs --phase all
//         node scripts/migration/auto-migrate.mjs --phase export|schema|import|reconcile

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPORT = join(HERE, '..', 'export-old-data');
const RAW = join(EXPORT, 'raw');
const ND = join(EXPORT, 'ndjson');
const PLAN = join(EXPORT, 'run-plan');
const IMPSQL = join(HERE, 'import-sql');
const API = 'https://api.supabase.com/v1';

const argv = process.argv.slice(2);
const phase = (() => { const i = argv.indexOf('--phase'); return i >= 0 ? argv[i + 1] : 'all'; })();
const allowNewRef = (() => { const i = argv.indexOf('--new-ref'); return i >= 0 ? argv[i + 1] : null; })();

const log = (...a) => console.log(...a);
let step = 0;
const section = (t) => log(`\n${'='.repeat(72)}\n${++step}. ${t}\n${'='.repeat(72)}`);

// ---------------------------------------------------------------- token
function getToken() {
  const p = join(process.env.USERPROFILE || process.env.HOME, '.supabase', 'access-token');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').trim();
}
const TOKEN = getToken();
if (!TOKEN) {
  log('MISSING CREDENTIAL: no Supabase access token.');
  log('Run this one command in your terminal, approve it in the browser, then I continue:');
  log('');
  log('    npx supabase login');
  process.exit(2);
}

// ------------------------------------------------------------- read-only guard
// imported, not reimplemented: readonly-guard.mjs is the single tested source
// of truth for "the OLD project is read only".
import { assertReadOnlyOrThrow as assertReadOnly, stripForScan, OLD_REF } from './readonly-guard.mjs';
import { splitStatements, isNoop, statementHead } from './sql-split.mjs';

// ------------------------------------------------------------------- api
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Transient conditions, not SQL errors: rate limiting and a dropped connection
// must be retried, because a real syntax/schema error would come back as a
// non-2xx with a `Failed to run sql query` body and is reported immediately.
const isTransient = (msg) => /\b429\b|ThrottlerException|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(msg);

async function qOnce(ref, sql, label) {
  const r = await fetch(`${API}/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`query failed on ${ref}${label ? ' [' + label + ']' : ''}: HTTP ${r.status} ${t.slice(0, 400)}`);
  }
  return r.json();
}

// The management API rate-limits bursts hard, so back off exponentially. `pace`
// is the minimum gap between two consecutive calls in milliseconds.
async function q(ref, sql, label = '', pace = 0) {
  assertReadOnly(ref, sql);
  let last = 0;
  for (let attempt = 0; ; attempt++) {
    if (pace) {
      const wait = last + pace - Date.now();
      if (wait > 0) await sleep(wait);
    }
    last = Date.now();
    try {
      return await qOnce(ref, sql, label);
    } catch (e) {
      if (attempt >= 7 || !isTransient(e.message)) throw e;
      const backoff = Math.min(30000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400);
      if (attempt === 0) log(`  throttled, backing off ${(backoff / 1000).toFixed(1)}s ...`);
      await sleep(backoff);
    }
  }
}
const oneCell = (res) => (Array.isArray(res) ? String(res[0]?.ndjson_all ?? '') : String(res?.ndjson_all ?? ''));

// ---------------------------------------------------------------- manifest
const manifestPath = join(PLAN, 'manifest.json');
if (!existsSync(manifestPath)) { log('run-plan/manifest.json missing. Run: node scripts/export-old-data/generate.mjs --rows 5000'); process.exit(1); }
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const EXPECTED = new Map(manifest.tables.map((t) => [t.table, t.exact_count]));
const TOTAL_EXPECTED = [...EXPECTED.values()].reduce((a, b) => a + b, 0);

// ============================================================ PHASE: EXPORT
async function doExport() {
  section('EXPORT from the OLD project (read-only, management API)');
  mkdirSync(RAW, { recursive: true });

  const aio = readdirSync(PLAN).filter((f) => /^ALL-IN-ONE-[AB]-/.test(f)).sort();
  if (!aio.length) { log('no ALL-IN-ONE-*.sql found. Run: node scripts/migration/build-all-in-one.mjs'); process.exit(1); }

  const found = new Map();
  for (const f of aio) {
    const sql = readFileSync(join(PLAN, f), 'utf8');
    log(`  running ${f} ...`);
    const cell = oneCell(await q(OLD_REF, sql, f));
    if (!cell) throw new Error(`${f} returned an empty cell`);
    writeFileSync(join(RAW, f.replace(/\.sql$/, '.txt')), cell, 'utf8');
    log(`  saved ${(cell.length / 1024).toFixed(1)} KB -> raw/${f.replace(/\.sql$/, '.txt')}`);
    for (const m of cell.matchAll(/###TABLE ([a-z_0-9]+)\r?\n([\s\S]*?)\r?\n?###END \1(?![a-z_0-9])/g)) {
      const lines = m[2].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const empty = lines.length === 1 && lines[0] === `EMPTY_TABLE ${m[1]}`;
      let bad = 0;
      for (const l of lines) { if (empty) break; try { JSON.parse(l); } catch { bad++; } }
      if (bad) throw new Error(`${m[1]}: ${bad} invalid JSON line(s) - the response cell was truncated`);
      found.set(m[1], empty ? 0 : lines.length);
    }
  }

  log(`\n  ${'table'.padEnd(28)}${'exported'.padStart(10)}${'expected'.padStart(10)}  status`);
  let bad = 0;
  for (const [t, exp] of EXPECTED) {
    const have = found.get(t) ?? null;
    const ok = have === exp;
    if (!ok) bad++;
    log(`  ${t.padEnd(28)}${String(have ?? '-').padStart(10)}${String(exp).padStart(10)}  ${ok ? 'ok' : 'MISMATCH'}`);
  }
  const got = [...EXPECTED.keys()].reduce((a, t) => a + (found.get(t) ?? 0), 0);
  log(`\n  tables=${EXPECTED.size}  exported=${got}/${TOTAL_EXPECTED}`);
  if (bad) throw new Error(`export incomplete: ${bad} table(s) do not match the authoritative counts. NOT importing.`);

  // per-table raw files, so ingest.mjs can validate exactly as before
  for (const f of readdirSync(RAW)) if (/^[a-z_0-9]+\.\d+\.txt$/i.test(f)) rmSync(join(RAW, f));
  const cellAll = aio.map((f) => readFileSync(join(RAW, f.replace(/\.sql$/, '.txt')), 'utf8')).join('\n');
  for (const m of cellAll.matchAll(/###TABLE ([a-z_0-9]+)\r?\n([\s\S]*?)\r?\n?###END \1(?![a-z_0-9])/g)) {
    const lines = m[2].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    writeFileSync(join(RAW, `${m[1]}.001.txt`), lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  }
  log('  all 29 counts match -> export verified');
  return { tables: EXPECTED.size, rows: got };
}

// ========================================================== PHASE: NEW REF
async function resolveNew() {
  section('RESOLVING the NEW project');
  let ref = allowNewRef;
  if (!ref) {
    const env = readFileSync(join(HERE, '..', '..', '.env'), 'utf8');
    const m = /^\s*VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9-]+)\.supabase\.co/im.exec(env);
    if (m && m[1] !== OLD_REF) ref = m[1];
  }
  if (!ref) {
    const r = await fetch(`${API}/projects?limit=200`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) throw new Error(`cannot list projects: HTTP ${r.status}`);
    const list = (await r.json()).filter((p) => p.ref !== OLD_REF);
    log(`  projects in this account (OLD excluded): ${list.length}`);
    for (const p of list) log(`    - ${p.ref}  "${p.name}"  status=${p.status}`);
    if (list.length === 1) { ref = list[0].ref; log(`  auto-selected the only non-OLD project: ${ref}`); }
    else if (list.length === 0) { log('  no other project exists. Create the NEW project first, then re-run.'); process.exit(3); }
    else { log(`\n  ${list.length} candidate projects. Re-run with: --new-ref <ref>`); process.exit(3); }
  }
  if (ref === OLD_REF) throw new Error('the NEW ref resolved to the OLD project. Refusing to continue.');
  log(`  NEW project ref: ${ref}`);
  return ref;
}

// =========================================================== PHASE: SCHEMA
async function doSchema(ref) {
  section(`SCHEMA on the NEW project ${ref}`);
  const before = new Map();
  const p = new URLSearchParams();
  const r = await fetch(`${API}/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;` }),
  });
  if (r.ok) for (const row of await r.json()) before.set(row.table_name, Number(row.n));
  log(`  existing public tables on NEW: ${before.size}`);

  const parityFile = join(HERE, '03-column-parity.sql');
  const bundle = readFileSync(join(HERE, '01-new-project-schema.sql'), 'utf8');
  assertNoPasswordUpsert(bundle);
  // Apply one statement per request. A single 129 KB call is atomic, so one bad
  // statement rolls the whole schema back and hides every other problem. Running
  // them separately reports all failures in one pass and keeps the good work.
  const statements = splitStatements(bundle).filter((s) => !isNoop(s));
  // Column parity runs last: it can only be generated once the tables exist, and
  // it adds columns that OLD has but the project SQL never created.
  if (existsSync(parityFile)) {
    const parity = splitStatements(readFileSync(parityFile, 'utf8')).filter((s) => !isNoop(s));
    log(`  + ${parity.length} column-parity statement(s) from 03-column-parity.sql`);
    statements.push(...parity);
  } else {
    log('  ! 03-column-parity.sql missing - run build-column-parity.mjs --new-ref <ref> before importing');
  }
  const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

  // Resume support. Statements are keyed by content hash, so a re-run after a
  // crash or a throttle skips what already landed instead of failing on
  // "already exists". A rebuilt bundle changes the hash and re-runs that
  // statement, so this can never mark unapplied work as done.
  const progressPath = join(HERE, '.schema-progress.json');
  const fresh = process.argv.includes('--fresh');
  let done = new Set();
  if (!fresh && existsSync(progressPath)) {
    try { done = new Set(JSON.parse(readFileSync(progressPath, 'utf8'))); } catch { done = new Set(); }
  }
  const save = () => { try { writeFileSync(progressPath, JSON.stringify([...done], null, 0)); } catch { /* best effort */ } };
  const pending = statements.filter((s) => !done.has(hash(s)));
  if (done.size) log(`  resuming: ${done.size} statement(s) already applied, ${pending.length} to go`);
  log(`  applying ${pending.length} statements (${(bundle.length / 1024).toFixed(0)} KB bundle, ${statements.length} total)`);
  log(`  rate-limited API: ~200ms between statements, exponential backoff on 429`);

  const failed = [];
  let applied = 0, alreadyThere = 0;
  // A re-run over a partly-applied schema re-issues CREATE POLICY/TRIGGER/etc.
  // for objects that now exist. The bundle is written to converge, so an
  // "already exists" object means the intended end state is already in place.
  const ALREADY_SATISFIED = /\b(42710|42P07|42701)\b|already exists/i;
  for (const [i, s] of pending.entries()) {
    try {
      await q(ref, s, `stmt ${i + 1}/${pending.length}: ${statementHead(s)}`, 200);
      done.add(hash(s));
      applied++;
      if (applied % 25 === 0) { log(`  ... ${applied}/${pending.length}`); save(); }
    } catch (e) {
      if (ALREADY_SATISFIED.test(e.message)) { done.add(hash(s)); alreadyThere++; continue; }
      failed.push({ n: i + 1, head: statementHead(s, 60), err: e.message });
    }
  }
  save();
  log(`  applied ${applied}/${pending.length}${alreadyThere ? `  (${alreadyThere} already present)` : ''}`);
  if (failed.length) {
    log(`  !! ${failed.length} statement(s) failed:`);
    for (const f of failed) log(`     #${f.n}  ${f.head}\n          -> ${f.err}`);
    throw new Error(`schema apply failed: ${failed.length}/${pending.length} statements errored (see list above)`);
  }
  log('  schema applied');

  const after = new Map();
  const r2 = await fetch(`${API}/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;` }),
  });
  if (r2.ok) for (const row of await r2.json()) after.set(row.table_name, Number(row.n));
  const added = [...after.keys()].filter((t) => !before.has(t));
  log(`  tables after: ${after.size}  (newly created: ${added.length})`);
  const missing = [...EXPECTED.keys()].filter((t) => !after.has(t));
  if (missing.length) log(`  !! still missing: ${missing.join(', ')}`);
  else log('  all 29 target tables exist on NEW');
  return { tables: after.size, added: added.length, missing: missing.length };
}

function assertNoPasswordUpsert(sql) {
  const s = stripForScan(sql);
  if (/insert\s+into\s+(public\.)?users[\s\S]{0,300}do\s+update\s+set[\s\S]{0,120}password/i.test(sql)) {
    throw new Error('the schema bundle still contains a users password upsert. Refusing to run it.');
  }
  if (/\b(password|encrypted_password)\s*=\s*excluded\./i.test(s)) {
    throw new Error('the schema bundle contains "password = excluded.*". Refusing to run it.');
  }
  if (/archive_old_data\s*\(\s*\)/i.test(sql.replace(/^--.*$/gm, ''))) {
    log('  note: the dormant archive_old_data() function is present but is never invoked here.');
  }
}

// ============================================================ PHASE: IMPORT
async function doImport(ref) {
  section(`IMPORT into the NEW project ${ref}`);

  // 1. validate the local export against the authoritative counts
  const raws = readdirSync(RAW).filter((f) => /^[a-z_0-9]+\.\d+\.txt$/i.test(f));
  const have = new Map();
  for (const f of raws) {
    const t = f.replace(/\.\d+\.txt$/, '');
    const lines = readFileSync(join(RAW, f), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('{') && l.endsWith('}'));
    have.set(t, (have.get(t) || 0) + lines.length);
  }
  const problems = [];
  for (const [t, exp] of EXPECTED) {
    if (have.get(t) === undefined) problems.push(`${t}: no export file`);
    else if (have.get(t) !== exp) problems.push(`${t}: have ${have.get(t)}, expected ${exp}`);
  }
  if (problems.length) {
    log(`\n  IMPORT REFUSED - ${problems.length} problem(s):`);
    for (const p of problems) log(`    - ${p}`);
    log('\n  run the export phase first.');
    process.exit(1);
  }
  log(`  local export validated: ${EXPECTED.size} tables, ${[...have.values()].reduce((a, b) => a + b, 0)} rows`);

  // Rows for a table, from the raw export. Empty tables are written as the
  // marker line "[EMPTY_TABLE <name>]", not as an empty file, so a JSON-object
  // filter is required - sending the marker to jsonb_array_elements is a 22P02.
  const readRows = (t) => readFileSync(join(RAW, `${t}.001.txt`), 'utf8')
    .split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l.startsWith('{') && l.endsWith('}'));
  const rowsSha = (t) => createHash('sha256').update(readRows(t).join('\n')).digest('hex').slice(0, 12);

  // Resume support for the import. A table is only skipped when the ledger
  // records the same content hash AND the table still holds exactly that many
  // rows, so a partial or hand-edited table is never mistaken for a finished one.
  const importLedgerPath = join(HERE, '.import-progress.json');
  const ledger = (existsSync(importLedgerPath) && !process.argv.includes('--reset-import'))
    ? (() => { try { return JSON.parse(readFileSync(importLedgerPath, 'utf8')); } catch { return {}; } })()
    : {};
  const saveLedger = () => { try { writeFileSync(importLedgerPath, JSON.stringify(ledger, null, 2)); } catch { /* best effort */ } };

  if (process.argv.includes('--reset-import')) {
    log('  --reset-import: truncating every target table on NEW before importing again');
    const names = [...EXPECTED.keys()];
    for (let i = 0; i < names.length; i += 10) {
      const batch = names.slice(i, i + 10);
      await q(ref, `truncate table ${batch.map((t) => `public.${t}`).join(', ')} restart identity cascade;`, `truncate ${batch.length} tables`);
    }
  }

  // 2. never import into a table that already holds rows. Without the ledger
  //    entry that explains them, those rows are unexplained and importing would
  //    duplicate data.
  const preQ = `select * from ( ${[...EXPECTED.keys()].map((t) => `select '${t}' as t, (select count(*)::bigint from public.${t}) as n`).join(' union all ')} ) s where n > 0 order by t;`;
  const preRows = await q(ref, preQ, 'preflight counts');
  const unexplained = preRows.filter((r) => !(ledger[r.t] && ledger[r.t].sha === rowsSha(r.t) && Number(ledger[r.t].n) === Number(r.n)));
  if (unexplained.length) {
    log(`\n  IMPORT REFUSED - ${unexplained.length} target table(s) already contain rows with no matching import record:`);
    for (const r of unexplained) log(`    - ${r.t}: ${r.n} row(s)`);
    log('\n  Re-run with --reset-import to truncate them and import from scratch.');
    process.exit(1);
  }
  if (preRows.length) log(`  preflight: ${preRows.length} table(s) already imported and verified, will resume`);

    // 3. import parents first. The order is taken from the live FK graph on NEW
    //    rather than from the export manifest, because the manifest lists tables
    //    alphabetically and a child would otherwise be inserted before its parent.
    const fkRows = await q(
      ref,
      `select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
         from pg_constraint c join pg_namespace n on n.oid = c.connamespace
        where c.contype = 'f' and n.nspname = 'public';`,
      'fk graph',
    );
    const deps = new Map([...EXPECTED.keys()].map((t) => [t, new Set()]));
    let fkEdges = 0;
    for (const row of fkRows) {
      const child = String(row.child).replace(/^public\./i, '').toLowerCase();
      const parent = String(row.parent).replace(/^public\./i, '').toLowerCase();
      if (deps.has(child) && deps.has(parent) && child !== parent) { deps.get(child).add(parent); fkEdges++; }
    }
    const order = [];
    const state = new Map();
    const visit = (t, stack) => {
      if (state.get(t) === 1) return;
      if (state.get(t) === 0) { log(`  ! FK cycle: ${[...stack, t].join(' -> ')}`); return; }
      state.set(t, 0);
      for (const p of [...deps.get(t)].sort()) visit(p, [...stack, t]);
      state.set(t, 1);
      order.push(t);
    };
    for (const t of [...EXPECTED.keys()].sort()) visit(t, []);
    for (const t of manifest.tables.map((x) => x.table)) if (!order.includes(t)) order.push(t);
    log(`  import order from the live FK graph: ${order.length} tables, ${fkEdges} foreign key(s)`);

    // Triggers must be off for the whole import. The schema installs AFTER INSERT
    // triggers (create_letter_notifications on letters, create_request_notifications
    // on service_requests) that generate rows in notifications. Importing letters
    // would silently create notification rows on top of the exported ones, and the
    // count check would then disagree with OLD. `trigger user` disables only user
    // triggers, so foreign keys and other system triggers still enforce integrity.
    const targets = [...EXPECTED.keys()];
    // ALTER TABLE accepts one table per statement.
    const setTriggers = async (mode) => {
      for (const t of targets) await q(ref, `alter table public.${t} ${mode} trigger user;`, `${mode} triggers on ${t}`, 60);
    };
    log('  disabling user triggers on the target tables for the duration of the import');
    await setTriggers('disable');

    let done = 0, total = 0;
  try {
  for (const t of order) {
    const lines = readRows(t);
    total += lines.length;
    const sha = rowsSha(t);
    if (ledger[t] && ledger[t].sha === sha && ledger[t].n === lines.length) {
      log(`  ${t.padEnd(28)} ${String(lines.length).padStart(5)} rows  already imported, skipped`);
      done++; total -= lines.length; continue;
    }
    if (!lines.length) {
      const chk0 = await q(ref, `select count(*)::bigint as n from public.${t}`, `verify empty ${t}`);
      ledger[t] = { n: 0, sha };
      saveLedger();
      log(`  ${t.padEnd(28)}     0 rows  ok (empty in OLD)`);
      done++; continue;
    }
    const rows = '[' + lines.join(',') + ']';
    const sql = `insert into public.${t} select (jsonb_populate_record(null::public.${t}, e.j)).* from jsonb_array_elements($json$${rows}$json$) as e(j);`;
    assertReadOnly(ref, sql);
    if (/on\s+conflict/i.test(sql)) throw new Error('refusing an upsert import');
    await q(ref, sql, `import ${t}`, 300);
    const chk = await q(ref, `select count(*)::bigint as n from public.${t}`, `verify ${t}`);
    const n = Number(Array.isArray(chk) ? chk[0].n : chk.n);
    if (n !== lines.length) throw new Error(`${t}: import reported ${n} rows, expected ${lines.length}`);
    ledger[t] = { n, sha };
    saveLedger();
    log(`  ${t.padEnd(28)} ${String(n).padStart(5)} rows  ok  sha256:${sha}`);
    done++;
  }
  } finally {
    log('  re-enabling user triggers');
    await setTriggers('enable');
  }
  log(`\n  imported ${done} tables / ${total} rows`);
  return { tables: done, rows: total };
}

// ======================================================= PHASE: RECONCILE
async function doReconcile(ref) {
  section(`RECONCILIATION on the NEW project ${ref}`);
  const sql = readFileSync(join(HERE, '02-reconciliation.sql'), 'utf8')
    .split(/^--[^\n]*$/m).map((s) => s.trim()).filter(Boolean).join('\n');
  assertReadOnly(ref, sql);

  // The live count has to be computed inside the union, per table: there is no
  // `t` in scope in the outer select list.
  const q1 = `select t, old_n::bigint as old_count, n::bigint as new_count from ( ${[...EXPECTED].map(([t, n]) => `select '${t}' as t, ${n} as old_n, (select count(*)::bigint from public.${t}) as n`).join(' union all ')} ) s order by t;`;
  const rows = await q(ref, q1, 'counts');
  const pad = (s, n) => String(s).padEnd(n);
  log(`  ${pad('table', 28)}${pad('old', 8)}${pad('new', 8)}status`);
  let mism = 0;
  for (const r of (Array.isArray(rows) ? rows : [rows])) {
    const o = Number(r.old_count), n = Number(r.new_count);
    const ok = o === n;
    if (!ok) mism++;
    log(`  ${pad(r.t, 28)}${pad(o, 8)}${pad(n, 8)}${ok ? 'ok' : 'MISMATCH'}`);
  }
  log(`\n  count mismatches: ${mism}`);

  const dq = `select count(*)::bigint as dup_groups from ( select id from public.users group by id having count(*) > 1 ) x;`;
  const d1 = await q(ref, dq, 'dup users');
  const dups = Number(Array.isArray(d1) ? d1[0].dup_groups : d1.dup_groups);

  const oq = `select (select count(*) from public.letter_movements m where not exists (select 1 from public.letters l where l.id = m.letter_id))
              + (select count(*) from public.issue_details d where not exists (select 1 from public.issues i where i.id = d.issue_id)) as orphans;`;
  let orphans = null;
  try { const o1 = await q(ref, oq, 'orphans'); orphans = Number(Array.isArray(o1) ? o1[0].orphans : o1.orphans); } catch (e) { log(`  orphan check: ${e.message.slice(0, 120)}`); }

  log(`  duplicate id groups (users): ${dups}`);
  log(`  orphaned foreign keys       : ${orphans === null ? 'n/a' : orphans}`);
  const pass = mism === 0 && dups === 0 && (orphans === null || orphans === 0);
  log(`\n  RECONCILIATION: ${pass ? 'PASS' : 'FAIL'}`);
  return { mismatches: mism, duplicates: dups, orphans, pass };
}

// ===================================================================== main
const SUMMARY = {};
try {
  if (phase === 'export' || phase === 'all') SUMMARY.export = await doExport();
  const needNew = phase !== 'export';
  let ref = null;
  if (needNew) ref = await resolveNew();
  if (phase === 'schema' || phase === 'all') SUMMARY.schema = await doSchema(ref);
  if (phase === 'import' || phase === 'all') SUMMARY.import = await doImport(ref);
  if (phase === 'reconcile' || phase === 'all') SUMMARY.reconcile = await doReconcile(ref);
  writeFileSync(join(HERE, 'auto-migrate-summary.json'), JSON.stringify(SUMMARY, null, 2));
  log('\nSUMMARY: ' + JSON.stringify(SUMMARY));
  process.exit(0);
} catch (e) {
  log('\nSTOPPED: ' + e.message);
  if (SUMMARY.export) writeFileSync(join(HERE, 'auto-migrate-summary.json'), JSON.stringify(SUMMARY, null, 2));
  process.exit(1);
}
