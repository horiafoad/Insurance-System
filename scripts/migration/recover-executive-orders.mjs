// Rebuild the Executive Orders archive from the copies that still exist on this
// machine, then publish them to Cloudflare R2.
//
// WHY
// The Supabase copies are gone in practice: the OLD project is billing
// restricted (exceed_storage_size_quota) and every byte route answers 402, so
// executive-orders/*.pdf cannot be downloaded. plan-local-recovery.mjs showed
// that 655 of the 707 people are still present on local disk, and that those
// 655 are exactly the people with a single order - meaning their file on disk IS
// the archive.pdf that went missing. The remaining 52 people have 2-4 orders
// each and must be merged from their individual scans.
//
// FOUR STAGES, each one useless without the previous one
//   build   local disk            -> <out>/<id>/archive.pdf     no credentials
//   verify  re-open every output and check pages against the export
//   upload  that bundle           -> R2, key executive-orders/<id>/archive.pdf
//   sql     prints the UPDATE that repoints executive_order_persons.file_url
//
// The R2 key and the stored reference both match what the app already writes:
//   ExecutiveOrdersPage.jsx  ${person.id}/archive.pdf   passed to uploadFile
//   fileStorage.js:86       buildR2Ref(bucket, path)   -> r2://<path>
// so nothing in the application has to change.
//
//   node scripts/migration/recover-executive-orders.mjs --stage build
//   node scripts/migration/recover-executive-orders.mjs --stage build --out C:\somewhere
//   node scripts/migration/recover-executive-orders.mjs --stage verify
//   node scripts/migration/recover-executive-orders.mjs --stage upload
//   node scripts/migration/recover-executive-orders.mjs --stage sql

import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

const a = process.argv.slice(2);
const argOf = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const STAGE = argOf('--stage', 'build');
const OUT = argOf('--out', 'D:\\executive-orders-rebuild');
const ND = 'scripts/export-old-data/ndjson';
const R2_REGION = 'auto';
const BUCKET = 'executive-orders';

const mb = (n) => (n / 1048576).toFixed(1);

/* ---------------------------------------------------------------- sources */

const ROOTS = [
  'C:\\Users\\DELL\\Desktop\\SCAN',
  'C:\\Users\\DELL\\Desktop\\اوامر',
  'C:\\Users\\DELL\\Desktop\\New folder',
  'C:\\Users\\DELL\\Downloads',
  'C:\\ScanInbox',
];

