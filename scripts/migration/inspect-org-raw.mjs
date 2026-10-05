// Read-only: dump the raw shape of the org/billing endpoints so the 402 cause can
// be identified. Secret-shaped values are redacted before printing.
//
//   node scripts/migration/inspect-org-raw.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.supabase.com/v1';
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const tokenPath = join(supa, 'access-token');
if (!existsSync(tokenPath)) { console.error('no token'); process.exit(2); }
const TOKEN = readFileSync(tokenPath, 'utf8').trim();
const NEW_REF = 'lchjchemghjddthwiwcu';
const NEW_ORG = 'arwdiosmftarsdfrhybv';

// Never let a key-shaped value reach the console.
const redact = (o) => JSON.parse(JSON.stringify(o, (k, v) => {
  if (typeof v !== 'string') return v;
  if (/^(sb_secret_|sbp_|eyJ)/.test(v) && v.length > 20) return `<redacted ${v.length} chars>`;
  if (/^[0-9a-f]{40,}$/i.test(v)) return '<redacted hex>';
  return v;
}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function raw(path) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    } catch (e) { if (attempt >= 5) return { fetchError: String(e.message ?? e) }; await sleep(1000 * 2 ** attempt); continue; }
    const text = await r.text();
    if ((r.status === 429) && attempt < 5) { await sleep(1000 * 2 ** attempt); continue; }
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { status: r.status, body: redact(body) };
  }
}

const probes = [
  ['/organizations', 'list organizations'],
  [`/organizations/${NEW_ORG}`, 'the org that owns NEW'],
  [`/organizations/${NEW_ORG}/members`, 'members of that org'],
  [`/organizations/${NEW_ORG}/projects`, 'projects in that org'],
  [`/projects/${NEW_REF}`, 'NEW project object'],
  [`/projects/${NEW_REF}/api-keys`, 'NEW api keys (redacted)'],
  ['/platform/projects', 'platform-level project list'],
  ['/account', 'account object'],
];

for (const [path, label] of probes) {
  const r = await raw(path);
  console.log(`\n--- ${label}\n    GET ${path}\n    -> HTTP ${r.status ?? 'n/a'}`);
  console.log('    ' + JSON.stringify(r.body).slice(0, 700));
}
console.log('');
