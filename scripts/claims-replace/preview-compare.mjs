// مقارنة قراءة الملف المصدري بقاعدة البيانات الحالية - قراءة فقط، بدون أي كتابة.
import fs from "node:fs";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const SRC = "C:/Users/DELL/Downloads/مطالبات (4).xlsx";
const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function all(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(table + ": " + error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const text = (v) => String(v ?? "").trim();
const norm = (v) => text(v).replace(/\s+/g, " ");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const isInst = (v) => /^ق\s*\d+$/.test(text(v));
const isRemLabel = (v) => /متبق/.test(text(v));

function fmtDate(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    if (y < 1950) return null;
    return `${y}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = text(v);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]), m = Number(iso[2]), d = Number(iso[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { invalid: s };
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const m = s.match(/^(\d{1,2})[\\/.-](\d{1,2})[\\/.-](\d{2,4})$/);
  if (!m) return { invalid: s };
  let a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
  if (y < 100) y += y > 50 ? 1900 : 2000;
  const sep = s.match(/[\\/.-]/)[0];
  let day, month;
  if (sep === "\\" || a > 12) { day = a; month = b; } else { month = a; day = b; }
  const dt = new Date(Date.UTC(y, month - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return { invalid: s };
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const wb = XLSX.read(fs.readFileSync(SRC), { type: "buffer", cellDates: true });
const fileClaims = [];
const fileIssues = [];

for (const sheet of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, raw: true, blankrows: false });
  let cur = null;
  let pendingRemaining = false;
  rows.forEach((r, idx) => {
    const rowNumber = idx + 1;
    const c1 = text(r[1]);
    const c2 = num(r[2]);
    if (c1 === "الاسم") { cur = null; pendingRemaining = false; return; }
    if (c1 && !isInst(c1) && !isRemLabel(c1) && c2 !== null && c2 > 0) {
      const from = fmtDate(r[3]);
      const to = fmtDate(r[4]);
      if (from && typeof from === "object") fileIssues.push({ sheet, rowNumber, name: c1, field: "مدة من", raw: from.invalid });
      if (to && typeof to === "object") fileIssues.push({ sheet, rowNumber, name: c1, field: "حتى تاريخ", raw: to.invalid });
      cur = {
        sheet, rowNumber, serial: r[0] ?? null, name: norm(c1), total: round2(c2),
        from: from && typeof from === "string" ? from : null,
        to: to && typeof to === "string" ? to : null,
        dept: norm(r[5]) || null, status: norm(r[6]) || null,
        remaining: null, installments: [], extras: [],
      };
      fileClaims.push(cur);
      pendingRemaining = false;
      return;
    }
    if (!cur) return;
    if (isRemLabel(r[2])) {
      const inline = num(r[1]);
      if (inline !== null) { cur.remaining = round2(Math.abs(inline)); pendingRemaining = false; }
      else pendingRemaining = true;
      return;
    }
    if (pendingRemaining && c1 === "" && c2 !== null) {
      cur.remaining = round2(Math.abs(c2));
      if (r[3] || r[4]) cur.extras.push({ rowNumber, amount: round2(c2), date: fmtDate(r[3]), receipt: text(r[4]) || null });
      pendingRemaining = false;
      return;
    }
    if (isInst(c1)) {
      cur.installments.push({ rowNumber, number: Number(c1.match(/\d+/)[0]), amount: c2 === null ? null : round2(c2), paidAt: fmtDate(r[3]), receipt: text(r[4]) || null });
      return;
    }
    if (c1 === "" && c2 !== null) {
      cur.extras.push({ rowNumber, amount: round2(c2), date: fmtDate(r[3]), receipt: text(r[4]) || null });
    }
  });
}

// خطة السداد المتوقعة من الملف (نفس منطق المعاينة)
const expected = fileClaims.map((c) => {
  const paidInst = c.installments.filter((i) => i.amount !== null && i.amount > 0);
  let paid = 0, remaining = c.total, status = null;
  if (c.sheet === "خالي الطرف") { paid = c.total; remaining = 0; status = "خالي الطرف"; }
  else if (c.sheet === "لم يسدد") { paid = 0; remaining = c.total; status = "لم يسدد"; }
  else if (c.sheet === "جاري السداد") {
    status = "جاري السداد";
    paid = round2(paidInst.reduce((s, i) => s + i.amount, 0));
    remaining = round2(c.total - paid);
  }
  return { sheet: c.sheet, row: c.rowNumber, name: c.name, total: c.total, from: c.from, to: c.to, dept: c.dept, status, paid, remaining, fileStatus: c.status, paidRows: paidInst.length, extras: c.extras };
});

const dbClaims = await all("claims");
const dbInst = await all("claim_installments");
const dbInstByClaim = {};
for (const i of dbInst) (dbInstByClaim[i.claim_id] ||= []).push(i);

const dbByKey = new Map();
for (const c of dbClaims) dbByKey.set(`${c.sheet_name}||${c.row_number}`, c);

const fileByKey = new Map();
for (const c of expected) fileByKey.set(`${c.sheet}||${c.row}`, c);

const missingInDb = expected.filter((c) => !dbByKey.has(`${c.sheet}||${c.row}`));
const extraInDb = dbClaims.filter((c) => !fileByKey.has(`${c.sheet_name}||${c.row_number}`));
const diffs = [];
for (const c of expected) {
  const d = dbByKey.get(`${c.sheet}||${c.row}`);
  if (!d) continue;
  const dItem = {
    key: `${c.sheet}||${c.row}`,
    name: { file: c.name, db: norm(d.claimant_name) },
    total: { file: c.total, db: Number(d.total_amount) },
    paid: { file: c.paid, db: Number(d.paid_amount) },
    remaining: { file: c.remaining, db: Number(d.remaining_amount) },
    status: { file: c.status, db: d.payment_status ?? null },
    from: { file: c.from, db: d.data?.["مدة من "] ?? d.data?.["من"] ?? null },
    to: { file: c.to, db: d.data?.["حتى تاريخ"] ?? d.data?.["الى"] ?? null },
    dept: { file: c.dept, db: norm(d.data?.["القسم"]) || null },
    installmentsInDb: (dbInstByClaim[d.id] || []).length,
    paidRowsInFile: c.paidRows,
    extrasInFile: c.extras.length ? c.extras : undefined,
  };
  const changed =
    dItem.name.file !== dItem.name.db ||
    Math.abs(dItem.total.file - dItem.total.db) > 0.005 ||
    Math.abs(dItem.paid.file - dItem.paid.db) > 0.005 ||
    Math.abs(dItem.remaining.file - dItem.remaining.db) > 0.005 ||
    dItem.status.file !== dItem.status.db ||
    dItem.from.file !== dItem.from.db ||
    dItem.to.file !== dItem.to.db ||
    dItem.dept.file !== dItem.dept.db;
  if (changed) diffs.push(dItem);
}

const sheetCounts = {};
for (const c of dbClaims) sheetCounts[c.sheet_name] = (sheetCounts[c.sheet_name] || 0) + 1;
const fileCounts = {};
for (const c of expected) fileCounts[c.sheet] = (fileCounts[c.sheet] || 0) + 1;
const sumBy = (arr, k) => round2(arr.reduce((s, x) => s + Number(x[k] || 0), 0));

const result = {
  source: SRC,
  file: {
    claims: expected.length,
    perSheet: fileCounts,
    total: sumBy(expected.map((c) => ({ v: c.total })), "v"),
    paid: sumBy(expected.map((c) => ({ v: c.paid })), "v"),
    remaining: sumBy(expected.map((c) => ({ v: c.remaining })), "v"),
    paidInstallmentRows: expected.reduce((s, c) => s + c.paidRows, 0),
    invalidDates: fileIssues,
    extras: expected.filter((c) => c.extras.length).map((c) => ({ sheet: c.sheet, row: c.row, name: c.name, extras: c.extras })),
    noInstallmentDetails: expected.filter((c) => c.sheet === "جاري السداد" && c.paidRows === 0).map((c) => ({ row: c.row, name: c.name, total: c.total, paid: c.paid, remaining: c.remaining })),
  },
  db: {
    claims: dbClaims.length,
    perSheet: sheetCounts,
    total: sumBy(dbClaims, "total_amount"),
    paid: sumBy(dbClaims, "paid_amount"),
    remaining: sumBy(dbClaims, "remaining_amount"),
    installments: dbInst.length,
  },
  missingInDb: missingInDb.map((c) => ({ sheet: c.sheet, row: c.row, name: c.name, total: c.total })),
  extraInDb: extraInDb.map((c) => ({ id: c.id, sheet: c.sheet_name, row: c.row_number, name: c.claimant_name, total: c.total_amount })),
  diffs,
};

fs.writeFileSync("scripts/claims-replace/preview-compare.json", JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify({
  file: { claims: result.file.claims, perSheet: result.file.perSheet, total: result.file.total, paid: result.file.paid, remaining: result.file.remaining, paidInstallmentRows: result.file.paidInstallmentRows },
  db: result.db,
  counts: { missingInDb: result.missingInDb.length, extraInDb: result.extraInDb.length, diffs: diffs.length, invalidDates: fileIssues.length, extras: result.file.extras.length },
  missingInDb: result.missingInDb,
  extraInDb: result.extraInDb,
  invalidDates: result.file.invalidDates,
  extras: result.file.extras,
  noInstallmentDetails: result.file.noInstallmentDetails,
  diffs,
}, null, 2));
