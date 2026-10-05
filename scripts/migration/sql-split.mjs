// Shared SQL statement splitter.
//
// build-new-schema.mjs uses it to emit the DDL bundle statement by statement,
// and auto-migrate.mjs uses it to apply that same bundle one statement at a
// time. Keeping one implementation means the two can never disagree about where
// a statement begins and ends.

export function splitStatements(sql) {
  const out = [];
  const n = sql.length;
  let i = 0, start = 0;
  while (i < n) {
    const c = sql[i], d = sql[i + 1];
    // line comment
    if (c === '-' && d === '-') { while (i < n && sql[i] !== '\n') i++; continue; }
    // block comment
    if (c === '/' && d === '*') { i += 2; while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++; i += 2; continue; }
    // quoted literal / quoted identifier ('' is an escaped quote, not a close)
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < n && sql[i] !== q) { if (sql[i] === q && sql[i + 1] === q) i += 2; else i++; }
      i++; continue;
    }
    // dollar-quoted body, e.g. $$ ... $$ or $tag$ ... $tag$
    if (c === '$') {
      const m = /^\$([A-Za-z_0-9]*)\$/.exec(sql.slice(i));
      if (m) { const end = sql.indexOf(m[0], i + m[0].length); i = end === -1 ? n : end + m[0].length; continue; }
    }
    if (c === ';') { const chunk = sql.slice(start, i + 1); if (chunk.trim()) out.push(chunk); i++; start = i; continue; }
    i++;
  }
  const tail = sql.slice(start);
  if (tail.trim()) out.push(tail);
  return out;
}

// A statement chunk can begin with comment lines, so `^\s*create` alone misses
// every CREATE TABLE that is preceded by a comment. Strip leading comments first.
export const withoutLeadingComments = (s) => s.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '');

export const isCreate = (s) => /^\s*create\s+table\b/i.test(withoutLeadingComments(s));

export const isNoop = (s) => !s.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();

// Short, safe label for a statement so a failure can be identified without
// reprinting the statement (it may contain literals).
export function statementHead(s, max = 70) {
  return withoutLeadingComments(s).replace(/\s+/g, ' ').trim().slice(0, max);
}
