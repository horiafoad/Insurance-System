import XLSX from "xlsx";
import fs from "node:fs";

const SRC = "C:/Users/DELL/Downloads/مطالبات (4).xlsx";
const wb = XLSX.readFile(SRC, { cellDates: true });
const rowsOf = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: null, raw: true });
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v) => String(v ?? "").trim();
const isInst = (v) => /^ق\s*\d+$/.test(text(v));
const isRemLabel = (v) => /متبق/.test(text(v));
const fmtDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = text(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})[\\/.-](\d{1,2})[\\/.-](\d{2,4})$/);
  if (m) {
    let a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    const sep = s.match(/[\\/.-]/)[0];
    let day, month;
    if (sep === "\\" || a > 12) { day = a; month = b; }
    else { month = a; day = b; }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
};
const dateValue = (v) => fmtDate(v) ?? (text(v) || "");
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const claims = [];
const issues = [];
const sheetStats = {};

for (const sheet of wb.SheetNames) {
  const rows = rowsOf(sheet);
  let cur = null;
  let pendingRemaining = false;
  const local = [];

  const pushClaim = (claim) => { claims.push(claim); local.push(claim); };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const c1 = text(r[1]);
    const c2n = num(r[2]);

    if (c1 === "الاسم") { cur = null; pendingRemaining = false; continue; }

    const mainName = c1 && !isInst(c1) && c2n !== null && c2n > 0;
    if (mainName) {
      const isInProgress = sheet === "جاري السداد";
      const nameKey = "الاسم";
      const amountKey = sheet === "بدون وجه حق" ? "المبلغ" : "مبلغ مطلوب";
      const data = {};
      data[sheet === "بدون وجه حق" ? "م" : "م"] = r[0] ?? "";
      data[nameKey] = c1;
      data[amountKey] = c2n;
      data[sheet === "بدون وجه حق" ? "من" : "مدة من "] = dateValue(r[3]);
      data[sheet === "بدون وجه حق" ? "الى" : "حتى تاريخ"] = dateValue(r[4]);
      if (sheet !== "بدون وجه حق") data["القسم"] = text(r[5]) || "";
      if (sheet !== "بدون وجه حق") data["حالة السداد"] = text(r[6]) || sheet;
      if (sheet === "خالي الطرف" && text(r[7])) data["ملاحظات"] = text(r[7]);

      cur = {
        sheet,
        rowNumber: i + 1,
        serial: r[0] ?? null,
        name: c1,
        total: round2(c2n),
        from: fmtDate(r[3]),
        to: fmtDate(r[4]),
        dept: sheet === "بدون وجه حق" ? null : (text(r[5]) || null),
        sheetStatus: sheet === "بدون وجه حق" ? "" : text(r[6]),
        note: sheet === "خالي الطرف" ? (text(r[7]) || null) : null,
        data,
        remaining: null,
        installments: [],
        extras: [],
        special: null,
      };
      pushClaim(cur);
      pendingRemaining = false;
      continue;
    }

    if (!cur) continue;

    if (isRemLabel(r[2])) {
      pendingRemaining = true;
      const v = num(r[1]);
      if (v !== null) { cur.remaining = round2(Math.abs(v)); pendingRemaining = false; }
      continue;
    }
    if (pendingRemaining && c1 === "" && c2n !== null) {
      cur.remaining = round2(Math.abs(c2n));
      pendingRemaining = false;
      continue;
    }
    if (isInst(c1)) {
      cur.installments.push({ no: Number(c1.match(/\d+/)[0]), amount: c2n === null ? null : round2(c2n), paidAt: fmtDate(r[3]), receipt: text(r[4]) || null, rowNumber: i + 1 });
      continue;
    }
    if (c1 === "" && c2n !== null) {
      cur.extras.push({ rowNumber: i + 1, amount: round2(c2n), date: fmtDate(r[3]), receipt: text(r[4]) || null });
      continue;
    }
    cur.extras.push({ rowNumber: i + 1, cells: r });
  }

  const paidInst = local.flatMap(c => c.installments).filter(i => i.amount !== null && i.amount > 0);
  sheetStats[sheet] = {
    claims: local.length,
    total: round2(local.reduce((a, c) => a + c.total, 0)),
    paidInstallmentRows: paidInst.length,
    paidInstallmentSum: round2(paidInst.reduce((a, i) => a + i.amount, 0)),
    withRemaining: local.filter(c => c.remaining !== null).length,
    remainingSum: round2(local.reduce((a, c) => a + (c.remaining || 0), 0)),
  };
  console.log(sheet, sheetStats[sheet]);
}

