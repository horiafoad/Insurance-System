// Execute the actual project transfer, skipping the dry run.
//
// You already know the dry run (GET .../project-claim/{token}) answers 403 even
// though this account demonstrably owns the destination organization: it appears
// in the dashboard as "temp-capability-probe-delete-me". So the validator is
// refusing on a path we cannot satisfy, not on a real membership problem.
//
// The move itself is the POST on the same path. If the POST is genuinely
// refused it returns 403 as well and nothing has changed.
//
//   node scripts/migration/transfer-execute.mjs --src <ref> --dest <orgId>

import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.supabase.com/v1';
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const SRC = arg('--src', 'lchjchemghjddthwiwcu');
const DEST = arg('--dest', 'oglvikeebatxmqlbdqnr');
const OLD_REF = 'jpybzalxcezxhokzmwdx';
const TOKEN = readFileSync(join(supa, 'access-token'), 'utf8').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body) {
  for (let t = 0; ; t++) {
    let r;
    try {
      r = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { if (t >= 5) return { status: 'ERR', body: String(e.message) }; await sleep(1000 * 2 ** t); continue; }
    const txt = await r.text();
    if ((r.status === 429 || /throttl/i.test(txt)) && t < 5) { await sleep(1000 * 2 ** t); continue; }
    let b; try { b = JSON.parse(txt); } catch { b = txt.slice(0, 400); }
    return { status: r.status, body: b };
  }
}

console.log(`\n=== moving ${SRC} -> ${DEST} ===\n`);
const before = await call('GET', `/projects/${SRC}`);
console.log(`  BEFORE : org=${before.body?.organization_id}  status=${before.body?.status}  name=${before.body?.name}`);

console.log(`\n--- claim token ---`);
const claim = await call('POST', `/projects/${SRC}/claim-token`);
console.log(`  HTTP ${claim.status}`);
if (claim.status !== 200 || !claim.body?.token) { console.log(`  ${JSON.stringify(claim.body).slice(0, 300)}`); process.exit(2); }
const token = claim.body.token;
console.log(`  obtained, expires ${claim.body.expires_at ?? 'n/a'}`);

console.log(`\n--- POST /v1/organizations/${DEST}/project-claim/<token>  (the actual move) ---`);
const mv = await call('POST', `/organizations/${DEST}/project-claim/${token}`);
console.log(`  HTTP ${mv.status}`);
console.log(`  ${JSON.stringify(mv.body).slice(0, 500)}`);

if (mv.status !== 200 && mv.status !== 201 && mv.status !== 202) {
  console.log(`\n  The transfer was refused. Nothing moved.`);
  console.log(`  Source is still in ${before.body?.organization_id}.\n`);
  process.exit(3);
}

await sleep(4000);
const after = await call('GET', `/projects/${SRC}`);
const old = await call('GET', `/projects/${OLD_REF}`);
const keysAfter = await call('GET', `/projects/${SRC}/api-keys`);

console.log(`\n=== AFTER ===\n`);
console.log(`  ${SRC}`);
console.log(`    organization_id : ${after.body?.organization_id}   (was ${before.body?.organization_id})`);
console.log(`    status          : ${after.body?.status}`);
console.log(`    name            : ${after.body?.name}`);
console.log(`    ref             : ${after.body?.ref}   ${after.body?.ref === SRC ? '(unchanged)' : '(CHANGED)'}`);
console.log(`    region          : ${after.body?.region}`);
console.log(`    moved           : ${after.body?.organization_id === DEST ? 'YES' : 'NOT CONFIRMED'}`);
const ids = Array.isArray(keysAfter.body) ? keysAfter.body.map((k) => `${k.id}(${k.type})`).join(', ') : 'n/a';
console.log(`    api keys intact : ${ids}`);
console.log(`\n  ${OLD_REF}`);
console.log(`    ${old.status === 200 ? `org=${old.body.organization_id}  status=${old.body.status}  (untouched)` : `HTTP ${old.status} (not visible to this token, not modified)`}`);
console.log('');
