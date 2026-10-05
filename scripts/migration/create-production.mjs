// Attempt the real goal: create the Production project inside the clean
// organization we created earlier, using the newly installed PAT.
//
//   node scripts/migration/create-production.mjs
//
// The generated database password is written to
//   %USERPROFILE%\.supabase\production-db-password.txt
// and is never printed.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.supabase.com/v1';
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const TOKEN = readFileSync(join(supa, 'access-token'), 'utf8').trim();

const ORG = process.env.SBP_ORG_ID || 'oglvikeebatxmqlbdqnr';
const NAME = 'Insurance-System-Production';
const REGION = 'eu-west-1';

// Supabase requires a password that satisfies its policy; keep it URL-safe.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makePass = () => Array.from(randomBytes(28), (b) => ALPHABET[b % ALPHABET.length]).join('') + 'Aa1!';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Is the project already there? Never create a duplicate.
console.log(`\n=== checking for an existing "${NAME}" ===`);
let existing = null;
for (let a = 0; ; a++) {
  let r;
  try { r = await fetch(`${API}/projects`, { headers: { Authorization: `Bearer ${TOKEN}` } }); }
  catch (e) { if (a >= 4) break; await sleep(800 * 2 ** a); continue; }
  if (r.status === 429 && a < 4) { await sleep(800 * 2 ** a); continue; }
  const list = await r.json().catch(() => []);
  if (Array.isArray(list)) {
    existing = list.find((p) => p.name === NAME || p.ref === process.env.SBP_NEW_REF) || null;
    for (const p of list) console.log(`  visible: ${p.ref}  org=${p.organization_id}  ${p.status}  ${p.name}`);
  }
  break;
}
if (existing) {
  console.log(`\n  already exists: ${existing.ref} (${existing.organization_id}) - reusing it, no create needed`);
  console.log(`  export SBP_NEW_REF=${existing.ref}`);
  process.exit(0);
}

// 2. Create it.
const dbPass = makePass();
console.log(`\n=== creating project in org ${ORG} ===`);
console.log(`  name   : ${NAME}`);
console.log(`  region : ${REGION}`);
console.log(`  plan   : free`);

const res = await fetch(`${API}/projects`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ organization_id: ORG, name: NAME, region: REGION, db_pass: dbPass, plan: 'free' }),
});
const text = await res.text();
let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }

console.log(`\n  HTTP ${res.status}`);
if (res.ok && body && body.ref) {
  writeFileSync(join(supa, 'production-db-password.txt'), dbPass, { mode: 0o600 });
  console.log(`  ref        : ${body.ref}`);
  console.log(`  org        : ${body.organization_id}`);
  console.log(`  status     : ${body.status}`);
  console.log(`  region     : ${body.region}`);
  console.log(`  db host    : ${body.database?.host}`);
  console.log(`  db password saved to .supabase\\production-db-password.txt (not printed)`);
  console.log(`\n  NEXT: export SBP_NEW_REF=${body.ref}`);
} else {
  console.log(`  ${JSON.stringify(body)}`);
  if (res.status === 403) {
    console.log(`
  The token can create an organization but cannot create a project inside one
  it did not create as a member. That is an ownership problem, not a schema
  problem, and it cannot be fixed from the API alone.`);
  }
}
console.log('');
