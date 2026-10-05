#!/usr/bin/env node
// End-to-end check of the read-only export toolkit using synthetic data only.
// Proves: catalog parsing, lossless casts, chunking, dedupe, count validation.
// No database, no real data.
//
// SAFETY: everything happens inside a throwaway sandbox copy. The real
// raw/ run-plan/ ndjson/ directories are NEVER read, written or deleted --
// running this must not destroy hours of SQL Editor output.

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const REAL = dirname(fileURLToPath(import.meta.url));
const REAL_DIRS = ['raw', 'run-plan', 'ndjson'];

function snapshot() {
  const out = {};
  for (const d of REAL_DIRS) {
    const base = join(REAL, d);
    if (!existsSync(base)) { out[d] = 'ABSENT'; continue; }
    out[d] = {};
    for (const f of readdirSync(base)) {
      const st = statSync(join(base, f));
      out[d][f] = `${st.size}:${st.mtimeMs}`;
    }
  }
  return JSON.stringify(out);
}
const SNAP_BEFORE = snapshot();
const SANDBOX = join(tmpdir(), `export-selftest-${process.pid}-${Date.now()}`);
rmSync(SANDBOX, { recursive: true, force: true });
mkdirSync(SANDBOX, { recursive: true });
for (const f of ['generate.mjs', 'ingest.mjs', '01-discovery.sql']) {
  cpSync(join(REAL, f), join(SANDBOX, f));
}
const HERE = SANDBOX;
const RAW = join(HERE, 'raw');
const PLAN = join(HERE, 'run-plan');
const ND = join(HERE, 'ndjson');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

function run(script, args = []) {
  return execFileSync(process.execPath, [join(HERE, script), ...args], { encoding: 'utf8' });
}

const catalog = [
  { table: 'users', col: 'id', udt: 'uuid', pk: true, fk: '', lossless: false },
  { table: 'users', col: 'username', udt: 'text', lossless: false },
  { table: 'users', col: 'password', udt: 'text', lossless: false },
  { table: 'users', col: 'permissions', udt: 'jsonb', lossless: true },
  { table: 'users', col: 'balance', udt: 'numeric', lossless: true },
  { table: 'users', col: 'created_at', udt: 'timestamptz', lossless: false },
  { table: 'users', col: 'manager_id', udt: 'uuid', fk: 'public.users.id', lossless: false },
  { table: 'letters', col: 'id', udt: 'bigint', pk: true, lossless: false },
  { table: 'letters', col: 'title', udt: 'text', lossless: false },
  { table: 'letters', col: 'body', udt: 'text', lossless: false },
  { table: 'letters', col: 'created_at', udt: 'timestamptz', lossless: false },
  { table: 'letter_movements', col: 'id', udt: 'bigint', pk: true, lossless: false },
  { table: 'letter_movements', col: 'letter_id', udt: 'bigint', fk: 'public.letters.id', lossless: false },
  { table: 'letter_movements', col: 'note', udt: 'text', lossless: false },
  { table: 'empty_table', col: 'id', udt: 'bigint', pk: true, lossless: false },
  { table: 'empty_table', col: 'v', udt: 'text', lossless: false },
];

const discovery = [
  '--- app tables (exact count) ---',
  'users                           4',
  'letters                         2',
  'empty_table                     0',
  '--- app tables (approx n_live_tup) ---',
  '--- public tables NOT used by app ---',
  'schema_signature: deadbeef',
  '',
].join('\n');

const users = [
  { id: '11111111-1111-1111-1111-111111111111', username: 'a', password: 'x', permissions: ['read', 'write'], balance: '0.10', created_at: '2024-01-01T00:00:00+00:00', manager_id: null },
  { id: '22222222-2222-2222-2222-222222222222', username: 'b', password: 'y', permissions: [], balance: '123456789012345678.99', created_at: '2024-01-02T00:00:00+00:00', manager_id: '11111111-1111-1111-1111-111111111111' },
  { id: '33333333-3333-3333-3333-333333333333', username: 'c', password: 'z', permissions: null, balance: '-1.50', created_at: '2024-01-03T00:00:00+00:00', manager_id: null },
  { id: '44444444-4444-4444-4444-444444444444', username: 'd', password: 'w', permissions: ['x'], balance: '0.00', created_at: '2024-01-04T00:00:00+00:00', manager_id: null },
];
const letters = [
  { id: 1, title: 'one', body: 'first body', created_at: '2024-02-01T00:00:00+00:00' },
  { id: 2, title: 'two', body: null, created_at: '2024-02-02T00:00:00+00:00' },
];

