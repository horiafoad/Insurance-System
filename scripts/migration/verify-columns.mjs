// Column parity gate for the migration.
//
// Every column present in the OLD export must exist on the NEW table. If one is
// missing, `jsonb_populate_record` does not fail - it silently leaves the column
// at its default, so the import would report a perfect row count while quietly
// losing data. This check refuses to let that happen.
//
//   node scripts/migration/verify-columns.mjs --new-ref <ref>
//
// Exits 1 on any missing column. Prints column NAMES only, never values.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ND = join(HERE, '..', 'export-old-data', 'ndjson');
const API = 'https://api.supabase.com/v1';

const argv = process.argv.slice(2);
const refArg = argv.indexOf('--new-ref');
const REF = refArg >= 0 ? argv[refArg + 1] : process.env.NEW_PROJECT_REF;
if (!REF) {
  console.error('usage: node scripts/migration/verify-columns.mjs --new-ref <ref>');
  process.exit(2);
}

const tokenPath = join(process.env.USERPROFILE || process.env.HOME, '.supabase', 'access-token');
if (!existsSync(tokenPath)) {
  console.error('no Supabase access token found; run: npx supabase login');
  process.exit(2);
}
const TOKEN = readFileSync(tokenPath, 'utf8').trim();

async function query(sql) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(`${API}/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
    } catch (e) {
      if (attempt >= 7) throw e;
      await new Promise((res) => setTimeout(res, Math.min(30000, 1000 * 2 ** attempt)));
      continue;
    }
    if (r.ok) return r.json();
    const t = await r.text();
    if ((r.status === 429 || /ThrottlerException|fetch failed/i.test(t)) && attempt < 7) {
      await new Promise((res) => setTimeout(res, Math.min(30000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400)));
      continue;
    }
    throw new Error(`HTTP ${r.status} ${t.slice(0, 300)}`);
  }
}

const ndjsonTables = readdirSync(ND).filter((f) => f.endsWith('.ndjson')).map((f) => f.replace(/\.ndjson$/, ''));

// The keys of the first row of each NDJSON file are exactly the columns OLD had.
const exported = new Map();
for (const t of ndjsonTables) {
  const p = join(ND, `${t}.ndjson`);
  const first = readFileSync(p, 'utf8').split('\n').find((l) => l.trim().startsWith('{'));
  if (!first) { exported.set(t, new Set()); continue; } // table is empty in OLD
  exported.set(t, new Set(Object.keys(JSON.parse(first)).map((k) => k.toLowerCase())));
}

const res = await query(
  `select table_name, column_name from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position;`,
);
const actual = new Map();
for (const row of res) {
  const t = String(row.table_name).toLowerCase();
  if (!actual.has(t)) actual.set(t, new Set());
  actual.get(t).add(String(row.column_name).toLowerCase());
}

let problems = 0;
console.log(`\ncolumn parity: ${exported.size} exported table(s) vs ${actual.size} table(s) on NEW ${REF}\n`);
for (const [t, cols] of [...exported].sort((a, b) => a[0].localeCompare(b[0]))) {
  const have = actual.get(t);
  if (!have) {
    console.log(`  MISSING TABLE  ${t}`);
    problems++;
    continue;
  }
  const missing = [...cols].filter((c) => !have.has(c));
  const extra = [...have].filter((c) => !cols.has(c));
  if (missing.length) {
    problems += missing.length;
    console.log(`  MISSING COLUMN  ${t}: ${missing.join(', ')}`);
  } else {
    console.log(`  ok  ${t.padEnd(34)} ${cols.size} column(s)${extra.length ? `  (+${extra.length} new: ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ', ...' : ''})` : ''}`);
  }
}

console.log('');
if (problems) {
  console.log(`FAILED: ${problems} column(s) in the OLD export have no matching column on NEW.`);
  console.log('Importing now would silently drop those values. Fix the schema first.');
  process.exit(1);
}
console.log('PASSED: every exported column exists on NEW. Import will not drop data.');
