// Single source of truth for the OLD-project read-only guard.
//
// auto-migrate.mjs and guard-test.mjs both import this, so the tested
// behaviour and the enforced behaviour can never drift apart.
//
// The OLD project is READ ONLY. Anything that could change rows, schema,
// privileges or replication behaviour is refused outright.

export const OLD_REF = 'jpybzalxcezxhokzmwdx';

const WRITE_VERBS = ['insert', 'update', 'delete', 'alter', 'drop', 'truncate', 'create', 'grant', 'revoke', 'copy', 'merge'];

// Blank out comments and every kind of literal so that a word inside a string,
// a JSON payload or a comment can never trip (or silence) the guard.
export function stripForScan(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i], d = sql[i + 1];
    if (c === '-' && d === '-') { while (i < n && sql[i] !== '\n') i++; out += ' '; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (c === "'" || c === '"') { const q = c; i++; while (i < n && sql[i] !== q) { if (sql[i] === q && sql[i + 1] === q) i++; i++; } i++; out += ' '; continue; }
    if (c === '$') {
      const m = /^\$([A-Za-z_0-9]*)\$/.exec(sql.slice(i));
      if (m) { const tag = m[0]; const end = sql.indexOf(tag, i + tag.length); i = end === -1 ? n : end + tag.length; out += ' '; continue; }
    }
    out += c; i++;
  }
  return out;
}

// Every alphabetic word that sits at nesting depth 0 and is not a
// `table.column` attribute. A data-modifying CTE puts its INSERT/UPDATE/DELETE
// at depth 0 after the CTE list, so this catches it; a word buried inside
// parentheses or a JSON array does not count.
export function topLevelWords(sql) {
  const s = stripForScan(sql);
  const words = [];
  let depth = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '(' || c === '[') { depth++; i++; continue; }
    if (c === ')' || c === ']') { depth--; i++; continue; }
    if (depth !== 0 || !/[A-Za-z_]/.test(c)) { i++; continue; }

    let j = i;
    while (j < s.length && /[A-Za-z_0-9]/.test(s[j])) j++;
    const w = s.slice(i, j);

    let k = i - 1;
    while (k >= 0 && /\s/.test(s[k])) k--;
    const prev = k >= 0 ? s[k] : '';
    let m = j;
    while (m < s.length && /\s/.test(s[m])) m++;
    const next = m < s.length ? s[m] : '';

    // skip `table.column`, `schema.fn(...)` and `alias:label` forms
    if (prev !== '.' && prev !== ':' && next !== '.' && next !== ':') words.push(w.toLowerCase());
    i = j;
  }
  return words;
}

export function assertReadOnly(ref, sql, { allowArchiveFn = false } = {}) {
  if (ref !== OLD_REF) return { ok: true };

  const words = topLevelWords(sql);
  const bad = [];
  for (const v of WRITE_VERBS) if (words.includes(v)) bad.push(v);
  if (words.includes('set') && words.includes('session_replication_role')) bad.push('set session_replication_role');
  // must never run on OLD at any nesting depth, so match it anywhere the
  // scanner can see (comments and literals already removed)
  if (!allowArchiveFn && /\barchive_old_data\s*\(/i.test(stripForScan(sql))) bad.push('archive_old_data()');

  // SELECT ... INTO [TABLE] creates and populates a table. Harmless in a read
  // query, not at all harmless on a project we must not modify.
  if (words.includes('select') && words.includes('into')) {
    const s = stripForScan(sql);
    if (/\bselect\b[\s\S]*?\binto\b/i.test(s) && !/\binto\s+json/i.test(s)) bad.push('select .. into');
  }

  return { ok: bad.length === 0, bad };
}

// Throwing wrapper used by the driver.
export function assertReadOnlyOrThrow(ref, sql, opts) {
  const r = assertReadOnly(ref, sql, opts);
  if (!r.ok) {
    throw new Error(`REFUSING to send a write statement to the OLD project: ${r.bad.join(', ')}`);
  }
}
