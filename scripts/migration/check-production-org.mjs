// Read-only: what does the Production token see, and is the new project free of
// the storage-quota restriction that blocks the other two?
//
//   node scripts/migration/check-production-org.mjs --ref frlbqxpbtzgvvrqedgqx

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
    let b; try { b = JSON.parse(txt); } catch { b = txt.slice(0, 200); }
    return { status: r.status, body: b };
  }
}

console.log(`\n=== 1. organizations the Production token can see ===\n`);
const orgs = await call('/organizations');
if (Array.isArray(orgs.body)) {
  console.log(`  count: ${orgs.body.length}`);
  for (const o of orgs.body) console.log(`    id=${o.id}  name=${o.name}  plan=${o.plan ?? 'n/a'}`);
} else {
  console.log(`  HTTP ${orgs.status}  ${JSON.stringify(orgs.body).slice(0, 200)}`);
}

console.log(`\n=== 2. projects the Production token can see ===\n`);
const projs = await call('/projects');
if (Array.isArray(projs.body)) {
  console.log(`  count: ${projs.body.length}`);
  for (const p of projs.body) {
    console.log(`    ${p.ref}  org=${p.organization_id}  ${p.status}  "${p.name}"`);
  }
} else {
  console.log(`  HTTP ${projs.status}  ${JSON.stringify(projs.body).slice(0, 200)}`);
}

console.log(`\n=== 3. the new project's own org ===\n`);
const p = await call(`/projects/${REF}`);
if (p.status === 200) {
  const orgId = p.body.organization_id;
  console.log(`  project      : ${p.body.name}  (${p.body.ref})`);
  console.log(`  organization : ${orgId}`);
  const o = await call(`/organizations/${orgId}`);
  console.log(`  read that org: HTTP ${o.status}` + (o.status === 200 ? `  name=${o.body.name}  plan=${o.body.plan}` : ''));
  const op = await call(`/organizations/${orgId}/projects`);
  console.log(`  org projects : HTTP ${op.status}` + (Array.isArray(op.body) ? `  count=${op.body.length}` : ''));
  if (Array.isArray(op.body)) for (const x of op.body) console.log(`      ${x.ref}  ${x.status}  "${x.name}"`);
} else {
  console.log(`  HTTP ${p.status}`);
}

console.log(`\n=== 4. data plane, clean comparison ===\n`);
const keys = await call(`/projects/${REF}/api-keys`);
const anon = Array.isArray(keys.body) ? keys.body.find((k) => k.id === 'anon')?.api_key : null;
if (anon) {
  for (const [name, path] of [
    ['AUTH health  ', '/auth/v1/health'],
    ['AUTH settings', '/auth/v1/settings'],
    ['REST read    ', '/rest/v1/archive_qr_codes?select=id&limit=1'],
    ['STORAGE      ', '/storage/v1/bucket'],
  ]) {
    let r;
    try {
      r = await fetch(`https://${REF}.supabase.co${path}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    } catch (e) { console.log(`  ${name}  ERROR ${e.message}`); continue; }
    const t = await r.text();
    let msg = t.slice(0, 150);
    try { msg = JSON.parse(t).message ?? msg; } catch { /* raw */ }
    console.log(`  ${name}  HTTP ${r.status}  ${msg}`);
    await sleep(300);
  }
}
console.log('');
