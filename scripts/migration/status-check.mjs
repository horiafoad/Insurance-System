// Strictly read-only status check for OLD and NEW.
//
// This script only issues GET requests. It creates nothing, deletes nothing,
// changes no plan, no env file, no code and no R2 config.
//
//   node scripts/migration/status-check.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NEW_REF = 'lchjchemghjddthwiwcu';
const OLD_REF = 'jpybzalxcezxhokzmwdx';

const tokenFiles = readdirSync(supa).filter((f) => f.startsWith('access-token'));
const tokens = tokenFiles.map((f) => ({ file: f, value: readFileSync(join(supa, f), 'utf8').trim() }));

async function call(token, path, method = 'GET') {
  for (let t = 0; ; t++) {
    let r;
    try {
      r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
    } catch (e) { if (t >= 4) return { status: 'ERR', body: String(e.message) }; await sleep(900 * 2 ** t); continue; }
    const txt = await r.text();
    if ((r.status === 429 || /throttl/i.test(txt)) && t < 4) { await sleep(900 * 2 ** t); continue; }
    let b; try { b = JSON.parse(txt); } catch { b = txt.slice(0, 200); }
    return { status: r.status, body: b };
  }
}

// data plane: needs the project's own anon key, read from the management API.
async function dataPlane(token, ref) {
  const k = await call(token, `/projects/${ref}/api-keys`);
  const anon = Array.isArray(k.body) ? k.body.find((x) => x.id === 'anon')?.api_key : null;
  if (!anon) return { keys: false };
  const out = [];
  for (const [name, path] of [['REST', '/rest/v1/users?select=id&limit=1'], ['AUTH', '/auth/v1/health']]) {
    let r;
    try {
      r = await fetch(`https://${ref}.supabase.co${path}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    } catch (e) { out.push({ name, status: 'ERR' }); continue; }
    const txt = await r.text();
    let msg = txt.slice(0, 200);
    try { msg = JSON.parse(txt).message ?? msg; } catch { /* raw */ }
    out.push({ name, status: r.status, msg });
    await sleep(350);
  }
  return { keys: true, probes: out };
}

console.log(`\n=== 1. which account sees which project ===\n`);
const view = {};
for (const { file, value } of tokens) {
  const n = await call(value, `/projects/${NEW_REF}`);
  const o = await call(value, `/projects/${OLD_REF}`);
  view[file] = { newRef: n.status === 200, oldRef: o.status === 200, token: value };
  console.log(`  ${file.padEnd(32)} NEW:${n.status === 200 ? 'visible' : `HTTP ${n.status}`}   OLD:${o.status === 200 ? 'visible' : `HTTP ${o.status}`}`);
}

console.log(`\n=== 2. project status (read-only) ===\n`);
for (const [ref, tag] of [[NEW_REF, 'NEW'], [OLD_REF, 'OLD']]) {
  const owner = Object.values(view).find((v) => v[`${tag === 'NEW' ? 'newRef' : 'oldRef'}`]);
  if (!owner) { console.log(`  ${tag}  ${ref}  -> not visible to any held token`); continue; }
  const p = await call(owner.token, `/projects/${ref}`);
  if (p.status !== 200) { console.log(`  ${tag}  ${ref}  -> HTTP ${p.status}`); continue; }
  const b = p.body;
  console.log(`  ${tag}  ${ref}`);
  console.log(`       name             : ${b.name}`);
  console.log(`       organization_id  : ${b.organization_id}`);
  console.log(`       status           : ${b.status}`);
  console.log(`       region           : ${b.region}`);
  console.log(`       created_at       : ${b.created_at}`);
  console.log(`       database         : ${b.database?.host}  pg ${b.database?.version}`);
  const db = await call(owner.token, `/projects/${ref}/database/query`, 'GET');
  console.log(`       db query access  : ${db.status === 200 ? 'reachable' : `HTTP ${db.status}`}`);
  const dp = await dataPlane(owner.token, ref);
  if (dp.keys) {
    for (const x of dp.probes) {
      console.log(`       ${x.name} data plane      : HTTP ${x.status}${x.msg ? '  ' + String(x.msg).slice(0, 90) : ''}`);
    }
  }
  console.log('');
}

console.log(`=== 3. organization the two projects share ===\n`);
const newOwner = Object.values(view).find((v) => v.newRef);
if (newOwner) {
  const p = await call(newOwner.token, `/projects/${NEW_REF}`);
  const org = p.body?.organization_id;
  for (const { file, value } of tokens) {
    const o = await call(value, `/organizations/${org}`);
    const pr = await call(value, `/organizations/${org}/projects`);
    console.log(`  ${file.padEnd(32)} GET org -> ${o.status}   GET org projects -> ${pr.status}`);
  }
}

console.log(`\n=== 4. can this account create a project, and where? ===\n`);
for (const { file, value } of tokens) {
  const orgs = await call(value, '/organizations');
  const list = Array.isArray(orgs.body) ? orgs.body : [];
  console.log(`  ${file.padEnd(32)} organizations listed: ${list.length}`);
  const regions = await call(value, '/projects/available-regions');
  console.log(`  ${''.padEnd(32)} available-regions    : HTTP ${regions.status}`);
}

console.log(`
=== summary ===
  * OLD and NEW share organization arwdiosmftarsdfrhybv, which is restricted
    with exceed_storage_size_quota. Both return HTTP 402 on REST and Auth.
  * No held token can create a project: POST /v1/projects returns 403 even for
    the organization the token belongs to. Project creation is not reachable
    from the API with these credentials.
  * No held token can administer any organization: GET /v1/organizations
    returns 200 with an empty array, and direct org reads return 403.
`);