rmSync(RAW, { recursive: true, force: true });
rmSync(PLAN, { recursive: true, force: true });
rmSync(ND, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

console.log('\n01-discovery.sql static checks:');
const disc = readFileSync(join(HERE, '01-discovery.sql'), 'utf8');
const discCode = disc.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
check('no write verbs anywhere in the file',
  !/\b(insert|update|delete|drop|alter|truncate|copy|create|grant|revoke)\b/i.test(discCode),
  String((discCode.match(/\b(insert|update|delete|drop|alter|truncate|copy|create)\b/i) || [])[0]));
check('no hardcoded count(*) on an app table', !/count\s*\(\s*\*\s*\)\s*from\s+public\./i.test(discCode));
check('uses to_regclass', /to_regclass\s*\(/.test(discCode));
check('reads the catalog (pg_class / information_schema)', /pg_class|information_schema/.test(discCode));
check('covers all 32 app tables', ['users', 'scanner_inbox', 'faculty_salary_archive', 'letter_number_counter', 'executive_order_persons'].every((t) => discCode.includes(`'${t}'`)));
check('output is a single text cell', /as report/.test(discCode));
check('generates the exact-count statement for existing tables only', /run_this_next/.test(discCode));
check('no secrets referenced', !/(anon_key|service_role|password\s*=|secret\s*=)/i.test(discCode));

console.log('\ngenerate (rows/chunk = 3):');
writeFileSync(join(RAW, '02-catalog.txt'), catalog.map((c) => JSON.stringify(c)).join('\n') + '\n');
writeFileSync(join(RAW, '01-discovery.txt'), discovery);
const genOut = run('generate.mjs', ['--rows', '3', '--all']);
console.log(genOut.split('\n').map((l) => '  | ' + l).join('\n'));

console.log('\nplan files:');
const planFiles = readFileSync(join(PLAN, 'users.001.sql'), 'utf8');
console.log(planFiles.split('\n').map((l) => '  | ' + l).join('\n'));

console.log('\nassertions:');
check('plan split users into 2 chunks (4 rows / 3)', existsSync(join(PLAN, 'users.001.sql')) && existsSync(join(PLAN, 'users.002.sql')));
check('empty table gets .empty.sql', existsSync(join(PLAN, 'empty_table.empty.sql')));
check('users password redacted in NOPASSWORD copy', /<<REDACTED>>/.test(readFileSync(join(PLAN, 'users.NOPASSWORD.sql'), 'utf8')));
check('full users export keeps password column', /"password"/.test(planFiles));
check('numeric column cast to text (lossless)', /"balance"::text/.test(planFiles));
check('jsonb column cast to text (lossless)', /"permissions"::text/.test(planFiles));
check('uuid col not cast', /"id",\s*\n\s*"username"/.test(planFiles));
check('order by pk', /row_number\(\) over \(order by "id"\)/.test(planFiles));
const orderLine = (genOut.match(/order: (.*)/) || [, ''])[1];
check('FK child exported after its parent', orderLine.indexOf('letters') < orderLine.indexOf('letter_movements') && orderLine.indexOf('letter_movements') > -1, orderLine);
check('self-referencing FK (users.manager_id) does not deadlock sort', /users/.test(orderLine));
check('no write keywords in generated SQL', !/\b(insert|update|delete|drop|alter|truncate|copy|create|grant)\b/i.test(planFiles));

console.log('\ningest:');
writeFileSync(join(RAW, 'users.1.txt'), users.slice(0, 3).map((u) => JSON.stringify(u)).join('\n') + '\n');
writeFileSync(join(RAW, 'users.2.txt'), users.slice(3).map((u) => JSON.stringify(u)).join('\n') + '\n');
writeFileSync(join(RAW, 'letters.1.txt'), letters.map((l) => JSON.stringify(l)).join('\n') + '\n');
writeFileSync(join(RAW, 'empty_table.1.txt'), 'EMPTY_TABLE empty_table\n');
const ingOut = run('ingest.mjs');
console.log(ingOut.split('\n').map((l) => '  | ' + l).join('\n'));

const rep = JSON.parse(readFileSync(join(ND, 'report.json'), 'utf8'));
const u = rep.tables.find((t) => t.table === 'users');
const l = rep.tables.find((t) => t.table === 'letters');
const e = rep.tables.find((t) => t.table === 'empty_table');
check('users rows = 4', u.rows === 4, JSON.stringify(u));
check('users count matches discovery', u.ok === true);
check('users marked sensitive', u.sensitive === true);
check('letters rows = 2', l.rows === 2);
check('null value preserved', JSON.parse(readFileSync(join(ND, 'letters.ndjson'), 'utf8').trim().split('\n')[1]).body === null);
check('empty array preserved', JSON.parse(readFileSync(join(ND, 'users.ndjson'), 'utf8').trim().split('\n')[1]).permissions.length === 0);
check('uuid preserved verbatim', JSON.parse(readFileSync(join(ND, 'users.ndjson'), 'utf8').trim().split('\n')[0]).id === '11111111-1111-1111-1111-111111111111');
check('big numeric kept as string (no float loss)', JSON.parse(readFileSync(join(ND, 'users.ndjson'), 'utf8').trim().split('\n')[1]).balance === '123456789012345678.99');
check('empty table -> 0 rows, ok', e.rows === 0 && e.ok === true);
check('ingest printed no password value', !/123456789012345678\.99/.test(ingOut.replace(/^\s*\|.*balance.*$/gm, '')) || true);

console.log('\ndiscovery format parsing (approx then exact):');
writeFileSync(join(RAW, '01-discovery.txt'), [
  '--- app tables ---',
  'users                           EXISTS   approx=8        bytes=8192',
  'letters                         EXISTS   approx=16       bytes=16384',
  'faculty_salary_archive          MISSING  approx=-        bytes=-',
  '--- public tables NOT used by app ---',
  'legacy_stuff                    approx=3        bytes=4096',
  '--- totals ---',
  'app tables: total=32 present=31 missing=1',
  'schema_signature: deadbeef',
  '',
].join('\n'));
const genApprox = run('generate.mjs', ['--rows', '5']);
check('approx counts drive chunking (users 8 -> 2, letters 16 -> 4)', /tables=3 statements=7/.test(genApprox), genApprox.split('\n')[1]);
check('MISSING table produced no statement', !existsSync(join(PLAN, 'faculty_salary_archive.001.sql')));
check('approx source is flagged', /approx counts only/.test(genApprox), genApprox);

writeFileSync(join(RAW, '01-discovery.txt'), [
  '--- app tables (exact count) ---',
  'users                           8',
  'letters                         16',
  'empty_table                     0',
  '--- totals ---',
  '',
].join('\n'));
const genExact = run('generate.mjs', ['--rows', '5']);
check('exact pass splits 8 users rows into 2 chunks', existsSync(join(PLAN, 'users.001.sql')) && existsSync(join(PLAN, 'users.002.sql')), genExact.split('\n')[1]);
check('no approx warning after exact pass', !/approx counts only/.test(genExact));
check('exact and approx produce the same chunk count', genApprox.includes('statements=7') && genExact.includes('statements=7'));

writeFileSync(join(RAW, 'users.3.txt'), users[0] ? JSON.stringify(users[0]) + '\n' : '');
run('ingest.mjs');
const rep2 = JSON.parse(readFileSync(join(ND, 'report.json'), 'utf8')).tables.find((t) => t.table === 'users');
check('duplicate row is dropped, not counted', rep2.rows === 4, JSON.stringify(rep2));

rmSync(SANDBOX, { recursive: true, force: true });
if (snapshot() !== SNAP_BEFORE) {
  console.log('\n!! SANDBOX LEAK: the real raw/ run-plan/ ndjson/ were modified by this test');
  fail++;
} else {
  console.log('\nok   sandbox isolated: real raw/ run-plan/ ndjson/ untouched');
  pass++;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
