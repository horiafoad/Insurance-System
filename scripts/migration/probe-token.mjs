// Read-only capability report for the currently installed Personal Access Token.
// Answers the one question that matters now: can this token see and administer
// an organization, and can it create a project there?
//
//   node scripts/migration/probe-token.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.supabase.com/v1';
const TOKEN_PATH = join(process.env.USERPROFILE || process.env.HOME, '.supabase', 'access-token');
const TOKEN = readFileSync(TOKEN_PATH, 'utf8').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const redact = (o) => JSON.parse(JSON.stringify(o, (k, v) => {
  if (typeof v !== 'string') return v;
  if (/^sbp_/.test(v)) return '<redacted pat>';
  if (/^sb_(secret|publishable)_/.test(v)) return '<redacted key>';
  return v;
}));

async function get(path) {
  for (let a = 0; ; a++) {
    let r;
    try { r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } }); }
    catch (e) { if (a >= 4) return { status: 'ERR', body: String(e.message) }; await sleep(800 * 2 ** a); continue; }
    const t = await r.text();
    if (r.status === 429 && a < 4) { await sleep(800 * 2 ** a); continue; }
    let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 200); }
    return { status: r.status, body: redact(b) };
  }
}

console.log(`\ntoken: ${TOKEN.slice(0, 6)}...${TOKEN.slice(-4)}  (len ${TOKEN.length})\n`);

const orgs = await get('/organizations');
console.log(`GET /organizations  -> HTTP ${orgs.status}`);
if (Array.isArray(orgs.body)) {
  console.log(`  organizations visible: ${orgs.body.length}`);
  for (const o of orgs.body) {
    console.log(`    id=${o.id}  name=${o.name}  plan=${o.plan ?? 'n/a'}`);
    const p = await get(`/organizations/${o.id}/projects`);
    if (Array.isArray(p.body)) {
      console.log(`      projects in org: ${p.body.length}`);
      for (const x of p.body) console.log(`        ${x.ref}  ${x.status}  ${x.name}`);
    } else {
      console.log(`      projects in org: HTTP ${p.status} ${JSON.stringify(p.body).slice(0, 120)}`);
    }
  }
} else {
  console.log(`  ${JSON.stringify(orgs.body).slice(0, 300)}`);
}

const projs = await get('/projects');
console.log(`\nGET /projects  -> HTTP ${projs.status}`);
if (Array.isArray(projs.body)) {
  console.log(`  projects visible: ${projs.body.length}`);
  for (const x of projs.body) console.log(`    ${x.ref}  org=${x.organization_id}  ${x.status}  ${x.name}`);
} else {
  console.log(`  ${JSON.stringify(projs.body).slice(0, 300)}`);
}
console.log('');
