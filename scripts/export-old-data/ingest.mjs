#!/usr/bin/env node
// Validates pasted SQL Editor output into NDJSON files + a manifest.
// Never prints row content (users.password must never reach terminal output).

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'raw');
const OUT = join(HERE, 'ndjson');
const manifestPath = join(HERE, 'run-plan', 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { tables: [] };
const expected = new Map(manifest.tables.map((t) => [t.table, t.exact_count]));

mkdirSync(OUT, { recursive: true });
if (!existsSync(RAW)) {
  console.log('raw/ not found. Copy the SQL Editor output files there first.');
  process.exit(0);
}

function clean(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{') && l.endsWith('}'));
}

const files = readdirSync(RAW).filter((f) => /^[a-z_0-9]+\.\d+\.txt$/.test(f) || /^[a-z_0-9]+\.txt$/.test(f));
const byTable = new Map();

for (const f of files) {
  const table = f.replace(/(\.\d+)?\.txt$/, '');
  if (table.startsWith('0')) continue;
  if (!byTable.has(table)) byTable.set(table, []);
  byTable.get(table).push(f);
}

const report = [];
for (const [table, list] of byTable) {
  list.sort();
  const lines = [];
  let bad = 0;
  for (const f of list) {
    const body = clean(readFileSync(join(RAW, f), 'utf8'));
    for (const l of body) {
      try { JSON.parse(l); lines.push(l); } catch { bad++; }
    }
  }

  // Deduplicate ONLY on a real unique key. Never on the whole line: two
  // identical rows in a table without an id are two genuine rows, and
  // collapsing them would lose data while still "passing" the count check.
  const uniq = [];
  const seen2 = new Set();
  let dupIds = 0;
  for (const l of lines) {
    const o = JSON.parse(l);
    if (o.id !== undefined && o.id !== null) {
      const k = `id=${o.id}`;
      if (seen2.has(k)) { dupIds++; continue; }
      seen2.add(k);
    }
    uniq.push(l);
  }

  const path = join(OUT, `${table}.ndjson`);
  const content = uniq.join('\n') + (uniq.length ? '\n' : '');
  writeFileSync(path, content);
  const exp = expected.get(table) ?? null;
  report.push({
    table,
    rows: uniq.length,
    expected: exp,
    ok: exp === null ? null : exp === uniq.length,
    dropped_dupes: dupIds,
    invalid_json: bad,
    columns: uniq.length ? Object.keys(JSON.parse(uniq[0])).length : 0,
    sha256: createHash('sha256').update(content).digest('hex').slice(0, 16),
    bytes: statSync(path).size,
    sensitive: table === 'users' || table === 'push_subscriptions',
  });
}

report.sort((a, b) => (a.ok === false ? 1 : 0) - (b.ok === false ? 1 : 0) || a.table.localeCompare(b.table));
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ generated: new Date().toISOString(), tables: report }, null, 2));

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('table', 28)}${pad('rows', 8)}${pad('expected', 10)}${pad('ok', 5)}${pad('cols', 6)}${pad('bytes', 10)}sha256`);
let total = 0, mismatched = 0;
for (const r of report) {
  total += r.rows;
  if (r.ok === false) mismatched++;
  console.log(
    `${pad(r.table, 28)}${pad(r.rows, 8)}${pad(r.expected ?? '?', 10)}${pad(r.ok === false ? 'NO' : r.ok === null ? '?' : 'yes', 5)}` +
    `${pad(r.columns, 6)}${pad(r.bytes, 10)}${r.sha256}` +
    (r.dropped_dupes ? `  dupes=${r.dropped_dupes}` : '') +
    (r.invalid_json ? `  BAD_JSON=${r.invalid_json}` : '') +
    (r.sensitive ? '  [sensitive]' : '')
  );
}
console.log(`\ntables=${report.length} rows=${total} mismatched=${mismatched}`);
if (mismatched) console.log('! re-export the mismatched tables before importing.');
console.log('report: scripts/export-old-data/ndjson/report.json');
