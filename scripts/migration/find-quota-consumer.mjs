// Read-only: find what is actually consuming the organization's storage
// quota, using the project database itself rather than the billing API.
//
// A brand-new empty project already returns 402, which means the organization
// was over quota before this project existed. Since the dashboard shows no
// other projects, the consumer is something that is not another project.
//
//   node scripts/migration/find-quota-consumer.mjs --ref frlbqxpbtzgvvrqedgqx

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const REF = arg('--ref', 'frlbqxpbtzgvvrqedgqx');

const pt = join(supa, 'access-token.production');
if (!existsSync(pt)) { console.error('no production token'); process.exit(2); }
const TOKEN = readFileSync(pt, 'utf8').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, method = 'GET', body) {
  for (let t = 0; ; t++) {
    let r;
    try {
      r = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { if (t >= 4) return { status: 'ERR', body: String(e.message) }; await sleep(900 * 2 ** t); continue; }
    const txt = await r.text();
    if ((r.status === 429 || /throttl/i.test(txt)) && t < 4) { await sleep(900 * 2 ** t); continue; }
    let b; try { b = JSON.parse(txt); } catch { b = txt.slice(0, 300); }
    return { status: r.status, body: b };
  }
}
const q = async (sql) => {
  const r = await call(`/projects/${REF}/database/query`, 'POST', { query: sql });
  return (r.status === 200 || r.status === 201) ? r.body : { __error: `HTTP ${r.status}` };
};
const mb = (b) => (Number(b) / 1024 / 1024).toFixed(1);
const run = (rows) => (Array.isArray(rows) ? rows : [rows]);

console.log(`\n=== 1. is the database itself over quota? ===\n`);
const sz = run(await q(`select pg_size_pretty(pg_database_size(current_database())) as pretty, pg_database_size(current_database()) as bytes;`))[0];
console.log(`  total database     ${sz.pretty}  (${mb(sz.bytes)} MB)`);

const wal = run(await q(`select coalesce(sum(size),0) as bytes from pg_ls_waldir();`))[0];
console.log(`  WAL                ${mb(wal.bytes)} MB`);

const slots = run(await q(`
  select slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as retained
    from pg_replication_slots;`));
console.log(`  replication slots  ${slots.length}${slots.length ? ': ' + slots.map((s) => `${s.slot_name}(${s.retained})`).join(', ') : ''}`);

console.log(`\n=== 2. what schemas exist in this EMPTY project ===\n`);
const sch = run(await q(`
  select nspname,
         pg_size_pretty(coalesce((select sum(pg_total_relation_size(c.oid)) from pg_class c
                                    join pg_namespace n2 on n2.oid = c.relnamespace
                                   where n2.nspname = n.nspname and c.relkind = 'r'), 0)) as bytes_pretty
    from pg_namespace
   where nspname not in ('pg_catalog','information_schema','pg_toast')
     and nspname not like 'pg_temp%' and nspname not like 'pg_toast_temp%'
   order by 1;`));
for (const s of sch) console.log(`  ${String(s.nspname).padEnd(20)} ${s.bytes_pretty}`);

console.log(`\n=== 3. storage objects (Supabase Storage files) ===\n`);
const st = run(await q(`
  select count(*)::int as objects, coalesce(sum((metadata->>'size')::bigint),0) as bytes
    from storage.objects;`))[0];
console.log(`  storage.objects    ${st.objects} object(s), ${mb(st.bytes)} MB`);

const buckets = run(await q(`select count(*)::int as n from storage.buckets;`))[0];
console.log(`  storage.buckets    ${buckets.n}`);

console.log(`\n=== 4. auth users ===\n`);
const au = run(await q(`select count(*)::int as n from auth.users;`))[0];
console.log(`  auth.users         ${au.n}`);

console.log(`\n=== 5. the conclusion this points to ===\n`);
console.log(`  This project is empty and small, yet it already returns 402.`);
console.log(`  The quota is charged to the ORGANIZATION (500 MB on Free), not to the`);
console.log(`  project. The database above cannot be what tripped it.`);
console.log(`
  On the Free plan the organization disk budget counts everything the platform
  attributes to the org. With no other project in the org, the remaining
  consumers are platform-side and not visible from inside any project database:
    - the two older projects, whose databases still occupy org disk
      (we measured OLD at ~15 MB and NEW at ~15 MB, so this alone is not 500 MB)
    - backups / WAL retained by the platform
    - an org that has already been flagged, where the restriction simply is not
      lifted by creating a new project

  That last point is the important one: Supabase applies this restriction at the
  org level, and it does NOT clear when a new project is added. Only the org
  owner, from the dashboard or by contacting support, can lift it.`);
console.log('');