function normalizeArabicText(value) {
  return String(value || '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىيئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const readNd = (f) =>
  readFileSync(join(ND, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const index = new Map(); // normalised basename -> [absolute paths]
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(pdf|jpe?g)$/i.test(e.name)) continue;
    const key = normalizeArabicText(e.name.replace(/\.[^.]+$/, ''));
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(p);
  }
}
for (const r of ROOTS) if (existsSync(r)) walk(r);

const find = (name) => (index.get(normalizeArabicText(String(name || '').replace(/\.[^.]+$/, ''))) || [])[0] || null;

/* ------------------------------------------------------------------ build */

// One file per person is the common case, and for people with several orders
// the two original_filename values often differ only in spelling (هاني / هانى),
// so they collapse to one index key. Taking the same scan twice would double
// every page, so resolved sources are deduplicated before merging.
function dedupeByFile(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item.file) continue;
    const k = item.file.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

async function build() {
  const persons = readNd('executive_order_persons.ndjson').filter((p) => p.file_path);
  const orders = readNd('executive_orders.ndjson');
  const ordersByPerson = new Map();
  for (const o of orders) {
    if (!ordersByPerson.has(o.person_id)) ordersByPerson.set(o.person_id, []);
    ordersByPerson.get(o.person_id).push(o);
  }

  mkdirSync(OUT, { recursive: true });

  const built = [];
  const skipped = [];
  let copied = 0, merged = 0, missingParts = 0;

  for (const p of persons) {
    const mine = (ordersByPerson.get(p.id) || []).slice().sort(
      (x, y) => String(x.order_date || '').localeCompare(String(y.order_date || '')) || (x.id - y.id),
    );

    // Single order: the file on disk is the archive itself, so take it verbatim.
    // More than one: the archive was a merge, so rebuild it from the scans.
    const resolved = mine.length > 1
      ? mine.map((o) => ({ order: o, file: find(o.original_filename) }))
      : [{ order: mine[0], file: find(p.full_name) || find(mine[0]?.original_filename) }];

    const present = dedupeByFile(resolved);
    const collapsed = resolved.filter((x) => x.file).length - present.length;
    if (!present.length) { skipped.push({ id: p.id, name: p.full_name, reason: 'no file on disk' }); continue; }
    if (mine.length > 1 && present.length < mine.length) missingParts += mine.length - present.length - collapsed;

    const dest = join(OUT, String(p.id), 'archive.pdf');
    mkdirSync(join(OUT, String(p.id)), { recursive: true });

    try {
      if (present.length === 1 && /\.pdf$/i.test(present[0].file)) {
        copyFileSync(present[0].file, dest);
        copied += 1;
      } else {
        const mergedDoc = await PDFDocument.create();
        for (const part of present) {
          const src = await PDFDocument.load(readFileSync(part.file));
          const pages = await mergedDoc.copyPages(src, src.getPageIndices());
          pages.forEach((pg) => mergedDoc.addPage(pg));
        }
        writeFileSync(dest, await mergedDoc.save());
        merged += 1;
      }
      const bytes = statSync(dest).size;
      if (bytes === 0) { skipped.push({ id: p.id, name: p.full_name, reason: 'empty output' }); continue; }
      built.push({
        id: p.id,
        full_name: p.full_name,
        order_count: mine.length,
        parts_used: present.length,
        collapsed_variants: collapsed,
        expected_pages: p.page_count,
        bytes,
        source: present.map((x) => x.file),
      });
    } catch (e) {
      skipped.push({ id: p.id, name: p.full_name, reason: e.message });
    }
  }

  writeFileSync(join(OUT, '_build-report.json'), JSON.stringify({ built, skipped }, null, 2));

  const totalBytes = built.reduce((s, b) => s + b.bytes, 0);
  console.log(`\n=== build -> ${OUT} ===\n`);
  console.log(`  copied verbatim (1 order) : ${copied}`);
  console.log(`  merged (2+ orders)        : ${merged}`);
  console.log(`  people with no file       : ${skipped.filter((s) => s.reason === 'no file on disk').length}`);
  console.log(`  other failures            : ${skipped.filter((s) => s.reason !== 'no file on disk').length}`);
  console.log(`\n  archives built            : ${built.length} / ${persons.length}  (${((built.length / persons.length) * 100).toFixed(1)}%)`);
  console.log(`  total size                : ${mb(totalBytes)} MB`);
  if (missingParts) console.log(`  partially rebuilt         : ${missingParts} scan(s) of a multi-order person were absent`);

  const partial = built.filter((b) => b.parts_used < b.order_count);
  if (partial.length) {
    console.log(`\n  INCOMPLETE (missing at least one scan): ${partial.length}`);
    for (const b of partial) console.log(`    id=${b.id}  ${b.full_name}  ${b.parts_used}/${b.order_count} scans`);
  }
  if (skipped.length) {
    console.log(`\n  NOT BUILT:`);
    for (const s of skipped) console.log(`    id=${s.id}  ${s.name}  (${s.reason})`);
  }
  console.log(`\n  report: ${join(OUT, '_build-report.json')}\n`);
  return { built, skipped };
}

/* ------------------------------------------------------------------ verify */

// Stage 2 of 3. Re-opens every rebuilt archive and compares its real page count
// against page_count in the export, which is how a botched merge or a truncated
// scan shows up before 2 GB is uploaded and pointed at.
async function verify() {
  const reportPath = join(OUT, '_build-report.json');
  if (!existsSync(reportPath)) { console.error(`\n  run --stage build first\n`); process.exit(2); }
  const { built } = JSON.parse(readFileSync(reportPath, 'utf8'));
  const dbById = new Map(readNd('executive_order_persons.ndjson').map((p) => [p.id, p]));

  console.log(`\n=== verify -> ${OUT} ===\n`);
  const bad = [];
  let good = 0, pageMatch = 0;
  const pageDiff = [];

  for (const b of built) {
    const f = join(OUT, String(b.id), 'archive.pdf');
    if (!existsSync(f)) { bad.push({ id: b.id, why: 'file missing' }); continue; }
    const size = statSync(f).size;
    if (size < 1024) { bad.push({ id: b.id, why: `only ${size} bytes` }); continue; }
    try {
      const doc = await PDFDocument.load(readFileSync(f));
      const pages = doc.getPageCount();
      b.actual_pages = pages;
      b.size = size;
      if (pages < 1) { bad.push({ id: b.id, why: 'zero pages' }); continue; }
      good += 1;
      const expected = dbById.get(b.id)?.page_count;
      if (Number.isFinite(expected) && expected > 0) {
        if (expected === pages) pageMatch += 1;
        else pageDiff.push({ id: b.id, name: b.full_name, expected, pages, scans: `${b.parts_used}/${b.order_count}` });
      }
    } catch (e) {
      bad.push({ id: b.id, why: `unreadable: ${e.message}` });
    }
  }

  console.log(`  readable archives        : ${good} / ${built.length}`);
  console.log(`  corrupt or truncated     : ${bad.length}`);
  for (const x of bad.slice(0, 20)) console.log(`     id=${x.id}  ${x.why}`);

  console.log(`\n  page count vs export (${pageMatch + pageDiff.length} rows comparable)`);
  console.log(`     exact match           : ${pageMatch}`);
  console.log(`     different             : ${pageDiff.length}`);
  for (const d of pageDiff.slice(0, 25)) {
    console.log(`     id=${String(d.id).padEnd(4)} ${d.name.padEnd(40)} export=${d.expected} rebuilt=${d.pages} scans=${d.scans}`);
  }

  const multi = built.filter((b) => b.order_count > 1);
  console.log(`\n  multi-order rebuilt      : ${multi.length}`);
  console.log(`     pages in export       : ${multi.reduce((s, b) => s + (dbById.get(b.id)?.page_count || 0), 0)}`);
  console.log(`     pages after rebuild   : ${multi.reduce((s, b) => s + (b.actual_pages || 0), 0)}`);

  // Re-read so the `skipped` list written by build survives; verify only adds keys.
  const previous = JSON.parse(readFileSync(reportPath, 'utf8'));
  writeFileSync(join(OUT, '_build-report.json'), JSON.stringify({ ...previous, built, bad, pageDiff }, null, 2));
  console.log(`\n  ${bad.length === 0 ? 'PASS - every archive opens and no page was lost silently.' : 'FAIL - do not upload until the rows above are understood.'}\n`);
}

/* ------------------------------------------------------------------ upload */

function readSecretFile() {
  const f = join('scripts', 'migration', '.r2-secrets.local');
  const out = {};
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const uriEncode = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encodeKeyPath = (k) => k.split('/').map(uriEncode).join('/');
const sha256Hex = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? Buffer.from(v, 'utf8') : v).digest('hex');
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m, 'utf8').digest();

