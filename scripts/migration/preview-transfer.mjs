// Preview a project transfer WITHOUT performing it.
//
// The transfer is a claim-token pair:
//   POST /v1/projects/{ref}/claim-token        (requires Owner of the source org)
//   GET  /v1/organizations/{dest}/project-claim/{token}   <- dry run, moves nothing
//   POST /v1/organizations/{dest}/project-claim/{token}   <- the actual transfer
//
// This script only ever calls the first two. A transfer is never issued here.
//
//   node scripts/migration/preview-transfer.mjs --src <ref> --dest <orgId>

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.supabase.com/v1';
const HERE = dirname(fileURLToPath(import.meta.url));
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };

const SRC = arg('--src', 'lchjchemghjddthwiwcu');
const DEST = arg('--dest', 'oglvikeebatxmqlbdqnr');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokPath = existsSync(join(supa, 'access-token')) ? join(supa, 'access-token') : join(supa, 'access-token.old-backup');
const TOKEN = readFileSync(tokPath, 'utf8').trim();

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

console.log(`\n=== source project ${SRC} -> target organization ${DEST} ===\n`);

const before = await call('GET', `/projects/${SRC}`);
console.log(`  source now belongs to : ${before.body?.organization_id ?? before.status}`);
if (before.status !== 200) { console.log(`  cannot read source: HTTP ${before.status} ${JSON.stringify(before.body).slice(0, 160)}`); process.exit(1); }

// The claim token itself moves nothing; it is a short-lived, revocable handle.
console.log(`\n--- POST /v1/projects/${SRC}/claim-token ---`);
const claim = await call('POST', `/projects/${SRC}/claim-token`);
console.log(`  HTTP ${claim.status}`);
if (claim.status !== 200 || !claim.body?.token) {
  console.log(`  ${JSON.stringify(claim.body).slice(0, 400)}`);
  console.log(`
  A 403 here means this account is not Owner of the source organization
  (${before.body.organization_id}), which is what the access-control table
  requires for "Project / Transfer".

  Nothing was moved. To proceed, the account must be promoted to Owner of
  ${before.body.organization_id} in the Supabase dashboard, and made a member
  of ${DEST}.`);
  process.exit(2);
}

const token = claim.body.token;
writeFileSync(join(HERE, '.transfer-claim-token'), token, { mode: 0o600 });
console.log(`  claim token obtained (expires ${claim.body.expires_at ?? 'n/a'})`);
console.log(`  stored at scripts/migration/.transfer-claim-token (git-ignored, not printed)`);

// Dry run. This is the validator: it reports eligibility and impact only.
console.log(`\n--- GET /v1/organizations/${DEST}/project-claim/${token}  (dry run) ---`);
const pv = await call('GET', `/organizations/${DEST}/project-claim/${token}`);
console.log(`  HTTP ${pv.status}`);
const p = pv.body?.preview ?? pv.body;
if (pv.status === 200 && p) {
  console.log(`\n  source plan          : ${p.source_subscription_plan ?? 'n/a'}`);
  console.log(`  target plan          : ${p.target_subscription_plan ?? 'n/a'}`);
  console.log(`  valid                : ${p.valid}`);
  const errs = p.errors ?? [];
  const warns = p.warnings ?? [];
  console.log(`  errors               : ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`  warnings             : ${warns.length ? JSON.stringify(warns) : 'none'}`);
  if (p.members_exceeding_free_project_limit) {
    console.log(`  over free proj limit : ${JSON.stringify(p.members_exceeding_free_project_limit)}`);
  }
  console.log(`
  Nothing has been transferred. The transfer itself is the POST on the same
  path, and it will only be issued after you confirm.`);
} else {
  console.log(`  ${JSON.stringify(pv.body).slice(0, 500)}`);
}
console.log('');
