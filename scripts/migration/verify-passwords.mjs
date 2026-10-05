// Proves that real login credentials survived the migration.
//
// The users table is imported verbatim, but "the row count matches" does not
// prove the password column made it. This compares a hash of every password on
// OLD's export against a hash of the password now stored on NEW.
//
// Hashes only. No password, and no hash, is ever printed - only the username and
// whether it matched.
//
//   node scripts/migration/verify-passwords.mjs --new-ref <ref>

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ND = join(HERE, '..', 'export-old-data', 'ndjson', 'users.ndjson');
const API = 'https://api.supabase.com/v1';
const i = process.argv.indexOf('--new-ref');
const REF = i >= 0 ? process.argv[i + 1] : process.env.NEW_PROJECT_REF;
if (!REF) { console.error('usage: verify-passwords.mjs --new-ref <ref>'); process.exit(2); }
const tokenPath = join(process.env.USERPROFILE || process.env.HOME, '.supabase', 'access-token');
if (!existsSync(tokenPath)) { console.error('no token; run: npx supabase login'); process.exit(2); }
const TOKEN = readFileSync(tokenPath, 'utf8').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function query(sql) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(`${API}/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
    } catch (e) { if (attempt >= 7) throw e; await sleep(Math.min(30000, 1000 * 2 ** attempt)); continue; }
    if (r.ok) return r.json();
    const t = await r.text();
    if ((r.status === 429 || /ThrottlerException|fetch failed/i.test(t)) && attempt < 7) { await sleep(Math.min(30000, 1000 * 2 ** attempt)); continue; }
    throw new Error(`HTTP ${r.status} ${t.slice(0, 300)}`);
  }
}

const md5 = (s) => createHash('md5').update(String(s)).digest('hex');

const oldRows = readFileSync(ND, 'utf8').split('\n').filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l));
// md5() on the server so the value never travels back to this machine.
const newRows = await query(`select username, md5(coalesce(password, '')) as h from public.users order by username;`);
const newByName = new Map((Array.isArray(newRows) ? newRows : [newRows]).map((r) => [String(r.username), String(r.h)]));

let match = 0, mismatch = 0, missing = 0;
console.log(`\ncredential check: ${oldRows.length} user(s) in the OLD export vs ${newByName.size} on NEW ${REF}\n`);
for (const u of oldRows) {
  const name = String(u.username);
  if (!newByName.has(name)) { console.log(`  MISSING  ${name}`); missing++; continue; }
  if (newByName.get(name) === md5(u.password ?? '')) { console.log(`  ok       ${name}`); match++; }
  else { console.log(`  CHANGED  ${name}  <- password is not the one from OLD`); mismatch++; }
}
console.log('');
console.log(`  match ${match}, changed ${mismatch}, missing ${missing}`);
if (mismatch || missing) {
  console.log('\nFAILED: not every credential survived the import. Do not cut over the app.');
  process.exit(1);
}
console.log('\nPASSED: every imported password is byte-identical to OLD.');
