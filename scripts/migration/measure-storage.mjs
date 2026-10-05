// Read-only: measure the actual disk usage of the NEW database and report whether
// the storage quota violation is genuinely caused by our data, or by something
// else in the organization (a sibling project, WAL, replicas, logs).
//
// The 402 says "exceed_storage_size_quota". On the Free plan the quota is
// 500 MB across the whole organization. We need to know how much of it our own
// tables actually use before deciding whether a brand new organization would
// even help.
//
//   node scripts/migration/measure-storage.mjs --ref <ref> [--token-file <path>]

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.supabase.com/v1';
const a = process.argv.slice(2);
const refArg = a.indexOf('--ref');
const tokArg = a.indexOf('--token-file');
const REF = refArg >= 0 ? a[refArg + 1] : 'lchjchemghjddthwiwcu';
const TOKEN_PATH = tokArg >= 0 ? a[tokArg + 1] : join(process.env.USERPROFILE || process.env.HOME, '.supabase', 'access-token');
if (!existsSync(TOKEN_PATH)) { console.error('no token at ' + TOKEN_PATH); process.exit(2); }
const TOKEN = readFileSync(TOKEN_PATH, 'utf8').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function q(sql) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(`${API}/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
    } catch (e) { if (attempt >= 6) throw e; await sleep(1000 * 2 ** attempt); continue; }
    if (r.ok) return r.json();
    const t = await r.text();
    if ((r.status === 429 || /Throttler|fetch failed/i.test(t)) && attempt < 6) { await sleep(1000 * 2 ** attempt); continue; }
    throw new Error(`HTTP ${r.status} ${t.slice(0, 300)}`);
  }
}
const mb = (b) => (Number(b) / 1024 / 1024).toFixed(1);

console.log(`\n=== database size on ${REF} ===\n`);

const total = await q(`select pg_size_pretty(pg_database_size(current_database())) as pretty, pg_database_size(current_database()) as bytes;`);
const t = Array.isArray(total) ? total[0] : total;
console.log(`  total database size      ${t.pretty}  (${mb(t.bytes)} MB)`);

console.log(`\n=== our 29 imported tables (data + indexes) ===\n`);
const tbl = await q(`
  select c.relname as name,
         pg_total_relation_size(c.oid) as bytes,
         pg_size_pretty(pg_total_relation_size(c.oid)) as pretty
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by pg_total_relation_size(c.oid) desc;`);
let sum = 0;
for (const r of (Array.isArray(tbl) ? tbl : [tbl])) {
  sum += Number(r.bytes);
  console.log(`  ${String(r.name).padEnd(34)} ${String(r.pretty).padStart(10)}  ${mb(r.bytes).padStart(8)} MB`);
}
console.log(`  ${'TOTAL public tables'.padEnd(34)} ${''.padStart(10)}  ${mb(sum).padStart(8)} MB`);

console.log(`\n=== what else is in the database ===\n`);
const other = await q(`
  select 'supabase_api (platform)' as bucket, count(*)::bigint as n, coalesce(sum(pg_total_relation_size(c.oid)),0) as bytes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'supabase_api' and c.relkind = 'r'
  union all
  select 'auth (platform)', count(*)::bigint, coalesce(sum(pg_total_relation_size(c.oid)),0)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth' and c.relkind = 'r'
  union all
  select 'storage (platform)', count(*)::bigint, coalesce(sum(pg_total_relation_size(c.oid)),0)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relkind = 'r'
  union all
  select 'graphql_public (platform)', count(*)::bigint, coalesce(sum(pg_total_relation_size(c.oid)),0)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'graphql_public' and c.relkind = 'r';`);
for (const r of (Array.isArray(other) ? other : [other])) {
  console.log(`  ${String(r.bucket).padEnd(30)} ${String(r.n).padStart(4)} table(s)  ${mb(r.bytes).padStart(8)} MB`);
}

const wal = await q(`select sum(size) as bytes from pg_ls_waldir();`);
const w = Array.isArray(wal) ? wal[0] : wal;
console.log(`\n  WAL on disk                         ${mb(w.bytes).padStart(8)} MB`);

console.log(`
=== reading

Free plan quota is 500 MB per ORGANIZATION, shared by every project in it.
  - If "total database size" is well under 500 MB, then this project's own data
    is not what tripped the quota. The violation is then something the org
    cannot see from the database, and a new organization is the correct fix.
  - If it is close to or over 500 MB, the data itself is the cause and a new
    project in the same organization would hit the same wall.
`);
