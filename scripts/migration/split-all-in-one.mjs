#!/usr/bin/env node
// Splits the 2 all-in-one SQL Editor cells into per-table raw files so that
// the existing ingest.mjs validation can run unchanged.
//
// It also audits the result against the authoritative exact counts, so a
// truncated cell or a wrong table is caught before anything is imported.
// It never prints row content, credentials or secrets.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPORT = join(HERE, '..', 'export-old-data');
const RAW = join(EXPORT, 'raw');
const manifest = existsSync(join(EXPORT, 'run-plan', 'manifest.json'))
  ? JSON.parse(readFileSync(join(EXPORT, 'run-plan', 'manifest.json'), 'utf8')) : { tables: [] };
const counts = new Map(manifest.tables.map((t) => [t.table, t.exact_count]));
if (!counts.size) { console.error('run-plan/manifest.json missing. Run generate.mjs first.'); process.exit(1); }

const groups = readdirSync(RAW).filter((f) => /^[AB]-[a-z]+\.txt$/i.test(f));
if (!groups.length) {
  console.log('Nothing to split. Save the SQL Editor cells as:');
  console.log('  scripts/export-old-data/raw/A-sensitive.txt');
  console.log('  scripts/export-old-data/raw/B-rest.txt');
  process.exit(0);
}

// clear only the derived per-table files, never the group cells themselves
for (const f of readdirSync(RAW)) {
  if (/^[a-z_0-9]+\.\d+\.txt$/i.test(f) && f !== '01-discovery.txt') rmSync(join(RAW, f));
}

const got = new Map();
for (const g of groups) {
  const text = readFileSync(join(RAW, g), 'utf8');
  // blocks look like:  ###TABLE <name>\n<rows>\n###END <name>
  const re = /###TABLE ([a-z_0-9]+)\r?\n([\s\S]*?)\r?\n?###END \1(?![a-z_0-9])/g;
  let m, found = 0;
  while ((m = re.exec(text)) !== null) {
    const [, table, body] = m;
    found++;
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0] === `EMPTY_TABLE ${table}`) {
      // still write the file: a zero-row table must exist downstream, or
      // ingest/import would report it as missing instead of empty
      writeFileSync(join(RAW, `${table}.001.txt`), '', 'utf8');
      got.set(table, 0);
      continue;
    }
    let bad = 0;
    for (const l of lines) { try { JSON.parse(l); } catch { bad++; } }
    if (bad) { console.log(`  !! ${table}: ${bad} line(s) are not valid JSON - cell may be truncated`); }
    writeFileSync(join(RAW, `${table}.001.txt`), lines.join('\n') + (lines.length ? '\n' : ''));
    got.set(table, lines.length);
  }
  console.log(`${g.padEnd(18)} ${found} table block(s) found`);
}

console.log(`\n${'table'.padEnd(28)}${'got'.padStart(8)}${'expected'.padStart(10)}  status`);
let bad = 0, rows = 0;
for (const [t, exp] of counts) {
  const have = got.has(t) ? got.get(t) : null;
  rows += have ?? 0;
  const ok = have === exp;
  if (!ok) bad++;
  console.log(`${t.padEnd(28)}${String(have ?? '-').padStart(8)}${String(exp).padStart(10)}  ${ok ? 'ok' : 'MISMATCH'}`);
}
console.log(`\ntables=${counts.size} rows=${rows}/${[...counts.values()].reduce((a, b) => a + b, 0)} mismatched=${bad}`);
if (bad) {
  console.log('\nRe-run the matching SQL Editor statement and re-save the cell.');
  process.exit(1);
}
console.log(`\nAll ${counts.size} tables match the authoritative counts.`);
console.log('next: node scripts/export-old-data/ingest.mjs');
console.log('      node scripts/migration/build-import-sql.mjs');
