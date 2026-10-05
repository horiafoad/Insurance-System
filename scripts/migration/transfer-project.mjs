// Attempt the official project transfer of lchjchemghjddthwiwcu into
// organization oglvikeebatxmqlbdqnr.
//
// Flow (Supabase's own project transfer, keeps ref, API keys, data, auth config):
//   1. POST /v1/projects/{ref}/claim-token                    -> handle
//   2. GET  /v1/organizations/{dest}/project-claim/{token}    -> dry run
//   3. POST /v1/organizations/{dest}/project-claim/{token}    -> the move
//
// If any step returns 403 the script STOPS and reports. It never deletes
// anything, never creates a project and never touches OLD.
//
//   node scripts/migration/transfer-project.mjs --src <ref> --dest <orgId>

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.supabase.com/v1';
const HERE = dirname(fileURLToPath(import.meta.url));
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };

const SRC = arg('--src', 'lchjcemghjddthwiwcu');
const DEST = arg('--dest', 'oglvikeebatxmqlbdqnr');
const OLD_REF = 'jpybzalxcezxhokzmwdx';
const EXECUTE = a.includes('--execute');

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

const stop = (msg) => { console.log(`\n  STOPPED: ${msg}\n`); process.exit(3); };

console.log(`\n=== transfer ${SRC}  ->  org ${DEST} ===\n`);

// Baseline: prove both projects exist and note the org before we touch anything.
const before = await call('GET', `/projects/${SRC}`);
if (before.status !== 200) stop(`cannot read source project (HTTP ${before.status})`);
console.log(`  BEFORE  ${SRC}  org=${before.body.organization_id}  status=${before.body.status}`);

// Step 1: claim token.
console.log(`\n--- step 1  POST /v1/projects/${SRC}/claim-token ---`);
const claim = await call('POST', `/projects/${SRC}/claim-token`);
console.log(`  HTTP ${claim.status}`);
if (claim.status === 403) {
  stop('this account is not Owner of the source organization. Add it as Owner in the dashboard.');
}
if (claim.status !== 200 || !claim.body?.token) {
  console.log(`  ${JSON.stringify(claim.body).slice(0, 300)}`);
  stop(`claim token refused (HTTP ${claim.status})`);
}
const token = claim.body.token;
const claimPath = join(HERE, '.transfer-claim-token');
writeFileSync(claimPath, token, { mode: 0o600 });
console.log(`  claim token obtained, expires ${claim.body.expires_at ?? 'n/a'}`);

// Step 2: dry run.
console.log(`\n--- step 2  GET /v1/organizations/${DEST}/project-claim/<token>  (dry run) ---`);
const pv = await call('GET', `/organizations/${DEST}/project-claim/${token}`);
console.log(`  HTTP ${pv.status}`);
if (pv.status === 403) {
  unlinkSync(claimPath);
  stop(`this account is not a member of the destination organization ${DEST}.`);
}
if (pv.status !== 200) {
  console.log(`  ${JSON.stringify(pv.body).slice(0, 400)}`);
  unlinkSync(claimPath);
  stop(`preview refused (HTTP ${pv.status})`);
}
const p = pv.body?.preview ?? pv.body;
console.log(`  source plan   : ${p.source_subscription_plan ?? 'n/a'}`);
console.log(`  target plan   : ${p.target_subscription_plan ?? 'n/a'}`);
console.log(`  valid         : ${p.valid}`);
console.log(`  errors        : ${(p.errors ?? []).length ? JSON.stringify(p.errors) : 'none'}`);
console.log(`  warnings      : ${(p.warnings ?? []).length ? JSON.stringify(p.warnings) : 'none'}`);
if (p.members_exceeding_free_project_limit) console.log(`  over free cap : ${JSON.stringify(p.members_exceeding_free_project_limit)}`);

if (p.valid === false) { unlinkSync(claimPath); stop('the preview reports this transfer is not valid'); }

// Step 3: the actual move, only when explicitly asked.
console.log(`\n--- step 3  POST /v1/organizations/${DEST}/project-claim/<token> ---`);
if (!EXECUTE) {
  console.log(`  dry run only. Re-run with --execute to perform the move.`);
  console.log(`  Nothing has changed. Source still in ${before.body.organization_id}.`);
  console.log('');
  process.exit(0);
}

const mv = await call('POST', `/organizations/${DEST}/project-claim/${token}`);
console.log(`  HTTP ${mv.status}`);
console.log(`  ${JSON.stringify(mv.body).slice(0, 400)}`);
if (mv.status !== 200 && mv.status !== 201) { unlinkSync(claimPath); stop(`transfer refused (HTTP ${mv.status})`); }
unlinkSync(claimPath);

// Verify.
await sleep(2500);
const after = await call('GET', `/projects/${SRC}`);
const old = await call('GET', `/projects/${OLD_REF}`);
console.log(`\n=== after ===\n`);
console.log(`  ${SRC}`);
console.log(`    organization_id : ${after.body?.organization_id}  (was ${before.body.organization_id})`);
console.log(`    status          : ${after.body?.status}`);
console.log(`    moved           : ${after.body?.organization_id === DEST ? 'YES' : 'NOT CONFIRMED'}`);
console.log(`  ${OLD_REF}`);
console.log(`    ${old.status === 200 ? `untouched, still org=${old.body.organization_id}` : `HTTP ${old.status} (not visible to this token, not modified)`}`);
console.log('');
