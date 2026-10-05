// Read-only: pin down exactly what the 402 means, so we create the right thing.
//
// The data-plane gateway (Kong) answers 402 while the management API answers 200
// for the very same project. That combination isolates the cause to the
// organization's plan/billing state rather than to the schema, the data, the
// anon key or the project itself.
//
//   node scripts/migration/diagnose-402.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const tokenPath = join(process.env.USERPROFILE || process.env.HOME, '.supabase', 'access-token');
if (!existsSync(tokenPath)) { console.error('no token'); process.exit(2); }
const TOKEN = readFileSync(tokenPath, 'utf8').trim();
const NEW_REF = 'lchjchemghjddthwiwcu';
const BASE = `https://${NEW_REF}.supabase.co`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(label, url, headers) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try { r = await fetch(url, { headers }); } catch (e) {
      if (attempt >= 4) return { label, err: String(e.message ?? e) };
      await sleep(1000 * 2 ** attempt); continue;
    }
    const text = await r.text();
    if (r.status === 429 && attempt < 4) { await sleep(1000 * 2 ** attempt); continue; }
    const hdr = {};
    for (const k of ['sb-gateway-version', 'x-sb-edge-region', 'cf-ray', 'server', 'content-type', 'x-envoy-upstream-service-time']) {
      const v = r.headers.get(k); if (v) hdr[k] = v;
    }
    return { label, status: r.status, headers: hdr, body: text.slice(0, 220) };
  }
}

const anonRes = await (async () => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${NEW_REF}/api-keys`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const keys = await r.json();
  return (Array.isArray(keys) ? keys : []).find((k) => k.id === 'anon')?.api_key;
})();
if (!anonRes) { console.error('could not read the anon key'); process.exit(2); }

console.log(`\n=== data plane on ${NEW_REF} ===\n`);
const cases = [
  ['REST  no apikey            ', `${BASE}/rest/v1/`, {}],
  ['REST  anon key             ', `${BASE}/rest/v1/`, { apikey: anonRes }],
  ['REST  anon key + bearer    ', `${BASE}/rest/v1/`, { apikey: anonRes, Authorization: `Bearer ${anonRes}` }],
  ['REST  users select         ', `${BASE}/rest/v1/users?select=id&limit=1`, { apikey: anonRes, Authorization: `Bearer ${anonRes}` }],
  ['AUTH  health no key        ', `${BASE}/auth/v1/health`, {}],
  ['AUTH  health anon key      ', `${BASE}/auth/v1/health`, { apikey: anonRes }],
  ['AUTH  settings anon key    ', `${BASE}/auth/v1/settings`, { apikey: anonRes }],
  ['STORAGE bucket anon key    ', `${BASE}/storage/v1/bucket`, { apikey: anonRes, Authorization: `Bearer ${anonRes}` }],
  ['GRAPHQL health anon key    ', `${BASE}/graphql/v1`, { apikey: anonRes }],
  ['REALTIME health anon key   ', `${BASE}/realtime/v1/websocket`, { apikey: anonRes }],
];

for (const [label, url, headers] of cases) {
  const r = await probe(label, url, headers);
  if (r.err) { console.log(`  ${label} ERROR ${r.err}`); continue; }
  const interesting = Object.entries(r.headers).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`  ${label} HTTP ${String(r.status).padEnd(4)} ${r.body.trim() ? '| ' + r.body.trim().slice(0, 90) : '| (empty body)'}`);
  if (interesting) console.log(`  ${' '.repeat(30)}${interesting}`);
}

console.log(`\n=== management API on the same project (for contrast) ===\n`);
const mgmt = await (async () => {
  const r = await fetch('https://api.supabase.com/v1/projects/lchjchemghjddthwiwcu/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select count(*)::int as tables from information_schema.tables where table_schema = $q$public$q$' }),
  });
  return { status: r.status, body: (await r.text()).slice(0, 120) };
})();
console.log(`  management query                 HTTP ${mgmt.status}  ${mgmt.body}`);
console.log('');
