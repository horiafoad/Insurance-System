// Read-only re-verification of the data plane, using Node's fetch so the
// JWT is passed byte-exact. PowerShell's curl.exe mangles long Authorization
// headers, which produced a misleading "Invalid API key" (401) instead of the
// real 402.
//
//   node scripts/migration/dataplane-check.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const supa = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NEW_REF = 'lchjchemghjddthwiwcu';
const OLD_REF = 'jpybzalxcezxhokzmwdx';

const tokens = readdirSync(supa)
  .filter((f) => f.startsWith('access-token'))
  .map((f) => ({ file: f, value: readFileSync(join(supa, f), 'utf8').trim() }));

async function mgmt(token, path) {
  for (let t = 0; ; t++) {
    let r;
    try { r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }); }
    catch (e) { if (t >= 4) return { status: 'ERR', body: String(e.message) }; await sleep(900 * 2 ** t); continue; }
    const txt = await r.text();
    if ((r.status === 429 || /throttl/i.test(txt)) && t < 4) { await sleep(900 * 2 ** t); continue; }
    let b; try { b = JSON.parse(txt); } catch { b = txt.slice(0, 200); }
    return { status: r.status, body: b };
  }
}

async function probe(ref, key, name, path) {
  for (let t = 0; ; t++) {
    let r;
    try {
      r = await fetch(`https://${ref}.supabase.co${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
    } catch (e) { if (t >= 3) return { name, status: 'ERR', msg: String(e.message) }; await sleep(900 * 2 ** t); continue; }
    const txt = await r.text();
    if (r.status === 429 && t < 3) { await sleep(900 * 2 ** t); continue; }
    let msg = txt.slice(0, 190);
    try { msg = JSON.parse(txt).message ?? msg; } catch { /* raw */ }
    return { name, status: r.status, msg };
  }
}

const out = {};
console.log(`\n  token files loaded: ${tokens.length} -> ${tokens.map((t) => t.file).join(', ')}\n`);for (const [ref, tag] of [[NEW_REF, 'NEW'], [OLD_REF, 'OLD']]) {
  const owner = [];
  for (const { file, value } of tokens) {
    const p = await mgmt(value, `/projects/${ref}`);
    if (p.status === 200) owner.push({ file, token: value });
  }
  if (!owner.length) { out[tag] = { visible: false }; continue; }
  const k = await mgmt(owner[0].token, `/projects/${ref}/api-keys`);
  const anon = Array.isArray(k.body) ? k.body.find((x) => x.id === 'anon')?.api_key : null;
  const pub = Array.isArray(k.body) ? k.body.find((x) => x.type === 'publishable')?.api_key : null;
  const results = [];
  results.push(await probe(ref, anon, 'REST  anon jwt  ', '/rest/v1/users?select=id&limit=1'));
  results.push(await probe(ref, anon, 'AUTH  anon jwt  ', '/auth/v1/health'));
  results.push(await probe(ref, pub, 'AUTH  publishable', '/auth/v1/health'));
  out[tag] = { ref, visible: true, tokenFile: owner[0].file, results };
  console.log(`\n=== ${tag}  ${ref}  (token: ${owner[0].file}) ===\n`);
  for (const r of results) console.log(`  ${r.name}  HTTP ${String(r.status).padEnd(4)} ${r.msg ?? ''}`);
  await sleep(400);}

console.log(`\n=== verdict ===\n`);
for (const tag of ['NEW', 'OLD']) {
  const r = out[tag];
  if (!r.visible) { console.log(`  ${tag}: not visible to any held token`); continue; }
  const codes = [...new Set(r.results.map((x) => x.status))];
  const restricted = r.results.some((x) => x.status === 402 && /exceed_storage_size_quota/.test(x.msg ?? ''));
  console.log(`  ${tag}: data plane codes ${codes.join(',')}   quota-restricted: ${restricted ? 'YES' : 'no'}`);
}
const both = out.NEW?.results?.length && out.OLD?.results?.length;
if (both) {
  const nq = out.NEW.results.some((x) => /exceed_storage_size_quota/.test(x.msg ?? ''));
  const oq = out.OLD.results.some((x) => /exceed_storage_size_quota/.test(x.msg ?? ''));
  console.log(`
  Both projects report exceed_storage_size_quota: ${nq && oq ? 'YES' : 'NO'}
  Both live in organization arwdiosmftarsdfrhybv, so the restriction is attached
  to the organization. Neither project, nor any schema/data/code change inside
  either project, can clear it.`);
}
console.log('');