// Build final records + installment plan + validations
const finalClaims = [];
for (const c of claims) {
  const isProgress = c.sheet === "جاري السداد";
  const isSettled = c.sheet === "خالي الطرف";
  const isNotPaid = c.sheet === "لم يسدد";
  const paidInst = c.installments.filter(i => i.amount !== null && i.amount > 0);
  let paid = round2(paidInst.reduce((a, i) => a + i.amount, 0));
  let remaining = c.remaining;
  let paymentStatus = null;
  let status = "جديدة";

  if (isSettled) {
    paid = c.total;
    remaining = 0;
    paymentStatus = "خالي الطرف";
  } else if (isNotPaid) {
    paid = 0;
    remaining = c.total;
    paymentStatus = "لم يسدد";
  } else if (isProgress) {
    paymentStatus = "جاري السداد";
    if (paidInst.length === 0) {
      // No itemised payments in the source; derive the paid part from total - remaining.
      if (remaining === null) {
        remaining = round2(Math.max(0, c.total - paid));
        issues.push({ type: "missing_remaining", sheet: c.sheet, row: c.rowNumber, name: c.name, derived: remaining });
      }
      paid = round2(Math.max(0, c.total - remaining));
      if (paid > 0) {
        c.special = "no_installment_details";
        issues.push({ type: "no_installment_details", sheet: c.sheet, row: c.rowNumber, name: c.name, total: c.total, paid, remaining, action: "keep amounts; no installment rows because the source does not itemise them" });
      }
    } else {
      const diff = round2(c.total - paid - remaining);
      if (Math.abs(diff) > 1) {
        const corrected = round2(c.total - paid);
        issues.push({ type: "amount_mismatch", sheet: c.sheet, row: c.rowNumber, name: c.name, total: c.total, paid, excelRemaining: remaining, correctedRemaining: corrected, diff, action: "trust the itemised paid installments and correct the remaining amount" });
        remaining = corrected;
      }
    }
  } else {
    // بدون وجه حق
    paid = 0;
    remaining = c.total;
    paymentStatus = null;
  }

  const installments = [];
  if (isProgress && c.special !== "no_installment_details") {
    for (const inst of paidInst) {
      installments.push({ number: inst.no, amount: inst.amount, paid: true, paid_at: inst.paidAt, receipt_number: inst.receipt });
    }
    if (remaining > 0) {
      const used = new Set(installments.map(i => i.number));
      let next = 1;
      while (used.has(next) && next <= 4) next++;
      if (next <= 4) {
        installments.push({ number: next, amount: remaining, paid: false, paid_at: null, receipt_number: null });
      } else {
        issues.push({ type: "no_free_installment_slot", sheet: c.sheet, row: c.rowNumber, name: c.name, paidCount: installments.length, remaining });
      }
    }
  }

  // enrich data with payment block for in-progress
  if (isProgress) {
    c.data["مبلغ متبقى"] = remaining;
    for (let n = 1; n <= 4; n++) {
      const inst = c.installments.find(i => i.no === n);
      c.data[`ق ${n}`] = inst && inst.amount !== null ? inst.amount : "";
    }
  }

  finalClaims.push({
    sheet_name: c.sheet,
    row_number: c.rowNumber,
    data: c.data,
    claimant_name: c.name,
    claim_number: null,
    claim_date: c.from,
    amount: c.total,
    status,
    notes: c.note,
    file_name: "مطالبات (4).xlsx",
    pdf_url: null,
    payment_status: paymentStatus,
    total_amount: c.total,
    paid_amount: paid,
    remaining_amount: remaining,
    started_at: isProgress && c.from ? `${c.from}T00:00:00Z` : null,
    settled_at: null,
    settlement_reason: null,
    settlement_notes: null,
    installments,
  });
}

// validations
const totalClaims = finalClaims.length;
const totalAmount = round2(finalClaims.reduce((a, c) => a + c.total_amount, 0));
const totalPaid = round2(finalClaims.reduce((a, c) => a + c.paid_amount, 0));
const totalRemaining = round2(finalClaims.reduce((a, c) => a + c.remaining_amount, 0));
const totalInst = finalClaims.reduce((a, c) => a + c.installments.length, 0);
const dupKeys = Object.entries(finalClaims.reduce((m, c) => { const k = `${c.sheet_name}||${c.row_number}`; m[k] = (m[k] || 0) + 1; return m; }, {})).filter(([, n]) => n > 1);
const amountsOk = finalClaims.every(c => Math.abs(c.total_amount - c.paid_amount - c.remaining_amount) < 0.02);
const instSumOk = finalClaims.every(c => {
  if (!c.installments.length) return true;
  const s = round2(c.installments.reduce((a, i) => a + i.amount, 0));
  return Math.abs(s - c.total_amount) < 0.02;
});

console.log("\n=== FINAL ===");
console.log({ totalClaims, totalAmount, totalPaid, totalRemaining, totalInst, dupKeys: dupKeys.length, amountsOk, instSumOk });
console.log("issues:", issues.length);
for (const i of issues) console.log(" -", i);

fs.writeFileSync("scripts/claims-replace/import-plan.json", JSON.stringify({ source: SRC, generatedAt: new Date().toISOString(), summary: { totalClaims, totalAmount, totalPaid, totalRemaining, totalInst, sheetStats, issues }, claims: finalClaims }, null, 2), "utf8");
console.log("wrote import-plan.json");
