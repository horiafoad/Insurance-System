#!/usr/bin/env node
// Emits scripts/migration/02-reconciliation.sql: run it on the NEW project
// after the import. It compares every table against the authoritative OLD
// exact counts and fails loudly on any mismatch, duplicate or orphan.
//
// It prints only table names, row counts and the NAMES of problem columns.
// It never prints row content, passwords or keys.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPORT = join(HERE, '..', 'export-old-data');
const manifest = existsSync(join(EXPORT, 'run-plan', 'manifest.json'))
  ? JSON.parse(readFileSync(join(EXPORT, 'run-plan', 'manifest.json'), 'utf8')) : { tables: [] };
const counts = manifest.tables.map((t) => [t.table, t.exact_count]);

// FK map from the project's own DDL, for the orphan check
const ROOT = join(HERE, '..', '..');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const unq = (s) => s.replace(/^public\./i, '').replace(/["'`]/g, '').trim().toLowerCase();
const fks = new Map();
const pks = new Map();
for (const f of readdirSync(ROOT).filter((x) => x.toLowerCase().endsWith('.sql'))) {
  const sql = strip(readFileSync(join(ROOT, f), 'utf8'));
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\n\s*\)\s*(?:with|;|tablespace)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const name = unq(m[1]);
    const list = fks.get(name) || [];
    const inl = /["'`]?(\w+)["'`]?\s+\w+[^,\n]*references\s+(?:public\.)?["'`]?(\w+)["'`]?/gi;
    let r;
    while ((r = inl.exec(m[2]))) list.push({ col: unq(r[1]), parent: unq(r[2]) });
    fks.set(name, list);
    const pk = /["'`]?(\w+)["'`]?\s+[a-z][^\n,]*\bprimary\s+key\b/i.exec(m[2]);
    if (pk && !pks.has(name)) pks.set(name, unq(pk[1]));
  }
}
const inScope = new Set(counts.map(([t]) => t));

const pad = (s, n) => String(s).padEnd(n);
const L = [
  '-- ============================================================================',
  '-- RECONCILIATION - run on the NEW project AFTER the import.',
  '-- Compares every table against the OLD project exact counts.',
  '-- Prints counts and problem NAMES only. No row content, no passwords.',
  '-- ============================================================================',
  '',
  `-- ${pad('table', 28)}${pad('old', 8)}${pad('new', 8)}${pad('diff', 8)}status`,
];
const union = [];
for (const [t, n] of counts) {
  union.push(`  select '${t}' as t, ${n}::bigint as old_n, (select count(*) from public.${t}) as new_n`);
}
L.push(union.join('\n  union all\n'), ';', '');

L.push('-- summary line: every status must read ok', '');
L.push(`with r as (${union.join('\n  union all\n')})`);
L.push(`select case when count(*) filter (where old_n = new_n) = count(*) then 'ALL OK' else 'MISMATCH' end as reconciliation,
       count(*) as tables_checked,
       sum(old_n) as total_old_rows,
       sum(new_n) as total_new_rows,
       count(*) filter (where old_n <> new_n) as tables_with_wrong_count
from r;`, '');

L.push('-- duplicate primary keys (expect 0 rows) -------------------------', '');
const dups = [];
for (const [t] of counts) {
  const pk = pks.get(t);
  if (!pk) continue;
  dups.push(`  select '${t}' as table_name, '${pk}' as key_col, count(*) as dup_groups from public.${t} group by "${pk}" having count(*) > 1`);
}
L.push(dups.length ? dups.join('\n  union all\n') + ';' : '  -- (no primary keys discoverable in the project DDL for these tables)', '');

L.push('-- orphaned foreign keys (expect 0 rows) -------------------------', '');
const orph = [];
for (const [t] of counts) {
  for (const { col, parent } of (fks.get(t) || [])) {
    if (!inScope.has(parent) || col === 'id') continue;
    orph.push(`  select '${t}' as table_name, '${col}' as fk_col, '${parent}' as missing_parent, count(*) as orphans
   from public.${t} c
   where c."${col}" is not null
     and not exists (select 1 from public.${parent} p where p.id = c."${col}")`);
  }
}
L.push(orph.length ? orph.join('\n  union all\n') + ';' : '  -- (no cross-table FKs discovered for the imported tables)', '');

L.push('-- null / empty spot checks (informational, not a pass/fail) ------', '');
L.push(`select 'users rows' as what, count(*) as n from public.users
union all select 'users with null username', count(*) from public.users where username is null
union all select 'users with null password', count(*) from public.users where password is null
union all select 'letters total', count(*) from public.letters
union all select 'letter_movements orphans', count(*) from public.letter_movements m
   where not exists (select 1 from public.letters l where l.id = m.letter_id)
union all select 'archive_qr_codes orphans', count(*) from public.archive_qr_codes a
   where a.letter_id is not null and not exists (select 1 from public.letters l where l.id = a.letter_id);`, '');

L.push('-- storage columns preserved for the R2 bridge (expect 0 missing) --', '');
L.push(`select 'rows missing storage_provider' as what, count(*) as n
from public.letters where storage_provider is null;`, '');

writeFileSync(join(HERE, '02-reconciliation.sql'), L.join('\n') + '\n');
console.log(`tables with exact counts : ${counts.length}`);
console.log(`duplicate-PK checks     : ${dups.length}`);
console.log(`orphan-FK checks        : ${orph.length}`);
console.log(`out : scripts/migration/02-reconciliation.sql`);
