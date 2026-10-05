// Read-only proof: is the HTTP 402 caused by the project's organization, or by
// the project itself?
//
// NEW and OLD are both in organization arwdiosmftarsdfrhybv. If the data plane
// of BOTH projects returns the same violation string, the restriction is
// attached to the organization, and no amount of work inside either project
// will clear it.
//
//   node scripts/migration/verify-402-org-binding.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NEW_REF = 'lchjchemghjddthwiwcu';
const OLD_REF = 'jpybzalxcezxhokzmwdx';
const EXPECTED_ORG = 'arwdiosmftarsdfrhybv';

function tokenFor(preferred, fallback) {
  for (const p of [preferred, fallback]) {
    const f = join(supa, p);
    if (existsSync(f)) return { path: f, token: readFileSync(f, 'utf8').trim() };
  }
  throw new Error('no token found');
}

async function mgmtGet(path, token) {
  for (let a = 0; ; a++) {
    let r;
    try { r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }); }
    catch (e) { if (a >= 5) return { status: 'ERR', body: String(e.message) }; await sleep(1000 * 2 ** a); continue; }
    if (r.status === 429 && a < 5) { await sleep(1000 * 2 ** a); continue; }
    const t = await r.text();
    let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 300); }
    return { status: r.status, body: b };
  }
}

async function dataPlane(ref, anonKey, label) {
  const out = { label, ref, probes: [] };
  for (const [name, path] of [
    ['REST  /rest/v1/users', '/rest/v1/users?select=id&limit=1'],
    ['AUTH  /auth/v1/health', '/auth/v1/health'],
    ['STORAGE /storage/v1/bucket', '/storage/v1/bucket'],
  ]) {
    let r;
    try {
      r = await fetch(`https://${ref}.supabase.co${path}`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
    } catch (e) { out.probes.push({ name, status: 'ERR', message: String(e.message) }); continue; }
    const text = await r.text();
    let msg = text.slice(0, 260);
    try { msg = JSON.parse(text).message ?? msg; } catch { /* keep raw */ }
    out.probes.push({ name, status: r.status, message: msg });
    await sleep(400);
  }
  return out;
}

// --- resolve a token that can see each project -------------------------------
const newTok = tokenFor('access-token', 'access-token.old-backup');
const oldTok = tokenFor('access-token.old-backup', 'access-token');

console.log(`\n=== 1. which organization does each project belong to? ===\n`);
const orgInfo = {};
for (const [ref, t, tag] of [[NEW_REF, newTok, 'NEW'], [OLD_REF, oldTok, 'OLD']]) {
  const r = await mgmtGet(`/projects/${ref}`, t.token);
  if (r.status === 200) {
    orgInfo[ref] = r.body;
    console.log(`  ${tag}  ${ref}`);
    console.log(`       organization_id : ${r.body.organization_id}`);
    console.log(`       name            : ${r.body.name}`);
    console.log(`       status          : ${r.body.status}`);
    console.log(`       region          : ${r.body.region}`);
  } else {
    console.log(`  ${tag}  ${ref}  -> HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
}

const sameOrg = orgInfo[NEW_REF] && orgInfo[OLD_REF] &&
  orgInfo[NEW_REF].organization_id === orgInfo[OLD_REF].organization_id;
console.log(`\n  both projects in the same organization: ${sameOrg ? 'YES' : 'NO / unknown'}`);
console.log(`  that organization is the expected one (${EXPECTED_ORG}): ${
  orgInfo[NEW_REF]?.organization_id === EXPECTED_ORG ? 'YES' : 'NO'}`);

// --- fetch an anon key for each project and hit the data plane ---------------
console.log(`\n=== 2. data plane of each project (same test, same headers) ===\n`);
const results = [];
for (const [ref, t, tag] of [[NEW_REF, newTok, 'NEW'], [OLD_REF, oldTok, 'OLD']]) {
  const k = await mgmtGet(`/projects/${ref}/api-keys`, t.token);
  const anon = Array.isArray(k.body) ? k.body.find((x) => x.id === 'anon')?.api_key : null;
  if (!anon) { console.log(`  ${tag}  anon key unavailable (HTTP ${k.status})`); continue; }
  const r = await dataPlane(ref, anon, tag);
  results.push(r);
  console.log(`  ${tag}  ${ref}`);
  for (const p of r.probes) {
    console.log(`       ${p.name.padEnd(24)} HTTP ${String(p.status).padEnd(4)} ${String(p.message).slice(0, 120)}`);
  }
  console.log('');
}

// --- verdict -----------------------------------------------------------------
const violations = new Map();
for (const r of results) {
  for (const p of r.probes) {
    if (p.status === 402) {
      const v = String(p.message).match(/violations:\s*([a-z_]+)/)?.[1] ?? '(unparsed)';
      if (!violations.has(v)) violations.set(v, new Set());
      violations.get(v).add(r.label);
    }
  }
}

console.log(`=== 3. verdict ===\n`);
for (const [violation, tags] of violations) {
  console.log(`  violation "${violation}" affects: ${[...tags].join(', ')}`);
  const acrossBoth = tags.size > 1;
  console.log(`  -> ${acrossBoth
    ? 'SAME violation on projects in DIFFERENT... no: on projects in the SAME organization.'
    : 'seen on one project only.'}`);
  if (acrossBoth) {
    console.log(`  -> The restriction follows the ORGANIZATION, not the project or the data.`);
    console.log(`  -> No schema change, data change or code change inside a project can clear it.`);
  }
}
const allRestricted = results.length > 0 && results.every((r) => r.probes.some((p) => p.status === 402));
console.log(`\n  every tested project is 402: ${allRestricted ? 'YES' : 'NO'}`);
console.log('');
