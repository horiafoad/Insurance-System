import * as XLSX from "xlsx";
import { normalizeDigits, normalizeMemberCode } from "../utils/arabicText";

// الإصدار v2: تغيير المفتاح يتجاهل أي نسخة قديمة محفوظة على الأجهزة (كانت
// تعرض 71 صفًا بعد تفريغ قاعدة البيانات)، فتبقى قاعدة البيانات هي المصدر.
export const STUDY_LEAVES_STORAGE_KEY = "entitlements_study_leaves_v2";

/**
 * ملاحظة مهمة:
 * البيانات صارت تُحفظ في جدول study_leaves داخل Supabase (انظر
 * services/studyLeavesService.js). هذا الملف مسؤول عن التحليل والتنسيق فقط،
 * مع الإبقاء على localStorage كنسخة احتياطية/وضع عمل بلا اتصال.
 */

export const LEAVE_FIELDS = [
  { key: "serial", label: "م" },
  { key: "employeeCode", label: "كود الموظف" },
  { key: "name", label: "الاسم" },
  { key: "jobTitle", label: "الوظيفه" },
  { key: "grade", label: "الدرجة" },
  { key: "leavePayType", label: "نوع الإجازة" },
  { key: "orderNumber", label: "رقم الأمر التنفيذي" },
  { key: "orderDate", label: "تاريخ الأمر التنفيذي" },
  { key: "orderNote", label: "ملاحظة الأمر التنفيذي" },
  { key: "leaveKind", label: "البيان" },
  { key: "startDate", label: "بداية الإجازة" },
  { key: "endDate", label: "نهاية الإجازة" },
  { key: "fiveYearEnd", label: "انتهاء 5 سنوات" },
  { key: "remainingDays", label: "الأيام المتبقية" },
  { key: "salaryStatus", label: "حالة المرتب" },
  { key: "returnedToWork", label: "عاد للعمل؟" },
  { key: "endReason", label: "سبب انتهاء الخدمة" },
  { key: "claimMade", label: "تم عمل مطالبة؟" },
  { key: "notes", label: "ملاحظات" },
];

export const SALARY_STATUSES = [
  "يصرف المرتب",
  "يوقف المرتب",
  "بدون مرتب",
];

export const LEAVE_KINDS = ["اجازة دراسية", "اجازه دراسيه", "مهمه علميه"];

export const LEAVE_PAY_TYPES = ["يصرف بمرتب", "بدون مرتب"];

export const DATE_FIELDS = ["orderDate", "startDate", "endDate", "fiveYearEnd"];

/**
 * الأعمدة المدعومة في ملف Excel.
 * أي عمود غير موجود هنا يُعرض للمستخدم في معاينة الاستيراد ولا يُهمَل بصمت.
 */
export const HEADER_ALIASES = {
  م: "serial",
  "كود الموظف": "employeeCode",
  "كود الموظف ": "employeeCode",
  الاسم: "name",
  الوظيفه: "jobTitle",
  الوظيفة: "jobTitle",
  الدرجة: "grade",
  "نوع الإجازة": "leavePayType",
  "نوع الاجازة": "leavePayType",
  "رقم الأمر التنفيذي": "orderNumber",
  "رقم الامر التنفيذي": "orderNumber",
  "تاريخ الأمر التنفيذي": "orderDate",
  "تاريخ الامر التنفيذي": "orderDate",
  "تاريخ الأمر التنفيذي2": "orderNote",
  "تاريخ الامر التنفيذي2": "orderNote",
  البيان: "leaveKind",
  "بداية الإجازة": "startDate",
  "بداية الاجازة": "startDate",
  "نهاية الإجازة": "endDate",
  "نهاية الاجازة": "endDate",
  "انتهاء 5 سنوات": "fiveYearEnd",
  "الأيام المتبقية": "remainingDays",
  "الايام المتبقية": "remainingDays",
  "حالة المرتب": "salaryStatus",
  "عاد للعمل؟": "returnedToWork",
  "عاد للعمل": "returnedToWork",
  "سبب انتهاء الخدمة": "endReason",
  "تم عمل مطالبة؟": "claimMade",
  "تم عمل مطالبة": "claimMade",
  ملاحظات: "notes",
};

