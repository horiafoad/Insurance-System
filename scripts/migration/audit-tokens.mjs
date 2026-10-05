// Read-only: compare every Personal Access Token we hold and record exactly
// which organization each one can act on, so the transfer blocker is named
// precisely instead of guessed.
//
//   node scripts/migration/audit-tokens.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const files = readdirSync(supa).filter((f) => f.startsWith('access-token'));
const tokens = files.map((f) => ({ file: f, value: readFileSync(join(supa, f), 'utf8').trim() }));

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

const NEW_REF = 'lchjchemghjddthwiwcu';
const OLD_REF = 'jpybzalxcezxhokzmwdx';
const DEST_ORGS = ['oglvikeebatxmqlbdqnr', 'mezmecdknakvgsmjchju'];
const SRC_ORG = 'arwdiosmftarsdfrhybv';

console.log(`\n=== ${tokens.length} token file(s) found ===\n`);

for (const { file, value } of tokens) {
  const id = value.startsWith('sbp_') ? 'sbp_' + value.slice(4, 12) : value.slice(0, 10) + '...';
  console.log(`--- ${file}  (${id})`);

  const prof = await call(value, '/profile');
  if (prof.status === 200) {
    const p = prof.body;
    console.log(`    profile     : id=${p.id ?? '?'}  email=${p.email ?? 'n/a'}`);
  } else {
    console.log(`    profile     : HTTP ${prof.status}`);
  }

  const orgs = await call(value, '/organizations');
  const list = Array.isArray(orgs.body) ? orgs.body : [];
  console.log(`    orgs listed : ${list.length}`);
  for (const o of list) console.log(`        ${o.id}  ${o.name}`);

  for (const ref of [NEW_REF, OLD_REF]) {
    const p = await call(value, `/projects/${ref}`);
    console.log(`    project ${ref.slice(0, 12)}.. : HTTP ${p.status}${p.body?.organization_id ? `  org=${p.body.organization_id}` : ''}`);
  }

  // Can it mint a claim token? That is the Owner-of-source check.
  const claim = await call(value, `/projects/${NEW_REF}/claim-token`, 'POST');
  console.log(`    claim-token : HTTP ${claim.status}${claim.body?.token ? '  (can issue transfer token)' : ''}`);

  for (const d of DEST_ORGS) {
    const o = await call(value, `/organizations/${d}`);
    console.log(`    dest org ${d.slice(0, 10)}.. : HTTP ${o.status}`);
  }

  const ocreate = await call(value, '/organizations', 'POST', { name: `zz-audit-probe-${Math.floor(Math.random() * 1e5)}` });
  console.log(`    can create org : ${ocreate.status === 201 ? `YES -> ${ocreate.body?.id}` : `no (HTTP ${ocreate.status})`}`);
  console.log('');
}

console.log(`=== source org ${SRC_ORG} direct read ===\n`);
for (const { file, value } of tokens) {
  const o = await call(value, `/organizations/${SRC_ORG}`);
  console.log(`  ${file.padEnd(34)} HTTP ${o.status}  ${JSON.stringify(o.body).slice(0, 90)}`);
}
console.log('');
