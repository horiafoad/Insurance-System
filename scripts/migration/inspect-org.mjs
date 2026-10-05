// Read-only diagnostic: which organization holds NEW, and what state that
// organization is in. Nothing is created, changed or deleted here.
//
//   node scripts/migration/inspect-org.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.supabase.com/v1';
const tokenPath = join(process.env.USERPROFILE || process.env.HOME, '.supabase', 'access-token');
if (!existsSync(tokenPath)) { console.error('no token; run: npx supabase login'); process.exit(2); }
const TOKEN = readFileSync(tokenPath, 'utf8').trim();
const NEW_REF = 'lchjchemghjddthwiwcu';
const OLD_REF = 'jpybzalxcezxhokzmwdx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, label) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    } catch (e) { if (attempt >= 6) throw e; await sleep(1000 * 2 ** attempt); continue; }
    if (r.ok) return await r.json();
    const t = await r.text();
    if ((r.status === 429 || /Throttler|fetch failed/i.test(t)) && attempt < 6) { await sleep(1000 * 2 ** attempt); continue; }
    return { __error: `HTTP ${r.status}`, __body: t.slice(0, 300), __label: label };
  }
}
const show = (label, v) => console.log(`  ${label.padEnd(26)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);

console.log('\n================ PROJECTS VISIBLE TO THIS TOKEN ================');
const projects = await api('/projects?limit=100', 'projects');
const plist = Array.isArray(projects) ? projects : [];
for (const p of plist) {
  console.log(`\n  ref        ${p.ref}`);
  console.log(`  name       ${p.name}`);
  console.log(`  status     ${p.status}`);
  console.log(`  region     ${p.region}`);
  console.log(`  org        ${p.organization_id}`);
  console.log(`  created    ${p.created_at}`);
  console.log(`  db status  ${p.database?.status ?? '?'}  pg ${p.database?.version ?? '?'}`);
  if (p.name && /pause|restrict|fair/i.test(JSON.stringify(p))) {
    console.log('  !! this project object mentions a restriction:');
    for (const k of Object.keys(p)) {
      if (/pause|restrict|fair|suspend|quota|billing/i.test(k)) console.log(`       ${k} = ${JSON.stringify(p[k])}`);
    }
  }
}

console.log('\n================ ORGANIZATIONS ================');
const orgs = await api('/organizations', 'orgs');
if (orgs.__error) { console.log(`  could not list: ${orgs.__error} ${orgs.__body}`); }
else {
  const olist = Array.isArray(orgs) ? orgs : [];
  console.log(`  count: ${olist.length}`);
  for (const o of olist) {
    console.log(`\n  id         ${o.id}`);
    console.log(`  name       ${o.name}`);
    for (const k of Object.keys(o)) {
      if (/plan|fair|restrict|suspend|quota|billing|tier|status|pause/i.test(k)) {
        show(k, o[k]);
      }
    }
  }
}

console.log('\n================ NEW project detail ================');
const newp = await api(`/projects/${NEW_REF}`, 'new');
if (newp.__error) console.log(`  ${newp.__error} ${newp.__body}`);
else {
  for (const k of Object.keys(newp)) {
    if (/status|plan|org|region|paused|suspend|restrict|fair|billing|quota/i.test(k)) show(k, newp[k]);
  }
}

console.log('\n================ OLD project detail (read-only) ================');
const oldp = await api(`/projects/${OLD_REF}`, 'old');
if (oldp.__error) console.log(`  ${oldp.__error}  ${oldp.__body}   <-- current token cannot see OLD`);
else {
  for (const k of Object.keys(oldp)) {
    if (/status|plan|org|region|paused|suspend|restrict|fair|billing|quota/i.test(k)) show(k, oldp[k]);
  }
}
console.log('');