/** الحقول التي لا يجوز أن تُخترع قيمتها إذا كانت فارغة في الملف. */
const IMPORTANT_FIELDS = [
  { key: "employeeCode", label: "كود الموظف" },
  { key: "startDate", label: "بداية الإجازة" },
  { key: "endDate", label: "نهاية الإجازة" },
  { key: "fiveYearEnd", label: "انتهاء 5 سنوات" },
  { key: "orderNumber", label: "رقم الأمر التنفيذي" },
];

export function createEmptyLeave() {
  return {
    id: "",
    serial: "",
    employeeCode: "",
    name: "",
    jobTitle: "",
    grade: "",
    leavePayType: "",
    orderNumber: "",
    orderDate: "",
    orderNote: "",
    leaveKind: "",
    startDate: "",
    endDate: "",
    fiveYearEnd: "",
    remainingDays: "",
    salaryStatus: "",
    returnedToWork: "",
    endReason: "",
    claimMade: "",
    notes: "",
  };
}

/* -------------------------------------------------------------------------- */
/* أدوات تحويل القيم                                                          */
/* -------------------------------------------------------------------------- */

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseFlexibleDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return startOfDay(value);
  }

  const text = normalizeDigits(value).trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (year < 1950 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return startOfDay(new Date(year, month - 1, day));
  }

  const us = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (us) {
    let year = Number(us[3]);
    if (year < 100) year += 2000;
    if (year < 1950) return null;
    const month = Number(us[2]);
    const day = Number(us[1]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return startOfDay(new Date(year, month - 1, day));
  }

  return null;
}

/**
 * يحوّل خلية تاريخ Excel إلى YYYY-MM-DD.
 * يتجاهل تواريخ Excel غير الصالحة (مثل 1904 الناتجة عن خلية فارغة بصيغة تاريخ).
 */
