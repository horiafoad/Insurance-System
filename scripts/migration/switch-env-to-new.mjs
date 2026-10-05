// Points the local app at the NEW Supabase project.
//
// Rewrites VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env using the NEW
// project's own API key, fetched from the management API. The service_role /
// secret key is never requested and never written: the browser bundle only ever
// gets the publishable (anon) key.
//
// Key values are never printed.
//
//   node scripts/migration/switch-env-to-new.mjs --new-ref <ref>

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ENV = join(ROOT, '.env');
const API = 'https://api.supabase.com/v1';

const i = process.argv.indexOf('--new-ref');
const REF = i >= 0 ? process.argv[i + 1] : process.env.NEW_PROJECT_REF;
if (!REF) { console.error('usage: switch-env-to-new.mjs --new-ref <ref>'); process.exit(2); }
if (!existsSync(ENV)) { console.error('.env not found'); process.exit(2); }

const tokenPath = join(process.env.USERPROFILE || process.env.HOME, '.supabase', 'access-token');
if (!existsSync(tokenPath)) { console.error('no token; run: npx supabase login'); process.exit(2); }
const TOKEN = readFileSync(tokenPath, 'utf8').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    } catch (e) { if (attempt >= 7) throw e; await sleep(Math.min(30000, 1000 * 2 ** attempt)); continue; }
    if (r.ok) return r.json();
    const t = await r.text();
    if ((r.status === 429 || /ThrottlerException|fetch failed/i.test(t)) && attempt < 7) { await sleep(Math.min(30000, 1000 * 2 ** attempt)); continue; }
    throw new Error(`HTTP ${r.status} ${t.slice(0, 300)}`);
  }
}

const project = await api(`/projects/${REF}`);
const keys = await api(`/projects/${REF}/api-keys`);
const list = Array.isArray(keys) ? keys : keys.api_keys || [];

// Only a publishable/anon key is acceptable here. Anything named service_role
// or sb_secret_ is refused outright so it can never reach the browser bundle.
const pick = list.find((k) => /^(anon|publishable)$/i.test(String(k.name ?? k.type ?? '')))
  || list.find((k) => /^sb_publishable_/i.test(String(k.api_key ?? '')));
if (!pick) {
  console.error('no publishable/anon key found for this project. Key names seen:');
  for (const k of list) console.error(`  - ${k.name ?? k.type ?? '(unnamed)'}`);
  process.exit(1);
}
const anonKey = String(pick.api_key ?? pick.key ?? '');
if (/^sb_secret_/i.test(anonKey)) { console.error('refusing to write a secret key into .env'); process.exit(1); }

const url = `https://${REF}.supabase.co`;

const envText = readFileSync(ENV, 'utf8');
const setVar = (text, name, value) => {
  const re = new RegExp(`^${name}=.*$`, 'm');
  const line = `${name}=${value}`;
  if (re.test(text)) return text.replace(re, line);
  return `${text.replace(/\s*$/, '')}\n${line}\n`;
};

let out = envText;
const before = out.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1] ?? '(unset)';
out = setVar(out, 'VITE_SUPABASE_URL', url);
out = setVar(out, 'VITE_SUPABASE_ANON_KEY', anonKey);
if (!/^VITE_FILE_STORAGE_PROVIDER=/m.test(out)) out = setVar(out, 'VITE_FILE_STORAGE_PROVIDER', 'r2');
writeFileSync(ENV, out);

const redacted = `${anonKey.slice(0, 12)}...${anonKey.slice(-4)} (${anonKey.length} chars)`;
console.log('\n.env now points at NEW:');
console.log(`  VITE_SUPABASE_URL      ${before}  ->  ${url}`);
console.log(`  VITE_SUPABASE_ANON_KEY ${redacted}`);
console.log(`  VITE_FILE_STORAGE_PROVIDER r2`);
console.log('\nNote: .env is local and gitignored. The anon key is safe to ship to the');
console.log('browser; RLS on NEW is what protects the data, and it is currently permissive');
console.log('because it was copied from the project SQL. Review the policies before cutover.');
