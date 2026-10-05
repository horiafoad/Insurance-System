// Read-only recovery planner for the Executive Orders archive.
//
// The Supabase copies of executive-orders/*.pdf are unreachable: the OLD project
// is billing-restricted (exceed_storage_size_quota) and every byte route answers
// 402. This script asks a different question - how much of the archive already
// exists on this machine, so the parts that are gone can be identified
// precisely instead of being discovered later.
//
// Matching uses the application's own normalizeArabicText, the same comparison
// ExecutiveOrdersPage.jsx performs, so a match here means the app will find it.
//
//   node scripts/migration/plan-local-recovery.mjs
//   node scripts/migration/plan-local-recovery.mjs --list-missing
//   node scripts/migration/plan-local-recovery.mjs --out <dir>   (write report)

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const a = process.argv.slice(2);
const argOf = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const OUT = argOf('--out', '');
const LIST_MISSING = a.includes('--list-missing');

// Where a scanned order could plausibly live. D: is the big organisational
// archive, C:\Users\DELL is the desktop working area, E: is the spare volume.
const ROOTS = [
  'C:\\Users\\DELL\\Desktop\\SCAN',
  'C:\\Users\\DELL\\Desktop',
  'C:\\Users\\DELL\\Downloads',
  'C:\\Users\\DELL\\Documents',
  'C:\\ScanInbox',
  'D:\\horia\\HORIAA',
  'E:\\',
];
const ND = 'scripts/export-old-data/ndjson';

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

const persons = readNd('executive_order_persons.ndjson');
const orders = readNd('executive_orders.ndjson');

/* --------------------------------------------------------- index the disk */
const DOC = /\.(pdf|png|jpe?g)$/i;
const index = new Map(); // normalised basename -> [paths]
let scanned = 0;

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.worktrees') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!DOC.test(e.name)) continue;
    scanned += 1;
    const key = normalizeArabicText(e.name.replace(/\.[^.]+$/, ''));
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(p);
  }
}

for (const r of ROOTS) if (existsSync(r)) walk(r);

/* ------------------------------------------------------------ match people */
const withFile = persons.filter((p) => p.file_path);
const recovered = [];
const lost = [];

for (const p of withFile) {
  const hits = index.get(normalizeArabicText(p.full_name)) || [];
  const rec = {
    id: p.id,
    full_name: p.full_name,
    order_count: p.order_count,
    page_count: p.page_count,
    db_path: p.file_path,
    local_path: hits[0] || null,
    local_bytes: hits[0] ? statSync(hits[0]).size : 0,
  };
  (hits.length ? recovered : lost).push(rec);
}

const lostIds = new Set(lost.map((r) => r.id));
const hasOrderFile = (o) =>
  (index.get(normalizeArabicText(String(o.original_filename || '').replace(/\.[^.]+$/, ''))) || []).length > 0;
const ordersFound = orders.filter(hasOrderFile).length;
const ordersOfLostPersons = orders.filter((o) => lostIds.has(o.person_id));

const mb = (n) => (n / 1048576).toFixed(1);
const recoveredBytes = recovered.reduce((s, r) => s + r.local_bytes, 0);
const pct = (n, d) => ((n / d) * 100).toFixed(1);

console.log(`\n=== disk scan ===\n`);
console.log(`  roots   : ${ROOTS.filter(existsSync).length} of ${ROOTS.length} found`);
console.log(`  files   : ${scanned} document file(s) indexed`);

console.log(`\n=== A. per PERSON — what each archive.pdf stands for ===\n`);
console.log(`  persons in the export with a file_path : ${withFile.length}`);
console.log(`  recovered from this machine            : ${recovered.length}   (${pct(recovered.length, withFile.length)}%)`);
console.log(`  NOT found anywhere on this machine     : ${lost.length}   (${pct(lost.length, withFile.length)}%)`);
console.log(`  bytes recovered                        : ${mb(recoveredBytes)} MB`);
console.log(`  bytes in the unreachable bucket        : 2024.8 MB`);

console.log(`\n=== B. per ORDER — the individual scans ===\n`);
console.log(`  orders in the export                   : ${orders.length}`);
console.log(`  found on disk by original_filename     : ${ordersFound}   (${pct(ordersFound, orders.length)}%)`);
console.log(`  orders belonging to a lost person      : ${ordersOfLostPersons.length}`);

if (LIST_MISSING) {
  console.log(`\n=== C. the ${lost.length} that are genuinely not on this machine ===\n`);
  for (const r of lost) {
    console.log(`  id=${String(r.id).padEnd(5)} ${r.full_name.padEnd(45)} ${r.order_count} order(s)`);
  }
}

const report = {
  generated_from: 'local disk scan, read only',
  supabase_bucket_bytes_unreachable: 2123117904,
  persons_total: withFile.length,
  persons_recovered: recovered.length,
  persons_lost: lost.length,
  orders_total: orders.length,
  orders_found: ordersFound,
  recovered_bytes: recoveredBytes,
  recovered,
  lost,
};
if (OUT) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'local-recovery-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n  report: ${join(OUT, 'local-recovery-report.json')}`);
}
console.log('');
