// Read-only analyzer: derive a safe application order for the project's
// root-level *.sql files by extracting CREATE TABLE + FK references.
// Makes NO changes to the database and prints no secrets.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
const files = readdirSync(root).filter((f) => f.toLowerCase().endsWith('.sql')).sort();

const unq = (s) => s.replace(/^public\./i, '').replace(/["'`]/g, '').trim().toLowerCase();
const stripComments = (s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// table -> { file, deps:Set, pk, hasCreate, cols:Set, rls:bool, realtime:bool }
const tables = new Map();
const fileInfo = [];

function touch(name) {
  const t = unq(name);
  if (!t) return null;
  if (!tables.has(t)) {
    tables.set(t, { name: t, deps: new Set(), defFiles: new Set(), cols: new Set(), pk: null, hasCreate: false, rls: false, realtime: false });
  }
  return tables.get(t);
}

for (const f of files) {
  const raw = readFileSync(join(root, f), 'utf8');
  const sql = stripComments(raw);
  const info = { file: f, creates: [], alters: [], refs: new Set(), policies: 0, rlsEnable: false, realtime: false, insertSeed: 0 };

  // CREATE TABLE [IF NOT EXISTS] x ( ... )  -- capture column names + inline FKs
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\n\s*\)\s*(?:with|;|tablespace)/gi;
  let m;
  while ((m = createRe.exec(sql))) {
    const t = touch(m[1]);
    info.creates.push(unq(m[1]));
    if (!t) continue;
    t.hasCreate = true;
    t.defFiles.add(f);
    const body = m[2];
    // top-level column defs: "name type ..."
    for (const line of body.split('\n')) {
      const c = line.trim().match(/^(?:primary\s+key\s*\()?\s*["'`]?(\w+)["'`]?\s+(uuid|text|varchar|char|integer|bigint|smallint|boolean|date|timestamp|timestamptz|numeric|decimal|real|double\s+precision|json|jsonb|serial|bigserial|bytea|interval|int)\b/i);
      if (c) t.cols.add(c[1].toLowerCase());
      const pk = line.match(/^["'`]?(\w+)["'`]?\s+.*\bprimary\s+key\b/i);
      if (pk && !t.pk) t.pk = pk[1].toLowerCase();
      const inl = line.match(/references\s+(?:public\.)?["'`]?(\w+)["'`]?/i);
      if (inl) { t.deps.add(unq(inl[1])); info.refs.add(unq(inl[1])); }
    }
  }

  // ALTER TABLE x ADD [COLUMN] ...
  const alterRe = /alter\s+table\s+(?:if\s+exists\s+|only\s+)?(?:public\.)?["'`]?(\w+)["'`]?/gi;
  while ((m = alterRe.exec(sql))) {
    const name = unq(m[1]);
    info.alters.push(name);
    const t = touch(name);
    // columns added
    const addCols = /add\s+column\s+(?:if\s+not\s+exists\s+)?["'`]?(\w+)["'`]?\s+/gi;
    let a;
    const seg = sql.slice(m.index, m.index + 4000);
    while ((a = addCols.exec(seg))) if (t) t.cols.add(a[1].toLowerCase());
    // FKs added via constraints
    const fkRe = /add\s+constraint\s+\S+\s+foreign\s+key\s*\([^)]*\)\s*references\s+(?:public\.)?["'`]?(\w+)["'`]?/gi;
    let f;
    while ((f = fkRe.exec(seg))) { if (t) t.deps.add(unq(f[1])); info.refs.add(unq(f[1])); }
  }

  info.policies = (sql.match(/create\s+policy/gi) || []).length;
  info.rlsEnable = /enable\s+row\s+level\s+security/gi.test(sql);
  info.realtime = /alter\s+publication\s+supabase_realtime\s+add\s+table/i.test(sql);
  info.insertSeed = (sql.match(/insert\s+into/gi) || []).length;
  fileInfo.push(info);
}

// ---- topological sort over FK deps (only among known tables) --------------
const known = new Set(tables.keys());
const order = [];
const state = new Map(); // 0 visiting, 1 done
const cycles = [];

function visit(name, stack) {
  if (state.get(name) === 1) return;
  if (state.get(name) === 0) { cycles.push([...stack, name].join(' -> ')); return; }
  state.set(name, 0);
  for (const d of tables.get(name).deps) {
    if (known.has(d) && d !== name) visit(d, [...stack, name]);
  }
  state.set(name, 1);
  order.push(name);
}
for (const n of [...known].sort()) visit(n, []);

const orphanRefs = new Set();
for (const [n, t] of tables) for (const d of t.deps) if (!known.has(d)) orphanRefs.add(d);

console.log('=== TABLES DISCOVERED: ' + tables.size + ' ===\n');
console.log('--- safe creation order (parents first) ---');
order.forEach((n, i) => {
  const t = tables.get(n);
  const deps = [...t.deps].filter((d) => known.has(d));
  console.log(String(i + 1).padStart(3) + '. ' + n.padEnd(28) + (t.hasCreate ? '' : '  <-- NO create statement') +
    (deps.length ? '  <- ' + deps.join(', ') : ''));
});

if (cycles.length) {
  console.log('\n--- FK CYCLES (must use ALTER TABLE ... ADD CONSTRAINT after creates) ---');
  [...new Set(cycles)].forEach((c) => console.log('  ! ' + c));
}

console.log('\n--- tables with NO create statement in any project file ---');
[...tables.values()].filter((t) => !t.hasCreate).forEach((t) => console.log('  ' + t.name));

console.log('\n--- FK targets never defined by any project file (must pre-exist) ---');
[...orphanRefs].sort().forEach((r) => console.log('  ' + r));

console.log('\n--- tables defined in MORE THAN ONE file (conflict risk) ---');
[...tables.values()].filter((t) => t.defFiles.size > 1)
  .forEach((t) => console.log('  ' + t.name + '  <- ' + [...t.defFiles].join(' , ')));

console.log('\n--- file classification ---');
for (const i of fileInfo) {
  const kind = i.creates.length ? (i.creates.length > 1 ? 'CREATE x' + i.creates.length : 'CREATE') : (i.alters.length ? 'ALTER/PATCH' : 'OTHER');
  const flags = [];
  if (i.policies) flags.push('policies:' + i.policies);
  if (i.rlsEnable) flags.push('RLS');
  if (i.realtime) flags.push('REALTIME');
  if (i.insertSeed) flags.push('INSERT-SEED:' + i.insertSeed);
  console.log('  ' + kind.padEnd(11) + i.file.padEnd(46) + flags.join(' '));
}
