// Read-only discovery of the Production project frlbqxpbtzgvvrqedgqx.
// Creates nothing, writes nothing, runs no DDL and no DML.
//
//   node scripts/migration/discover-production.mjs --ref frlbqxpbtzgvvrqedgqx

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const REF = arg('--ref', 'frlbqxpbtzgvvrqedgqx');

const tokens = [];
// An env var wins, so the Production token never has to be written to disk or
// pasted into a conversation.
if (process.env.SUPABASE_ACCESS_TOKEN) {
  tokens.push({ file: 'env:SUPABASE_ACCESS_TOKEN', value: process.env.SUPABASE_ACCESS_TOKEN.trim() });
}
// The Production project belongs to a different account, so its token lives in
// its own profile file rather than overwriting the default one.
const prodTokenPath = join(supa, 'access-token.production');
if (existsSync(prodTokenPath)) {
  tokens.push({ file: 'access-token.production', value: readFileSync(prodTokenPath, 'utf8').trim() });
}
for (const f of readdirSync(supa).filter((f) => f.startsWith('access-token'))) {
  tokens.push({ file: f, value: readFileSync(join(supa, f), 'utf8').trim() });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token, path, method = 'GET', body) {
  for (let t = 0; ; t++) {
    let r;
    try {
      r = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { if (t >= 4) return { status: 'ERR', body: String(e.message) }; await sleep(900 * 2 ** t); continue; }
    const txt = await r.text();
    if ((r.status === 429 || /throttl/i.test(txt)) && t < 4) { await sleep(900 * 2 ** t); continue; }
    let b; try { b = JSON.parse(txt); } catch { b = txt.slice(0, 200); }
    return { status: r.status, body: b };
  }
}

// 1. which token can see the new project?
console.log(`\n=== 1. visibility of ${REF} ===\n`);
let owner = null;
for (const { file, value } of tokens) {
  const p = await call(value, `/projects/${REF}`);
  console.log(`  ${file.padEnd(32)} HTTP ${p.status}`);
  if (p.status === 200 && !owner) owner = { file, token: value, project: p.body };
}
if (!owner) {
  console.log(`\n  No held token can see ${REF}.`);
  console.log(`  Restore a token for that account, or run with SUPABASE_ACCESS_TOKEN set.\n`);
  process.exit(2);
}
const P = owner.project;
console.log(`\n  using token: ${owner.file}`);
console.log(`  name             : ${P.name}`);
console.log(`  organization_id  : ${P.organization_id}`);
console.log(`  status           : ${P.status}`);
console.log(`  region           : ${P.region}`);
console.log(`  created_at       : ${P.created_at}`);
console.log(`  database         : ${P.database?.host}  pg ${P.database?.version}`);

const RESTRICTED_ORG = 'arwdiosmftarsdfrhybv';
console.log(`\n  is it in the restricted org (${RESTRICTED_ORG}): ${P.organization_id === RESTRICTED_ORG ? 'YES - problem' : 'NO - good'}`);

// 2. is the data plane actually serving?
const keys = await call(owner.token, `/projects/${REF}/api-keys`);
const anon = Array.isArray(keys.body) ? keys.body.find((k) => k.id === 'anon')?.api_key : null;
console.log(`\n=== 2. data plane health ===\n`);
if (anon) {
  for (const [name, path] of [['AUTH health', '/auth/v1/health'], ['REST', '/rest/v1/']]) {
    let r;
    try { r = await fetch(`https://${REF}.supabase.co${path}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }); }
    catch (e) { console.log(`  ${name.padEnd(14)} ERROR ${e.message}`); continue; }
    const t = await r.text();
    console.log(`  ${name.padEnd(14)} HTTP ${r.status}  ${t.slice(0, 110)}`);
    await sleep(300);
  }
  const ids = Array.isArray(keys.body) ? keys.body.map((k) => `${k.id}/${k.type}`).join(', ') : 'n/a';
  console.log(`\n  api keys present: ${ids}`);
} else {
  console.log(`  could not read api keys (HTTP ${keys.status})`);
}

// 3. what is already in the database? (read-only counts, no DDL)
console.log(`\n=== 3. current database contents (read-only) ===\n`);
const q = async (sql) => {
  const r = await call(owner.token, `/projects/${REF}/database/query`, 'POST', { query: sql });
  return r.status === 200 || r.status === 201 ? r.body : { error: `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}` };
};
const tables = await q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;`);
if (Array.isArray(tables)) {
  console.log(`  public tables: ${tables.length}`);
  console.log(`  ${tables.map((t) => t.table_name).join(', ') || '(none)'}`);
} else {
  console.log(`  ${JSON.stringify(tables)}`);
}
const size = await q(`select pg_size_pretty(pg_database_size(current_database())) as pretty;`);
console.log(`\n  database size: ${Array.isArray(size) ? size[0].pretty : JSON.stringify(size)}`);

// 4. auth/storage schema sanity for the migration
console.log(`\n=== 4. platform schemas (read-only) ===\n`);
const sch = await q(`select nspname from pg_namespace where nspname in ('auth','storage','graphql_public','supabase_api') order by nspname;`);
console.log(`  ${Array.isArray(sch) ? sch.map((s) => s.nspname).join(', ') : JSON.stringify(sch)}`);
console.log('');
