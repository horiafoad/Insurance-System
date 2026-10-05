// Final safety audit of the NEW-project schema bundle.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const P = join(HERE, '..', '01-new-project-schema.sql');
const s = readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${extra}`); } };

// 1. no forbidden password statement anywhere, comments included
t('no "password = EXCLUDED.*"', !/password\s*=\s*excluded\./i.test(s));
t('no users ON CONFLICT DO UPDATE SET password', !/on\s+conflict[\s\S]{0,200}?do\s+update[\s\S]{0,200}?password/i.test(s));

// 2. no literal credential left in the file (a digits-only or hash-looking quoted value)
const quoted = [...s.matchAll(/'([^'\n]{4,})'/g)].map((m) => m[1]);
const creds = quoted.filter((v) => /^[0-9]{4,}$/.test(v) || /^\$2[aby]\$/.test(v) || /^eyJ[A-Za-z0-9_-]{20,}$/.test(v));
t(`no literal credential values (${creds.length} found)`, creds.length === 0, JSON.stringify(creds.slice(0, 3)));

// 3. no Supabase Storage bucket seed left
t('no storage.buckets insert', !/insert\s+into\s+(?:public\.)?storage\b/i.test(s.replace(/--[^\n]*/g, ' ')));

// 4a. the manifest the exported-table check depends on
const manifest = JSON.parse(readFileSync(join(HERE, '..', '..', 'export-old-data', 'run-plan', 'manifest.json'), 'utf8'));
const exported = manifest.tables.map((x) => x.table);

// 4. every top-level INSERT into an exported table is gone.
//    Strip comments first, otherwise the REMOVED STATEMENTS footer (which
//    legitimately quotes the statements it removed) looks like active SQL.
const stripComments = (x) => x
  .replace(/--[^\n]*/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');
// strip dollar-quoted regions too: trigger/function bodies are dormant by design
const masked = stripComments(s).replace(/\$\$[\s\S]*?\$\$/g, (m) => m.replace(/[^\n]/g, ' '));
const leaks = [...masked.matchAll(/insert\s+into\s+(?:public\.)?([a-z_0-9]+)/gi)]
  .map((m) => m[1].toLowerCase())
  .filter((tn) => exported.includes(tn));
t(`no top-level seed into any of the ${exported.length} exported tables`, leaks.length === 0, JSON.stringify([...new Set(leaks)]));
t('no active storage.buckets insert', !/insert\s+into\s+(public\.)?storage\b/i.test(masked));

// 5. structure still intact
t('43 CREATE TABLE statements present', (s.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?/gi) || []).length >= 43);
t('RLS enabled somewhere', /enable\s+row\s+level\s+security/i.test(s));
t('policies present', (s.match(/create\s+policy/gi) || []).length > 0);
t('realtime publication present', /alter\s+publication\s+supabase_realtime/i.test(s));
t('no encoding damage (U+FFFD)', !/\uFFFD/.test(s));
const ar = (s.match(/[\u0600-\u06FF]/g) || []).length;
t(`Arabic preserved (${ar} chars)`, ar > 10000);

// 6. trigger bodies that must NOT have been removed
t('create_request_notifications trigger body kept', /create_request_notifications/i.test(s));
t('letter notification trigger body kept', /letter/i.test(s) && /RETURNS\s+TRIGGER/i.test(s));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
