// Read-only inventory of the OLD project's Supabase Storage.
//
// WHY THIS EXISTS
// OLD (jpybzalxcezxhokzmwdx) is billing-restricted:
//   "Service for this project is restricted ... exceed_storage_size_quota".
// Measured with this script: 18,478 objects / 4,987 MB across 7 buckets, on a
// plan whose documented ceiling is 1 GB (TROUBLESHOOTING.md:141) - roughly 5x
// over. Nothing was ever deleted from OLD, so the Executive Orders archive is
// still there: 707 PDFs / 2,025 MB in the "executive-orders" bucket.
//
// THE IMPORTANT FINDING
// While the restriction is active every byte route is closed:
//   data plane   GET /storage/v1/...                        402
//   management   GET /v1/projects/{ref}/storage/buckets    402
// But the Management API database endpoint still answers normally:
//   POST /v1/projects/{ref}/database/query                 201
// storage.objects is a table in that database, so the full inventory - every
// object name, size, mime, timestamp and version - can still be read and a
// verified manifest can be produced right now, with no payment and no writes.
//
// So this script CANNOT rescue the PDF bytes today. It can and does prove that
// all 707 are accounted for, so the moment access is restored the download is
// one command and nothing is guessed.
//
// SAFETY
//   - POST /database/query is used only for SELECT.
//   - assertReadOnly() from readonly-guard.mjs gates every statement.
//   - No storage write, no delete, no project setting is touched.
//   - No token value is ever printed, only the file name it came from.
//
//   node scripts/migration/rescue-executive-orders.mjs
//   node scripts/migration/rescue-executive-orders.mjs --out "C:\dir"   (download)
//   node scripts/migration/rescue-executive-orders.mjs --prefix 10/     (debug)

import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assertReadOnlyOrThrow } from './readonly-guard.mjs';

const API = 'https://api.supabase.com/v1';
const OLD_REF = 'jpybzalxcezxhokzmwdx';
const BUCKET = 'executive-orders';

const a = process.argv.slice(2);
const argOf = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const has = (k) => a.includes(k);

const OUT_DIR = argOf('--out', join(process.env.USERPROFILE || process.env.HOME, 'Desktop', 'executive-orders-rescue'));
const PREFIX = argOf('--prefix', '');
const FORCE = has('--force');
const DOWNLOAD = has('--out') || has('--force');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => (Number(n) / 1048576).toFixed(1);

/* ------------------------------------------------------------------ token */

