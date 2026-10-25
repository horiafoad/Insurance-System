import * as XLSX from "xlsx";
import {
  PAYMENT_STATUS,
  normalizePaymentStatus,
  parseNumeric,
} from "./claimParsing";

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const asText = (value) => String(value ?? "").trim();
const isInstallmentLabel = (value) => /^ق\s*\d+$/.test(asText(value));
const isRemainingLabel = (value) => /متبق/.test(asText(value));
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const pad2 = (value) => String(value).padStart(2, "0");

/**
 * يحوّل قيمة خلية تاريخ إلى YYYY-MM-DD، ويرجع null لو تعذّر التعرف عليها.
 * يدعم تواريخ Excel الرقمية والنصوص بصيغة YYYY-MM-DD أو D/M/YYYY أو D\M\YYYY.
 */
export function toIsoDate(value) {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(
      value.getDate()
    )}`;
  }

  if (isNumber(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y) {
      return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
    }
    return null;
  }

  const text = asText(value);
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const loose = text.match(/^(\d{1,2})[/\\.-](\d{1,2})[/\\.-](\d{2,4})$/);
  if (loose) {
    const first = Number(loose[1]);
    const second = Number(loose[2]);
    let year = Number(loose[3]);
    if (year < 100) year += year > 50 ? 1900 : 2000;

    const separator = text.match(/[/\\.-]/)[0];
    let day;
    let month;
    // الشرطة المائلة العكسية أو رقم أول أكبر من 12 يعني أن الترتيب يوم/شهر.
    if (separator === "\\" || first > 12) {
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  return null;
}

function buildClaimFromRow(sheetName, rowNumber, cells, headers) {
  const sheet = asText(sheetName);
  const serial = cells[0] ?? "";
  const name = asText(cells[1]);
  const total = round2(Number(cells[2]));
  const fromDate = toIsoDate(cells[3]);
  const toDate = toIsoDate(cells[4]);
  const department = asText(cells[5]);
  const sheetStatus = asText(cells[6]);
  const note = asText(cells[7]);

  const data = {};
  data["م"] = serial;
  data["الاسم"] = name;

  if (sheet === "بدون وجه حق") {
    data["المبلغ"] = total;
    data["من"] = fromDate ?? asText(cells[3]);
    data["الى"] = toDate ?? asText(cells[4]);
  } else {
    data["مبلغ مطلوب"] = total;
    data["مدة من "] = fromDate ?? asText(cells[3]);
    data["حتى تاريخ"] = toDate ?? asText(cells[4]);
    data["القسم"] = department;
    data["حالة السداد"] = sheetStatus || sheet;
    if (sheet === "خالي الطرف" && note) data["ملاحظات"] = note;
  }

  return {
    sheet_name: sheet,
    row_number: rowNumber,
    data,
    claimant_name: name,
    claim_number: null,
    amount: total,
    status: "جديدة",
    notes: note || null,
    file_name: headers.fileName,
    total_amount: total,
    started_at: null,
    from_date: fromDate,
    raw_installments: [],
    remaining: null,
    issues: [],
  };
}

function finalizeClaim(claim) {
  const sheet = claim.sheet_name;
  const total = claim.total_amount;
  const paidRows = claim.raw_installments.filter(
    (inst) => isNumber(inst.amount) && inst.amount > 0
  );
  const paidFromRows = round2(
    paidRows.reduce((sum, inst) => sum + inst.amount, 0)
  );

  let paymentStatus = null;
  let paid = 0;
  let remaining = total;
  let installments = [];

  if (sheet === "خالي الطرف") {
    paymentStatus = PAYMENT_STATUS.SETTLED;
    paid = total;
    remaining = 0;
  } else if (sheet === "لم يسدد") {
    paymentStatus = PAYMENT_STATUS.NOT_PAID;
    paid = 0;
    remaining = total;
  } else if (sheet === "جاري السداد") {
    paymentStatus = PAYMENT_STATUS.IN_PROGRESS;

    if (paidRows.length > 0) {
      paid = paidFromRows;
      const excelRemaining = claim.remaining;
      remaining = round2(Math.max(0, total - paid));

      if (
        excelRemaining !== null &&
        Math.abs(total - paid - excelRemaining) > 1
      ) {
        claim.issues.push(
          `المتبقي في الملف (${excelRemaining}) لا يطابق الإجمالي - المدفوع (${remaining}); تم اعتماد الإجمالي - المدفوع.`
        );
      }

      installments = paidRows.map((inst) => ({
        number: inst.number,
        amount: inst.amount,
        paid: true,
        paid_at: inst.paidAt,
        receipt_number: inst.receipt,
      }));

      if (remaining > 0) {
        const used = new Set(installments.map((inst) => inst.number));
        let next = 1;
        while (next <= 4 && used.has(next)) next += 1;
        if (next <= 4) {
          installments.push({
            number: next,
            amount: remaining,
            paid: false,
            paid_at: null,
            receipt_number: null,
          });
        } else {
          claim.issues.push(
            "لا توجد خانة قسط متاحة للمبلغ المتبقي (الحد الأقصى 4 أقساط)."
          );
        }
      }
    } else if (claim.remaining !== null) {
      // لا توجد تفاصيل أقساط في الملف: نعتمد الإجمالي والمتبقي كما هما.
      remaining = round2(claim.remaining);
      paid = round2(Math.max(0, total - remaining));
      claim.issues.push(
        "لا توجد تفاصيل أقساط في الملف; سيتم حفظ الإجمالي والمتبقي فقط."
      );
    } else {
      paid = 0;
      remaining = total;
    }

    claim.data["مبلغ متبقى"] = remaining;
    for (let n = 1; n <= 4; n += 1) {
      const paidInst = paidRows.find((inst) => inst.number === n);
      claim.data[`ق ${n}`] = paidInst ? paidInst.amount : "";
    }
  } else {
    // بدون وجه حق أو أي ورقة أخرى: لا يوجد سداد.
    paymentStatus = normalizePaymentStatus(claim.data?.["حالة السداد"]);
    paid = 0;
    remaining = total;
  }

  return {
    sheet_name: claim.sheet_name,
    row_number: claim.row_number,
    data: claim.data,
    claimant_name: claim.claimant_name,
    claim_number: claim.claim_number,
    amount: total,
    status: claim.status,
    notes: claim.notes,
    file_name: claim.file_name,
    pdf_url: null,
    payment_status: paymentStatus,
    total_amount: total,
    paid_amount: paid,
    remaining_amount: remaining,
    started_at: claim.started_at,
    installments,
    issues: claim.issues,
  };
}

function parseSheetWithMergedInstallments(sheetName, worksheet, fileName) {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  });

  const claims = [];
  let current = null;
  let awaitingRemainingValue = false;

  rows.forEach((cells, index) => {
    const rowNumber = index + 1;
    const name = asText(cells?.[1]);
    const amount = cells?.[2];

    if (name === "الاسم") {
      current = null;
      awaitingRemainingValue = false;
      return;
    }

    // صف مطالبة رئيسي: اسم + مبلغ موجب.
    if (!isInstallmentLabel(name) && name !== "" && isNumber(amount) && amount > 0) {
      current = buildClaimFromRow(
        sheetName,
        rowNumber,
        cells,
        { fileName }
      );
      claims.push(current);
      awaitingRemainingValue = false;
      return;
    }

    if (!current) return;

    if (isRemainingLabel(amount)) {
      awaitingRemainingValue = true;
      const inlineValue = cells?.[1];
      if (isNumber(inlineValue)) {
        current.remaining = round2(Math.abs(inlineValue));
        awaitingRemainingValue = false;
      }
      return;
    }

    if (awaitingRemainingValue && name === "" && isNumber(amount)) {
      current.remaining = round2(Math.abs(amount));
      awaitingRemainingValue = false;
      return;
    }

    if (isInstallmentLabel(name)) {
      const number = Number(name.match(/\d+/)[0]);
      current.raw_installments.push({
        number,
        amount: isNumber(amount) ? round2(amount) : null,
        paidAt: toIsoDate(cells?.[3]),
        receipt: asText(cells?.[4]) || null,
      });
      return;
    }

    if (name === "" && isNumber(amount)) {
      current.remaining = round2(Math.abs(amount));
    }
  });

  return claims;
}

function parseSheetAsFlatRows(sheetName, worksheet, fileName) {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
    raw: false,
  });

  return rows
    .map((row, index) => {
      const claimantName =
        asText(row?.["الاسم"]) ||
        asText(row?.["اسم صاحب المطالبة"]) ||
        asText(row?.["اسم المطالبة"]);
      const claimNumber = asText(
        row?.["رقم المطالبة"] || row?.["رقم المطالبه"] || row?.["claimNumber"]
      );
      const total = round2(
        parseNumeric(
          row?.["مبلغ مطلوب"] ??
            row?.["المبلغ"] ??
            row?.["amount"] ??
            row?.["total_amount"]
        )
      );

      if (!claimantName && !total) return null;

      return {
        sheet_name: sheetName,
        row_number: index + 2,
        data: row,
        claimant_name: claimantName || null,
        claim_number: claimNumber || null,
        amount: total,
        status: "جديدة",
        notes: null,
        file_name: fileName,
        total_amount: total,
        started_at: null,
        from_date: null,
        raw_installments: [],
        remaining: null,
        issues: [],
      };
    })
    .filter(Boolean);
}

/**
 * يقرأ ملف Excel كامل ويعيد سجلات المطالبات بعد دمج صفوف الأقساط والمتبقي
 * داخل المطالبة الرئيسية.
 */
export function parseClaimsWorkbook(workbook, fileName) {
  const claims = [];
  const sheets = [];
  const issues = [];

  (workbook?.SheetNames || []).forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;
    sheets.push(sheetName);

    let sheetClaims = parseSheetWithMergedInstallments(
      sheetName,
      worksheet,
      fileName
    );

    // ملفات قديمة بصيغة مسطحة (كل صف مطالبة مستقلة) - نستخدم القراءة المباشرة.
    if (sheetClaims.length === 0) {
      sheetClaims = parseSheetAsFlatRows(sheetName, worksheet, fileName);
    }

    sheetClaims.forEach((claim) => {
      const finalClaim = finalizeClaim(claim);
      claims.push(finalClaim);
      finalClaim.issues.forEach((message) => {
        issues.push({
          sheet_name: finalClaim.sheet_name,
          row_number: finalClaim.row_number,
          claimant_name: finalClaim.claimant_name,
          message,
        });
      });
    });
  });

  return { claims, sheets, issues };
}
