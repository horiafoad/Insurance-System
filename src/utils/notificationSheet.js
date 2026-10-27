/* ------------------------------------------------------------------
   notificationSheet.js
   قراءة شيتات Excel/CSV واختيار الأعضاء منها لربطهم بفهرس التبليغات
   وبالأرشيف الذكي عبر رقم الصرف/رقم الكمبيوتر.

   لماذا وحدة منفصلة؟
   - نفس المنطق يُستخدم في نموذج التبليغ (اختيار عضو) وفي فهرس الأعضاء
     (استيراد الشيت كاملًا).
   - تنظيف الأسماء العربية (بعض الشيتات القديمة تخزّن الحروف في صورتها
     العرضية) وتحويل الأرقام العربية إلى إنجليزية قبل المطابقة.
------------------------------------------------------------------ */

import * as XLSX from "xlsx";

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;
const INVISIBLE_MARKS = /[\u200B-\u200F\u202A-\u202E\uFEFF]/g;

/** تنظيف النص العربي: توحيد الصور العرضية وإزالة التشكيل والتطويل. */
export function cleanArabicText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(TATWEEL, "")
    .replace(ARABIC_DIACRITICS, "")
    .replace(INVISIBLE_MARKS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** تحويل الأرقام العربية/الفارسية إلى أرقام إنجليزية. */
export function normalizeDigits(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (digit) =>
      String(ARABIC_INDIC_DIGITS.indexOf(digit))
    )
    .replace(/[۰-۹]/g, (digit) =>
      String(EXTENDED_ARABIC_DIGITS.indexOf(digit))
    );
}

/** توحيد رقم العضو/الصرف مع الحفاظ على الشكل الكامل 037421-30300104. */
export function normalizeMemberNumber(value) {
  return normalizeDigits(value)
    .replace(INVISIBLE_MARKS, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "")
    .trim();
}