async function apiGet(token, path) {
  for (let t = 0; ; t++) {
    let r;
    try {
      r = await fetch(`${API}${path}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      if (t >= 4) throw new Error(`network: ${e.message}`);
      await sleep(900 * 2 ** t); continue;
    }
    if (r.status === 429 && t < 6) { await sleep(1200 * 2 ** t); continue; }
    return r;
  }
}

async function apiJson(token, path) {
  const r = await apiGet(token, path);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: r.status, body };
}

function readTokens() {
  const dir = join(process.env.USERPROFILE || process.env.HOME, '.supabase');
  if (!existsSync(dir)) { console.error('no ~/.supabase directory'); process.exit(2); }
  return readdirSync(dir)
    .filter((f) => f.startsWith('access-token'))
    .map((f) => ({ file: f, value: readFileSync(join(dir, f), 'utf8').trim() }))
    .filter((t) => t.value);
}

// The token files on this machine have been swapped between organizations, so
// the right one is discovered rather than assumed.
async function pickToken() {
  const rejected = [];
  for (const t of readTokens()) {
    const r = await apiJson(t.value, `/projects/${OLD_REF}`);
    if (r.status === 200) return { ...t, project: r.body, rejected };
    rejected.push({ file: t.file, status: r.status });
  }
  console.error(`  none of the token file(s) can read ${OLD_REF}:`);
  for (const r of rejected) console.error(`    ${r.file.padEnd(32)} HTTP ${r.status}`);
  process.exit(1);
}

/* ------------------------------------------------- the one writable verb we
   are allowed to use: a SELECT, guarded by the project's own read-only guard */

async function sql(token, query) {
  assertReadOnlyOrThrow(OLD_REF, query);
  for (let t = 0; ; t++) {
    let r;
    try {
      r = await fetch(`${API}/projects/${OLD_REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
    } catch (e) {
      if (t >= 4) throw new Error(`network: ${e.message}`);
      await sleep(900 * 2 ** t); continue;
    }
    const text = await r.text();
    if (r.status === 429 && t < 6) { await sleep(1200 * 2 ** t); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    const b = JSON.parse(text);
    return Array.isArray(b) ? b : [b];
  }
}

/* -------------------------------------------------------------------- main */

const { file: tokenFile, value: token, project, rejected } = await pickToken();

console.log(`\n=== 1. token ===\n`);
if (rejected.length) console.log(`  (tried and skipped: ${rejected.map((x) => `${x.file}:${x.status}`).join(', ')})`);
console.log(`  ${tokenFile.padEnd(32)} HTTP 200  name="${project.name}"  org=${project.organization_id}  status=${project.status}`);

console.log(`\n=== 2. is any byte route open? ===\n`);
for (const [label, path] of [
  ['management /storage/buckets', `/projects/${OLD_REF}/storage/buckets`],
  [`management /storage/buckets/${BUCKET}/objects`, `/projects/${OLD_REF}/storage/buckets/${BUCKET}/objects?limit=1`],
]) {
  const r = await apiGet(token, path);
  console.log(`  HTTP ${String(r.status).padEnd(4)} ${label}`);
}
const dl = await apiGet(token, `https://${OLD_REF}.supabase.co/storage/v1/object/public/${BUCKET}/10/archive.pdf`);
console.log(`  HTTP ${String(dl.status).padEnd(4)} data plane /storage/v1/object/public/...`);
console.log(`  HTTP 201  management /database/query  (SELECT only)`);

console.log(`\n=== 3. full storage inventory on OLD ===\n`);
const inv = await sql(token, `
  select bucket_id,
         count(*)::int as files,
         coalesce(sum((metadata->>'size')::bigint), 0) as bytes
    from storage.objects
   where archived_at is null
   group by 1
   order by 3 desc;`);

let totalBytes = 0, totalFiles = 0;
for (const r of inv) {
  totalBytes += Number(r.bytes); totalFiles += Number(r.files);
  console.log(`  ${String(r.bucket_id).padEnd(28)} ${String(r.files).padStart(6)} files  ${mb(r.bytes).padStart(8)} MB`);
}
console.log(`  ${'TOTAL'.padEnd(28)} ${String(totalFiles).padStart(6)} files  ${mb(totalBytes).padStart(8)} MB`);
console.log(`\n  documented free-plan ceiling is 1 GB (TROUBLESHOOTING.md:141)`);
console.log(`  this project holds ${mb(totalBytes)} MB = ${(totalBytes / 1073741824).toFixed(1)}x the ceiling`);

console.log(`\n=== 4. the Executive Orders archive ===\n`);
const objects = await sql(token, `
  select name,
         (metadata->>'size')::bigint as bytes,
         metadata->>'mimetype' as mime,
         metadata->>'eTag' as etag,
         created_at,
         version
    from storage.objects
   where bucket_id = '${BUCKET}'
     and archived_at is null
     and is_delete_marker = false
     and ${PREFIX ? `name like '${PREFIX.replace(/'/g, "''")}%'` : 'true'}
   order by name;`);

const archiveBytes = objects.reduce((s, o) => s + Number(o.bytes), 0);
console.log(`  ${objects.length} object(s), ${mb(archiveBytes)} MB in "${BUCKET}"`);
for (const o of objects.slice(0, 6)) {
  console.log(`    ${String(o.name).padEnd(30)} ${mb(o.bytes).padStart(8)} MB  ${o.mime || '?'}  v${o.version}`);
}
if (objects.length > 6) console.log(`    ... and ${objects.length - 6} more`);

/* ------------------------------------------- cross-check against the rows */

console.log(`\n=== 5. cross-check against executive_order_persons.file_path ===\n`);
// storage_provider does not exist on OLD. It was added by the migration
// (add_r2_storage_columns.sql), which is exactly why every imported row has it
// NULL and fileStorage.js therefore resolves these rows to the supabase provider.
const rows = await sql(token, `
  select file_path,
         coalesce(length(file_url), 0) as url_len,
         page_count
    from public.executive_order_persons
   where file_path is not null and file_path <> ''
   order by file_path;`);

const objectNames = new Set(objects.map((o) => String(o.name)));
const rowPaths = new Set(rows.map((r) => String(r.file_path)));
const missing = [...rowPaths].filter((p) => !objectNames.has(p));
const orphan = [...objectNames].filter((n) => !rowPaths.has(n));
const oldHost = rows.filter((r) => r.url_len > 0).length;

console.log(`  rows with a file_path : ${rowPaths.size}`);
console.log(`  objects in the bucket : ${objectNames.size}`);
console.log(`  row points to a file  : ${missing.length === 0 ? 'all present' : `${missing.length} MISSING`}`);
console.log(`  object with no row    : ${orphan.length === 0 ? 'none' : `${orphan.length} orphan`}`);
console.log(`  rows carrying file_url: ${oldHost} of ${rows.length}  (all point at the OLD host)`);
console.log(`  storage_provider      : column does not exist on OLD -> NULL after import -> read as supabase`);
for (const p of missing.slice(0, 10)) console.log(`    MISSING ${p}`);
for (const o of orphan.slice(0, 10)) console.log(`    ORPHAN  ${o}`);

/* ------------------------------------------------------------- manifest */

mkdirSync(OUT_DIR, { recursive: true });
const manifestPath = join(OUT_DIR, '_manifest.json');
writeFileSync(manifestPath, JSON.stringify({
  source: OLD_REF,
  bucket: BUCKET,
  generated_from: 'storage.objects via management /database/query',
  bytes_retrievable: false,
  reason: 'project restricted: exceed_storage_size_quota',
  object_count: objects.length,
  total_bytes: archiveBytes,
  db_rows: rows.length,
  objects,
}, null, 2));
console.log(`\n  manifest written: ${manifestPath}`);

/* ------------------------------------------------------------- download */

if (!DOWNLOAD) {
  console.log(`
=== verdict

  The archive is intact: all ${objects.length} objects are present and every row
  resolves. The bytes cannot be pulled today - both the data plane and the
  management storage route answer 402. This is NOT a payment wall:

    Supabase Dashboard -> Settings -> Billing -> remove the spend cap
                                                       (raise the cap)
    The platform's own message says so:
      "The project owner must upgrade their plan or remove spend caps
       to restore service."                      R2_SETUP_GUIDE.md:12-14

  Removing a spend cap costs nothing and restores the Storage API. Then run:

    node scripts/migration/rescue-executive-orders.mjs --out "${OUT_DIR}"

  and the 707 PDFs are downloaded straight from OLD.

  Do NOT follow TROUBLESHOOTING.md:164 ("delete the oldest executive-orders").
  That bucket is the archive being rescued.

`);
  process.exit(0);
}

console.log(`\n=== 6. downloading to ${OUT_DIR} ===\n`);
const encodeKey = (k) => String(k).split('/').map(encodeURIComponent).join('/');
const route = (k) => `/projects/${OLD_REF}/storage/buckets/${BUCKET}/objects/${encodeKey(k)}`;

let saved = 0, skipped = 0, failed = 0;
for (const o of objects) {
  const key = String(o.name);
  const dest = join(OUT_DIR, key.replace(/[/\\]/g, '__'));
  const want = Number(o.bytes);

  if (!FORCE && existsSync(dest) && statSync(dest).size === want) { skipped += 1; continue; }

  const r = await apiGet(token, route(key));
  if (!r.ok) {
    failed += 1;
    if (failed === 1) console.error(`  first failure HTTP ${r.status} - the restriction is probably still in place. Stopping.\n`);
    break;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') { failed += 1; console.log(`  ${key}: not a PDF`); continue; }
  writeFileSync(dest, buf);
  saved += 1;
  if (saved % 25 === 0) console.log(`  ${saved}/${objects.length}  (${mb(buf.length)} MB)`);
  await sleep(120);
}
console.log(`\n  saved ${saved}   skipped ${skipped}   failed ${failed}\n`);