function signPut({ host, bucket, key, body, contentType, accessKeyId, secretAccessKey }) {
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const stamp = amz.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${bucket}/${encodeKeyPath(key)}`;
  const scope = `${stamp}/${R2_REGION}/s3/aws4_request`;
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amz, 'content-type': contentType };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}`).join('\n') + '\n';
  const signedHeaders = names.join(';');
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac('AWS4' + secretAccessKey, stamp);
  const kRegion = hmac(kDate, R2_REGION);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');
  const query = [
    'X-Amz-Algorithm=AWS4-HMAC-SHA256',
    `X-Amz-Credential=${uriEncode(`${accessKeyId}/${scope}`)}`,
    `X-Amz-Date=${amz}`,
    'X-Amz-Expires=900',
    `X-Amz-SignedHeaders=${uriEncode(signedHeaders)}`,
    `X-Amz-Signature=${signature}`,
  ].join('&');
  return { url: `https://${host}${canonicalUri}?${query}`, headers };
}

async function upload() {
  const secretFile = join('scripts', 'migration', '.r2-secrets.local');
  if (!existsSync(secretFile)) {
    console.error(`\n  no ${secretFile}`);
    console.error('  create it with R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME\n');
    process.exit(2);
  }
  const s = readSecretFile();
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'].filter((k) => !s[k]);
  if (missing.length) { console.error(`\n  missing in .r2-secrets.local: ${missing.join(', ')}\n`); process.exit(2); }

  const host = `${s.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const reportPath = join(OUT, '_build-report.json');
  if (!existsSync(reportPath)) { console.error(`\n  run --stage build first (${reportPath} missing)\n`); process.exit(2); }
  const { built } = JSON.parse(readFileSync(reportPath, 'utf8'));

  console.log(`\n=== upload -> R2 ===\n`);
  console.log(`  bucket : ${s.R2_BUCKET_NAME}`);
  console.log(`  host   : ${host}`);
  console.log(`  files  : ${built.length}\n`);

  let ok = 0, fail = 0, bytes = 0;
  for (const b of built) {
    const key = `${BUCKET}/${b.id}/archive.pdf`;
    const body = readFileSync(join(OUT, String(b.id), 'archive.pdf'));
    const req = signPut({
      host, bucket: s.R2_BUCKET_NAME, key, body, contentType: 'application/pdf',
      accessKeyId: s.R2_ACCESS_KEY_ID, secretAccessKey: s.R2_SECRET_ACCESS_KEY,
    });
    const res = await fetch(req.url, { method: 'PUT', headers: req.headers, body });
    if (res.ok) { ok += 1; bytes += body.length; }
    else { fail += 1; console.log(`  FAILED ${key}  HTTP ${res.status}  ${(await res.text()).slice(0, 120)}`); }
    if (ok % 25 === 0) console.log(`  ${ok}/${built.length}  (${mb(bytes)} MB)`);
  }
  console.log(`\n  uploaded ${ok}   failed ${fail}   ${mb(bytes)} MB\n`);
}

/* --------------------------------------------------------------------- sql */

function emitSql() {
  const reportPath = join(OUT, '_build-report.json');
  if (!existsSync(reportPath)) { console.error(`\n  run --stage build first\n`); process.exit(2); }
  const { built } = JSON.parse(readFileSync(reportPath, 'utf8'));
  // Derived from the export rather than trusted from the report, so it stays
  // correct no matter which stage wrote the file last.
  const builtIds = new Set(built.map((b) => b.id));
  const skipped = readNd('executive_order_persons.ndjson')
    .filter((p) => p.file_path && !builtIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.full_name }));

  console.log(`
=== stage: sql

  This is the ONLY statement that changes the database. It is printed, not run.
  Review it, then paste it into the Supabase SQL Editor. Nothing in this
  repository executes it automatically.

  It sets file_url to the r2:// reference that fileStorage.js already resolves
  into a signed URL at display time, so the app keeps working unchanged.

  ${built.length} people are repointed. The ${skipped.length} with no rebuilt file keep their
  current rows untouched, so they simply stay listed but unopenable.
`);

  // Mirrors exactly what uploadFile() writes on a normal R2 upload:
  //   file_path  = "<id>/archive.pdf"                 the path handed to uploadFile
  //   storage_key= "executive-orders/<id>/archive.pdf"  what the function returns as .key
  //   file_url   = "r2://executive-orders/<id>/archive.pdf"  what buildR2Ref() produces
  // file_url is the field resolveRef() actually reads (fileStorage.js:99), so the
  // other two are for consistency with rows written by the app itself.
  const lines = built.map(
    (b) => `update public.executive_order_persons set file_url = 'r2://${BUCKET}/${b.id}/archive.pdf', file_path = '${b.id}/archive.pdf', storage_key = '${BUCKET}/${b.id}/archive.pdf', storage_provider = 'r2', page_count = ${b.actual_pages ?? b.expected_pages}, updated_at = now() where id = ${b.id};`,
  );
  console.log('```sql');
  console.log('begin;');
  console.log(lines.join('\n'));
  console.log('commit;');
  console.log('```\n');
  writeFileSync(join(OUT, '_repoint.sql'), `begin;\n${lines.join('\n')}\ncommit;\n`);
  console.log(`  also written to ${join(OUT, '_repoint.sql')}\n`);
}

/* -------------------------------------------------------------------- main */

if (STAGE === 'build') await build();
else if (STAGE === 'verify') await verify();
else if (STAGE === 'upload') await upload();
else if (STAGE === 'sql') emitSql();
else { console.error(`unknown --stage "${STAGE}" (use build | verify | upload | sql)`); process.exit(2); }
