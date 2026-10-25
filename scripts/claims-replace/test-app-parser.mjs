import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseClaimsWorkbook } from "../../src/services/claimsExcelImport.js";

const buf = fs.readFileSync("C:/Users/DELL/Downloads/مطالبات (4).xlsx");
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
const { claims, sheets, issues } = parseClaimsWorkbook(wb, "مطالبات (4).xlsx");
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const perSheet = {};
for (const c of claims) perSheet[c.sheet_name] = (perSheet[c.sheet_name] || 0) + 1;
const totals = {
  claims: claims.length,
  total: round2(claims.reduce((a, c) => a + c.total_amount, 0)),
  paid: round2(claims.reduce((a, c) => a + c.paid_amount, 0)),
  remaining: round2(claims.reduce((a, c) => a + c.remaining_amount, 0)),
  installments: claims.reduce((a, c) => a + c.installments.length, 0),
  issues: issues.length,
};
const badBalance = claims.filter(c => Math.abs(c.total_amount - c.paid_amount - c.remaining_amount) > 0.02);
const badInst = claims.filter(c => c.installments.length && Math.abs(round2(c.installments.reduce((a, i) => a + i.amount, 0)) - c.total_amount) > 0.02);
const dup = claims.length !== new Set(claims.map(c => `${c.sheet_name}||${c.row_number}`)).size;
const r87 = claims.find(c => c.sheet_name === "جاري السداد" && c.row_number === 87);
const r99 = claims.find(c => c.sheet_name === "جاري السداد" && c.row_number === 99);
const r113 = claims.find(c => c.sheet_name === "خالي الطرف" && c.row_number === 113);
const r45 = claims.find(c => c.sheet_name === "جاري السداد" && c.row_number === 45);
const emptyNames = claims.filter(c => !c.claimant_name).length;
console.log(JSON.stringify({
  sheets, perSheet, totals,
  badBalance: badBalance.map(c => [c.sheet_name, c.row_number, c.claimant_name]),
  badInst: badInst.map(c => [c.sheet_name, c.row_number, c.total_amount, c.installments.reduce((a,i)=>a+i.amount,0)]),
  duplicates: dup, emptyNames,
  r87: { total: r87.total_amount, paid: r87.paid_amount, remaining: r87.remaining_amount, inst: r87.installments, issues: r87.issues },
  r99: { total: r99.total_amount, paid: r99.paid_amount, remaining: r99.remaining_amount, inst: r99.installments, issues: r99.issues },
  r113: { from: r113.data["مدة من "], total: r113.total_amount },
  r45: { inst: r45.installments },
}, null, 2));