/** مفتاح بحث عربي: توحيد الألف والياء والتاء المربوطة. */
export function normalizeArabicForSearch(value) {
  return cleanArabicText(value)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

const HEADER_HINTS = [
  "الاسم",
  "اسم",
  "رقم",
  "الوظيف",
  "الوظيفة",
  "الدرجة",
  "الدرجه",
  "المجموع",
  "المجموعة",
  "المجموعه",
  "الإدارة",
  "الادارة",
  "القسم",
  "القطاع",
  "الصرف",
  "الكمبيوتر",
  "العامل",
  "المتعاقد",
  "المسمى",
];

/** اختيار صف العناوين تلقائيًا (بعض الشيتات تبدأ بصفوف تمهيدية). */
export function detectHeaderRow(rows) {
  let best = { index: 0, score: -1 };
  const limit = Math.min(rows.length, 20);

  for (let index = 0; index < limit; index += 1) {
    const row = rows[index] || [];
    let score = 0;

    row.forEach((cell) => {
      const text = cleanArabicText(cell);
      if (!text) return;
      if (HEADER_HINTS.some((hint) => text.includes(hint))) score += 1;
      if (
        [
          "الاسم",
          "رقم الصرف",
          "الوظيفه",
          "الوظيفة",
          "اسم المجموعه",
          "اسم المجموعة",
        ].includes(text)
      ) {
        score += 2;
      }
    });

    if (score > best.score) best = { index, score };
  }

  return best.score > 0 ? best.index : 0;
}

function columnScore(header, kind) {
  const text = cleanArabicText(header);
  const compact = text.replace(/\s+/g, "");
  if (!compact) return -1;

  if (kind === "name") {
    if (compact.includes("مجموع")) return -1;
    if (compact === "الاسم") return 100;
    if (compact.startsWith("اسم")) return 80;
    if (compact.includes("اسم")) return 60;
    return -1;
  }

  if (kind === "number") {
    if (compact.includes("مجموع")) return -1;
    if (compact.includes("رقمالصرف")) return 100;
    if (compact.includes("رقمالكمبيوتر")) return 95;
    if (compact.includes("رقمالعامل")) return 95;
    if (compact.includes("رقمالعضو")) return 90;
    if (compact.includes("رقم")) return 50;
    return -1;
  }

  if (kind === "job") {
    if (compact.includes("الوظيف")) return 100;
    if (compact.includes("المسمى")) return 90;
    if (compact === "الدرجة" || compact === "الدرجه") return 30;
    return -1;
  }

  if (kind === "department") {
    if (compact.includes("مجموع")) return 100;
    if (
      compact.includes("الادارة") ||
      compact.includes("الإدارة") ||
      compact.includes("القسم") ||
      compact.includes("القطاع")
    ) {
      return 80;
    }
    return -1;
  }

  return -1;
}

function pickColumn(headers, kind) {
  let best = -1;
  let bestScore = 0;

  (headers || []).forEach((header, index) => {
    const score = columnScore(header, kind);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });

  return best;
}

/** اكتشاف أعمدة الاسم والرقم والوظيفة والمجموعة تلقائيًا. */
export function detectColumnMapping(headers) {
  const mapping = {
    name: pickColumn(headers, "name"),
    number: pickColumn(headers, "number"),
    job: pickColumn(headers, "job"),
    department: pickColumn(headers, "department"),
  };

  /* منع استخدام نفس العمود لأكثر من معنى. */
  if (mapping.number === mapping.name) mapping.number = -1;
  if (mapping.job === mapping.name || mapping.job === mapping.number) {
    mapping.job = -1;
  }
  if (
    mapping.department === mapping.name ||
    mapping.department === mapping.number ||
    mapping.department === mapping.job
  ) {
    mapping.department = -1;
  }

  return mapping;
}

/* أعمدة المبالغ (أجور/إجمالي/خصم...) تُحفظ مع العضو لعرضها في الفهرس،
   مع استثناء أعمدة الهوية والتواريخ حتى لا تُقرأ بالخطأ كمبالغ. */
const AMOUNT_HEADER_PATTERN =
  /(اجور|أجور|اجمال|إجمال|مبلغ|قيمة|خصم|بدل|حافز|مكافا|راتب|مرتب|صافي|استحقاق)/;
const AMOUNT_HEADER_EXCLUDE =
  /(رقم|كود|اسم|الوظيف|المسمى|الادارة|الإدارة|القسم|القطاع|تاريخ|ملاحظ|بيان)/;

/** استخراج أعمدة المبالغ من صف العناوين (بحد أقصى 8 أعمدة). */
export function extractAmountColumns(headers) {
  return (headers || [])
    .map((header, index) => ({ index, label: cleanArabicText(header) }))
    .filter(({ label }) => {
      const compact = label.replace(/\s+/g, "");
      if (!compact) return false;
      if (AMOUNT_HEADER_EXCLUDE.test(compact)) return false;
      return AMOUNT_HEADER_PATTERN.test(compact);
    })
    .slice(0, 8);
}

/** إزالة تكرار آخر جزء في رقم الصرف: 000003-30300104-30300104 → 000003-30300104 */
export function collapseRepeatedNumberSuffix(value) {
  const number = normalizeMemberNumber(value);
  const match = number.match(/^(.+)-([0-9]+)-([0-9]+)$/);
  if (!match) return number;
  return match[2] === match[3] ? `${match[1]}-${match[2]}` : number;
}

/** بناء قائمة الأعضاء من صفوف الشيت وفق الأعمدة المختارة. */
export function buildSheetRecords(rows, headerIndex, mapping) {
  if (!mapping || mapping.name < 0) return [];

  const headerName = cleanArabicText(rows[headerIndex]?.[mapping.name]);
  const amountColumns = extractAmountColumns(rows[headerIndex]).filter(
    (column) => column.index !== mapping.name && column.index !== mapping.number
  );

  const candidates = [];

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const full_name = cleanArabicText(row[mapping.name]);
    if (!full_name || full_name === headerName) continue;

    const rawId =
      mapping.number >= 0 ? normalizeMemberNumber(row[mapping.number]) : "";
    const job_title =
      mapping.job >= 0 ? cleanArabicText(row[mapping.job]) : "";
    const departmentRaw =
      mapping.department >= 0 ? cleanArabicText(row[mapping.department]) : "";

    /* تجاهل أكواد المجموعات الرقمية مثل -992 حتى لا تظهر كإدارة/قسم. */
    const department = /[A-Za-z\u0600-\u06FF]/.test(departmentRaw)
      ? departmentRaw
      : "";

    const amounts = {};
    amountColumns.forEach(({ index: columnIndex, label }) => {
      const value = String(row[columnIndex] ?? "").trim();
      if (value) amounts[label] = value;
    });

    candidates.push({
      full_name,
      rawId,
      collapsedId: collapseRepeatedNumberSuffix(rawId),
      job_title,
      department,
      amounts,
      rowNumber: index + 1,
    });
  }

  /* تنظيف الأرقام المكررة آخرها آمن فقط لو الناتج فريد؛ لو رقمين مختلفين
     يتطابقان بعد التنظيف (شخصان بنفس الرقم في الشيت) نُبقي كل رقم كما هو. */
  const collapsedCounts = new Map();
  candidates.forEach(({ collapsedId }) => {
    if (!collapsedId) return;
    collapsedCounts.set(collapsedId, (collapsedCounts.get(collapsedId) || 0) + 1);
  });

  const records = [];
  const seen = new Set();

  candidates.forEach((candidate) => {
    const external_id =
      candidate.collapsedId &&
      collapsedCounts.get(candidate.collapsedId) === 1
        ? candidate.collapsedId
        : candidate.rawId;

    const key = external_id
      ? `number:${external_id}`
      : `name:${normalizeArabicForSearch(candidate.full_name)}`;
    if (seen.has(key)) return;
    seen.add(key);

    records.push({
      full_name: candidate.full_name,
      external_id,
      job_title: candidate.job_title,
      department: candidate.department,
      amounts: candidate.amounts,
      rowNumber: candidate.rowNumber,
    });
  });

  return records;
}