export function excelDateToIso(value) {
  if (value == null || value === "") return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    if (year < 1950) return "";
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || !parsed.y || parsed.y < 1950) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(
      parsed.d
    ).padStart(2, "0")}`;
  }

  const date = parseFlexibleDate(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function toIsoDate(value) {
  const iso = excelDateToIso(value);
  if (iso) return iso;
  if (value instanceof Date) return "";
  return value ? normalizeDigits(value).trim() : "";
}

export function formatDisplayDate(value) {
  const iso = toIsoDate(value);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** نص نظيف مع تحويل الأرقام العربية، بلا أي تغيير في القيمة الرقمية. */
export function textOf(value) {
  if (value == null) return "";
  if (value instanceof Date) return excelDateToIso(value);
  return normalizeDigits(String(value)).replace(/\s+/g, " ").trim();
}

export function daysUntil(value, today = new Date()) {
  const date = parseFlexibleDate(value);
  if (!date) return null;
  const diff = startOfDay(date) - startOfDay(today);
  return Math.round(diff / 86400000);
}

export function computeRemainingDays(leave, today = new Date()) {
  const fiveYearDays = daysUntil(leave.fiveYearEnd, today);
  if (fiveYearDays != null) return fiveYearDays;
  return daysUntil(leave.endDate, today);
}

/* -------------------------------------------------------------------------- */
/* حالة المرتب                                                                */
/* -------------------------------------------------------------------------- */

/**
 * توحيد نص حالة المرتب القادم من الملف إلى إحدى الحالات القياسية.
 * لا نكتب أي قيمة من عندنا: النص الفارغ يبقى فارغًا.
 */
export function normalizeSalaryStatus(value) {
  const text = textOf(value);
  if (!text) return "";
  if (text.includes("بدون")) return "بدون مرتب";
  if (text.includes("يوقف") || text.includes("يقف") || text.includes("موقوف")) {
    return "يوقف المرتب";
  }
  if (text.includes("يصرف")) return "يصرف المرتب";
  return text;
}

export function isSalaryPaying(leave) {
  return normalizeSalaryStatus(leave?.salaryStatus) === "يصرف المرتب";
}

export function isSalaryStopped(leave) {
  const status = normalizeSalaryStatus(leave?.salaryStatus);
  return status === "يوقف المرتب" || status === "بدون مرتب";
}

export function isSalaryUnset(leave) {
  return !normalizeSalaryStatus(leave?.salaryStatus);
}

export function enrichLeave(leave, today = new Date()) {
  const remaining = computeRemainingDays(leave, today);
  const daysToEnd = daysUntil(leave.endDate, today);
  const daysToFive = daysUntil(leave.fiveYearEnd, today);
  const fiveYearsEnded = daysToFive != null && daysToFive < 0;

  let alertLevel = "ok";
  let alertTitle = "المرتب مستمر";
  let alertMessage = "لا يوجد إجراء عاجل على المرتب.";

  if (isSalaryStopped(leave)) {
    alertLevel = "stopped";
    alertTitle = "المرتب موقوف";
    alertMessage = "تم تسجيل إيقاف المرتب. راجعي التنفيذ على شيت المرتبات.";
  } else if (isSalaryUnset(leave)) {
    alertLevel = "unset";
    alertTitle = "حالة المرتب غير محددة";
    alertMessage = "الملف لم يحدد حالة المرتب لهذا السجل — تحتاج مراجعة يدوية.";
  } else if (fiveYearsEnded) {
    alertLevel = "stop_now";
    alertTitle = "يجب إيقاف المرتب الآن";
    alertMessage =
      "تجاوزت بداية الإجازة خمس سنوات من تاريخ بداية الإجازة. المرتب يقف.";
  } else if (
    (daysToFive != null && daysToFive <= 30) ||
    (remaining != null && remaining <= 30)
  ) {
    alertLevel = "soon";
    alertTitle = "إنذار: المرتب قرب يقف";
    alertMessage = `باقي ${Math.min(
      ...[daysToFive, remaining].filter((n) => n != null)
    )} يوم. جهّزي إيقاف المرتب.`;
  } else if (
    (daysToFive != null && daysToFive <= 90) ||
    (remaining != null && remaining <= 90)
  ) {
    alertLevel = "watch";
    alertTitle = "تنبيه: اقترب موعد الإيقاف";
    alertMessage = `باقي أقل من 90 يومًا على نهاية الخمس سنوات.`;
  }

  return {
    ...leave,
    remainingDays: remaining == null ? leave.remainingDays || "" : String(remaining),
    daysToEnd,
    daysToFive,
    alertLevel,
    alertTitle,
    alertMessage,
  };
}

export function getLeaveStats(leaves, today = new Date()) {
  const enriched = leaves.map((leave) => enrichLeave(leave, today));
  return {
    total: enriched.length,
    paying: enriched.filter((leave) => isSalaryPaying(leave)).length,
    stopped: enriched.filter((leave) => isSalaryStopped(leave)).length,
    unpaid: enriched.filter(
      (leave) => normalizeSalaryStatus(leave.salaryStatus) === "بدون مرتب"
    ).length,
    unset: enriched.filter((leave) => isSalaryUnset(leave)).length,
    stopNow: enriched.filter((leave) => leave.alertLevel === "stop_now").length,
    soon: enriched.filter((leave) => leave.alertLevel === "soon").length,
    watch: enriched.filter((leave) => leave.alertLevel === "watch").length,
  };
}

export function getAlertLeaves(leaves, today = new Date()) {
  return leaves
    .map((leave) => enrichLeave(leave, today))
    .filter((leave) =>
      ["stop_now", "soon", "watch", "stopped"].includes(leave.alertLevel)
    )
    .sort((a, b) => {
      const order = { stop_now: 0, soon: 1, watch: 2, stopped: 3 };
      return order[a.alertLevel] - order[b.alertLevel];
    });
}

/* -------------------------------------------------------------------------- */
/* تحليل ملف Excel                                                            */
/* -------------------------------------------------------------------------- */

function normalizeImportedRow(rawRow, index) {
  const leave = createEmptyLeave();
  const raw = {};

  Object.entries(rawRow || {}).forEach(([rawKey, value]) => {
    const header = textOf(rawKey);
    const key = HEADER_ALIASES[header];
    if (!key) {
      if (header) raw[header] = textOf(value);
      return;
    }
    raw[header] = value instanceof Date ? excelDateToIso(value) : textOf(value);
    if (DATE_FIELDS.includes(key)) {
      leave[key] = excelDateToIso(value);
      return;
    }
    leave[key] = textOf(value);
  });

  leave.serial = textOf(leave.serial) || String(index + 1);
  leave.employeeCode = normalizeMemberCode(leave.employeeCode);
  // رقم الأمر قد يكون نصًا مثل «محتاجين أمر تنفيذي» — نحافظ عليه كما هو.
  leave.orderNumber = textOf(leave.orderNumber);
  leave.salaryStatus = normalizeSalaryStatus(leave.salaryStatus);
  leave.data = raw;

  return leave;
}

function pickSheet(workbook) {
  return (
    workbook.SheetNames.find((name) => String(name).includes("اجاز")) ||
    workbook.SheetNames.find(
      (name) => name !== "Dashborad" && name !== "الاعدادات"
    ) ||
    workbook.SheetNames[0]
  );
}

/**
 * تحليل كامل لملف الإجازات: يعيد السجلات + تقريرًا للمعاينة
 * (أعمدة غير مدعومة/ناقصة، صفوف متجاهلة، تكرارات، تواريخ غير صالحة).
 */
export function analyzeStudyLeavesWorkbook(workbook) {
  const sheetName = pickSheet(workbook);
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error("لا يوجد شيت صالح في الملف.");
  }

  const aoa = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  // العناوين في الملف الحالي بالصف الثاني؛ نبحث عنها بدل افتراض موضعها.
  const headerIndex = aoa.findIndex((row) => {
    const first = textOf(row?.[0]);
    const cells = (row || []).map((cell) => textOf(cell));
    return first === "م" || cells.some((cell) => cell === "الاسم" || cell === "كود الموظف");
  });

  const headers = (headerIndex >= 0 ? aoa[headerIndex] : []).map((cell) =>
    textOf(cell)
  );
  const mappedKeys = new Set(
    headers.map((header) => HEADER_ALIASES[header]).filter(Boolean)
  );

  const unknownColumns = headers.filter(
    (header) => header && !HEADER_ALIASES[header]
  );
  const OPTIONAL_KEYS = [
    "serial",
    "jobTitle",
    "grade",
    "leavePayType",
    "leaveKind",
    "notes",
    "orderNote",
    "returnedToWork",
    "endReason",
    "claimMade",
  ];
  const missingColumns = LEAVE_FIELDS.filter(
    (field) => !OPTIONAL_KEYS.includes(field.key) && !mappedKeys.has(field.key)
  ).map((field) => field.label);

  const bodyRows =
    headerIndex >= 0
      ? aoa.slice(headerIndex + 1)
      : XLSX.utils.sheet_to_json(worksheet, {
          defval: "",
          raw: true,
          blankrows: false,
        });

  const leaves = [];
  const skippedRows = [];
  const invalidDates = [];
  const missingValues = {};
  IMPORTANT_FIELDS.forEach((field) => {
    missingValues[field.key] = 0;
  });

  bodyRows.forEach((row) => {
    let record;
    if (headerIndex >= 0) {
      record = {};
      headers.forEach((header, col) => {
        if (header) record[header] = row[col];
      });
    } else {
      record = row;
    }

    const hasName = Boolean(textOf(record?.["الاسم"] ?? record?.name ?? record?.الاسم));
    const hasCode = Boolean(
      textOf(record?.["كود الموظف"] ?? record?.employeeCode)
    );
    if (!hasName && !hasCode) {
      const serial = textOf(record?.["م"] ?? record?.serial);
      if (serial) skippedRows.push({ serial, reason: "لا يوجد اسم أو كود" });
      return;
    }

    const leave = normalizeImportedRow(record, leaves.length);

    DATE_FIELDS.forEach((field) => {
      const rawValue =
        headerIndex >= 0
          ? record?.[
              headers.find((header) => HEADER_ALIASES[header] === field)
            ]
          : undefined;
      if (rawValue instanceof Date && Number.isNaN(rawValue.getTime())) {
        invalidDates.push({ name: leave.name, field, value: "تاريخ غير صالح" });
      } else if (
        rawValue instanceof Date &&
        rawValue.getFullYear() < 1950 &&
        !leave[field]
      ) {
        invalidDates.push({
          name: leave.name,
          field,
          value: `سنة غير صالحة (${rawValue.getFullYear()})`,
        });
      }
    });

    IMPORTANT_FIELDS.forEach((field) => {
      if (!leave[field.key]) missingValues[field.key] += 1;
    });

    leaves.push(leave);
  });

  const codeCounts = new Map();
  const nameCounts = new Map();
  leaves.forEach((leave) => {
    if (leave.employeeCode) {
      codeCounts.set(leave.employeeCode, (codeCounts.get(leave.employeeCode) || 0) + 1);
    }
    if (leave.name) {
      nameCounts.set(leave.name, (nameCounts.get(leave.name) || 0) + 1);
    }
  });

  const duplicates = {
    codes: [...codeCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([code, count]) => ({ code, count })),
    names: [...nameCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name, count]) => ({ name, count })),
  };

  const salaryStatusCounts = {};
  leaves.forEach((leave) => {
    const key = leave.salaryStatus || "(فارغ)";
    salaryStatusCounts[key] = (salaryStatusCounts[key] || 0) + 1;
  });

  return {
    sheetName,
    leaves,
    report: {
      totalRows: bodyRows.length,
      importedRows: leaves.length,
      skippedRows,
      unknownColumns,
      missingColumns,
      mappedKeys: [...mappedKeys],
      duplicates,
      invalidDates,
      missingValues,
      salaryStatusCounts,
      hasDuplicates: duplicates.codes.length > 0 || duplicates.names.length > 0,
      hasErrors: invalidDates.length > 0,
    },
  };
}

export function parseStudyLeavesWorkbook(workbook) {
  return analyzeStudyLeavesWorkbook(workbook).leaves;
}

/* -------------------------------------------------------------------------- */
/* تصدير Excel                                                                */
/* -------------------------------------------------------------------------- */

export function exportStudyLeavesWorkbook(leaves, today = new Date()) {
  const stats = getLeaveStats(leaves, today);
  const dashboard = [
    ["لوحة متابعة الإجازات الدراسية", "اداره الاستحقاقات"],
    ["اخر تحديث", formatDisplayDate(today)],
    ["اجمالي الموظفين", stats.total],
    ["يصرف المرتب", stats.paying],
    ["يوقف المرتب", stats.stopped],
    ["بدون مرتب", stats.unpaid],
    ["حالة غير محددة", stats.unset],
    ["يجب إيقاف المرتب الآن", stats.stopNow],
    ["باقي أقل من 30 يوم", stats.soon],
    ["باقي من 31 إلى 90 يوم", stats.watch],
  ];

  const header = LEAVE_FIELDS.map((field) => field.label);
  const rows = leaves.map((leave, index) => {
    const enriched = enrichLeave(leave, today);
    return LEAVE_FIELDS.map((field) => {
      if (field.key === "serial") return leave.serial || index + 1;
      if (DATE_FIELDS.includes(field.key)) {
        return formatDisplayDate(enriched[field.key]);
      }
      return enriched[field.key] ?? "";
    });
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(dashboard),
    "Dashborad"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([header, ...rows]),
    "الاجازات الدراسيه"
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), "الاعدادات");
  XLSX.writeFile(workbook, "الاجازات الدراسيه.xlsx");
}

/* -------------------------------------------------------------------------- */
/* التخزين المحلي (نسخة احتياطية / وضع بلا اتصال)                             */
/* -------------------------------------------------------------------------- */

export function loadStudyLeaves() {
  try {
    const raw = localStorage.getItem(STUDY_LEAVES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((leave) => ({
          ...createEmptyLeave(),
          ...leave,
          employeeCode: normalizeMemberCode(leave.employeeCode || ""),
          salaryStatus: normalizeSalaryStatus(leave.salaryStatus || ""),
        }));
      }
    }
  } catch (error) {
    console.error(error);
  }

  // لا تُعاد أي بيانات وهمية عند غياب الكاش: قاعدة البيانات هي المصدر الوحيد.
  return [];
}

export function saveStudyLeaves(leaves) {
  try {
    localStorage.setItem(STUDY_LEAVES_STORAGE_KEY, JSON.stringify(leaves));
  } catch (error) {
    console.error(error);
  }
}

/**
 * لم يعد يُعدّل حالة المرتب تلقائيًا (كان يطمس نص الملف).
 * تُركت الدالة للتوافق مع النداءات القديمة، وتعيد البيانات كما هي.
 */
export function autoUpdateSalaryStatus(leaves) {
  return leaves;
}

export function getStudyLeavesCount() {
  return loadStudyLeaves().length;
}
