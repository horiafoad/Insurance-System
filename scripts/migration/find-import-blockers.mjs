// Finds columns that block the import.
//
// The project's .sql files add columns that the live OLD database never had.
// Where such a column is declared NOT NULL with no default, importing the OLD
// rows cannot work: the export has no value for it, jsonb_populate_record turns
// a missing key into NULL, and the NOT NULL constraint rejects the insert.
//
// This lists every such column across the 29 exported tables so they can all be
// reconciled in one pass. Read-only; prints names and types only.
//
//   node scripts/migration/find-import-blockers.mjs --new-ref <ref>

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ND = join(HERE, '..', 'export-old-data', 'ndjson');
const API = 'https://api.supabase.com/v1';
const i = process.argv.indexOf('--new-ref');
const REF = i >= 0 ? process.argv[i + 1] : process.env.NEW_PROJECT_REF;
if (!REF) { console.error('usage: find-import-blockers.mjs --new-ref <ref>'); process.exit(2); }
const tokenPath = join(process.env.USERPROFILE || process.env.HOME, '.supabase', 'access-token');
if (!existsSync(tokenPath)) { console.error('no token; run: npx supabase login'); process.exit(2); }
const TOKEN = readFileSync(tokenPath, 'utf8').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function query(sql) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(`${API}/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
    } catch (e) { if (attempt >= 7) throw e; await sleep(Math.min(30000, 1000 * 2 ** attempt)); continue; }
    if (r.ok) return r.json();
    const t = await r.text();
    if ((r.status === 429 || /ThrottlerException|fetch failed/i.test(t)) && attempt < 7) {
      await sleep(Math.min(30000, 1000 * 2 ** attempt)); continue;
    }
    throw new Error(`HTTP ${r.status} ${t.slice(0, 300)}`);
  }
}

const tables = readdirSync(ND).filter((f) => f.endsWith('.ndjson')).map((f) => f.replace(/\.ndjson$/, ''));
const exported = new Map();
for (const t of tables) {
  const first = readFileSync(join(ND, `${t}.ndjson`), 'utf8').split('\n').find((l) => l.trim().startsWith('{'));
  exported.set(t, new Set(first ? Object.keys(JSON.parse(first)).map((k) => k.toLowerCase()) : []));
}

const cols = await query(
  `select c.relname as table_name, a.attname as column_name, a.attnotnull as not_null,
          pg_get_expr(d.adbin, d.adrelid) as col_default, format_type(a.atttypid, a.atttypmod) as data_type
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum;`,
);

const blockers = [];
for (const c of cols) {
  const t = String(c.table_name).toLowerCase();
  if (!exported.has(t)) continue;
  const col = String(c.column_name).toLowerCase();
  if (exported.get(t).has(col)) continue;      // the export supplies this column
  if (c.not_null !== true) continue;            // nullable is fine
  if (c.col_default) continue;                  // a default makes the insert legal
  blockers.push({ table: t, column: col, type: c.data_type });
}

console.log(`\nimport blockers on ${REF}: ${blockers.length}\n`);
if (!blockers.length) console.log('  none - every NOT NULL column is either present in the export or has a default');
for (const b of blockers) console.log(`  ${b.table}.${b.column}  ${b.type}  NOT NULL, no default, not in the OLD export`);
console.log('');