/**
 * قراءة ملف Excel/CSV وإرجاع:
 * { fileName, sheetName, rows, headerIndex, headers, mapping, records }
 */
export async function parseNotificationSheet(file) {
  if (!file) throw new Error("لم يتم اختيار ملف.");

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  if (!workbook.SheetNames.length) {
    throw new Error("الملف لا يحتوي على أي ورقة عمل.");
  }

  let best = null;
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const nonEmpty = rows.filter((row) =>
      (row || []).some((cell) => String(cell ?? "").trim())
    ).length;
    if (!best || nonEmpty > best.nonEmpty) {
      best = { sheetName, sheet, rows, nonEmpty };
    }
  });

  if (!best || best.nonEmpty === 0) {
    throw new Error("الملف فارغ أو لا يحتوي على بيانات قابلة للقراءة.");
  }

  const headerIndex = detectHeaderRow(best.rows);
  const headers = best.rows[headerIndex] || [];
  const mapping = detectColumnMapping(headers);
  const records = buildSheetRecords(best.rows, headerIndex, mapping);

  /* المبالغ تُقرأ من القيم الخام (raw) حتى لا تفقد كسورها عند الجمع،
     بينما تظل الأسماء والأرقام مقروءة كنص للحفاظ على الأصفار البادئة. */
  const amountColumns = extractAmountColumns(headers).filter(
    (column) => column.index !== mapping.name && column.index !== mapping.number
  );
  if (amountColumns.length) {
    const rawRows = XLSX.utils.sheet_to_json(best.sheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    records.forEach((record) => {
      const rawRow = rawRows[record.rowNumber - 1] || [];
      const amounts = {};
      amountColumns.forEach(({ index, label }) => {
        const rawValue = rawRow[index];
        const text = String(rawValue ?? "").trim();
        if (!text) return;
        const num =
          typeof rawValue === "number"
            ? rawValue
            : Number(text.replace(/[^\d.-]/g, ""));
        amounts[label] = Number.isFinite(num) ? num : text;
      });
      if (Object.keys(amounts).length) record.amounts = amounts;
    });
  }

  return {
    fileName: file.name,
    sheetName: best.sheetName,
    rows: best.rows,
    headerIndex,
    headers,
    mapping,
    records,
  };
}
