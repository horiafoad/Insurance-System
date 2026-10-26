/* ------------------------------------------------------------------
   notificationsConfig.js
   إعدادات أقسام التبليغات الثلاثة (هيئة التدريس / الموظفون / العقود)
   + الحالات + أسباب وقف المرتب + التسلسل الوظيفي + أدوات عرض مشتركة.

   الأنواع نفسها تُقرأ من قاعدة البيانات (notification_types) حتى يمكن
   للمسؤول إضافتها وتعديلها وإيقافها. القيم هنا للعرض والتحقق فقط.
------------------------------------------------------------------ */

export const NOTIFICATION_SECTIONS = {
  faculty: {
    id: "faculty",
    title: "تبليغات هيئة التدريس",
    shortTitle: "هيئة التدريس",
    menuTitle: "تبليغات هيئة التدريس",
    emoji: "👨‍🏫",
    memberLabel: "عضو هيئة التدريس",
    membersLabel: "أعضاء هيئة التدريس",
    numberLabel: "رقم الكمبيوتر",
    numberPlaceholder: "مثال: 12345",
    archiveTable: "faculty_salary_archive",
    archiveNameColumn: "faculty_name",
    archiveMenu: "faculty_salary_archive",
    permissionPrefix: "notifications_faculty",
    storageRoot: "faculty-notifications",
    accent: "#1D4ED8",
    accentSoft: "#EFF6FF",
  },
  employees: {
    id: "employees",
    title: "تبليغات الموظفين",
    shortTitle: "الموظفون",
    menuTitle: "تبليغات الموظفين",
    emoji: "👨‍💼",
    memberLabel: "الموظف",
    membersLabel: "الموظفون",
    numberLabel: "رقم العامل",
    numberPlaceholder: "مثال: 035004",
    archiveTable: "employee_salary_archive",
    archiveNameColumn: "employee_name",
    archiveMenu: "employee_salary_archive",
    permissionPrefix: "notifications_employees",
    storageRoot: "employee-notifications",
    accent: "#0F766E",
    accentSoft: "#F0FDFA",
  },
  contracts: {
    id: "contracts",
    title: "تبليغات العقود",
    shortTitle: "العقود",
    menuTitle: "تبليغات العقود",
    emoji: "📑",
    memberLabel: "المتعاقد",
    membersLabel: "المتعاقدون",
    numberLabel: "رقم العقد",
    numberPlaceholder: "مثال: CNT-2026-001",
    archiveTable: null,
    archiveNameColumn: null,
    archiveMenu: null,
    permissionPrefix: "notifications_contracts",
    storageRoot: "contract-notifications",
    accent: "#7C3AED",
    accentSoft: "#F5F3FF",
  },
};

export const NOTIFICATION_SECTION_LIST = [
  NOTIFICATION_SECTIONS.faculty,
  NOTIFICATION_SECTIONS.employees,
  NOTIFICATION_SECTIONS.contracts,
];

export function getSectionConfig(section) {
  return NOTIFICATION_SECTIONS[section] || NOTIFICATION_SECTIONS.faculty;
}

export const STOP_REASONS = [
  "استقالة",
  "وفاة",
  "إعارة داخلية",
  "إعارة خارجية",
  "مهمة علمية بدون مرتب",
  "إجازة دراسية بدون مرتب",
  "رعاية طفل",
];

export const PROMOTION_LADDER = [
  "معيد",
  "مدرس مساعد",
  "مدرس",
  "أستاذ مساعد",
  "أستاذ",
];

export const PAYMENT_METHODS = [
  "تحويل بنكي",
  "نقدًا",
  "شيك",
  "محفظة إلكترونية",
];

export const NOTIFICATION_STATUS = {
  draft: {
    label: "مسودة",
    shortLabel: "مسودة",
    icon: "📝",
    color: "#475569",
    bg: "#F1F5F9",
    order: 0,
  },
  pending_entry: {
    label: "بانتظار مراجعة مدخل البيرول",
    shortLabel: "بانتظار المدخل",
    icon: "🟡",
    color: "#B45309",
    bg: "#FEF3C7",
    order: 1,
  },
  entry_reviewed: {
    label: "تمت مراجعة المدخل",
    shortLabel: "مراجعة المدخل",
    icon: "🔵",
    color: "#1D4ED8",
    bg: "#DBEAFE",
    order: 2,
  },
  final_reviewed: {
    label: "تمت المراجعة النهائية",
    shortLabel: "مكتمل",
    icon: "🟢",
    color: "#047857",
    bg: "#D1FAE5",
    order: 3,
  },
  rejected: {
    label: "مرفوض",
    shortLabel: "مرفوض",
    icon: "🔴",
    color: "#B91C1C",
    bg: "#FEE2E2",
    order: 4,
  },
};

export const NOTIFICATION_STAGES = {
  entry: {
    label: "مدخل البيرول",
    fullLabel: "مراجعة مدخل البيرول",
    buttonLabel: "✅ تمت المراجعة والاستماع",
  },
  final: {
    label: "مراجع البيرول",
    fullLabel: "المراجعة النهائية",
    buttonLabel: "✅ إتمام المراجعة النهائية",
  },
};

export const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export function monthName(month) {
  return MONTH_NAMES[Number(month) - 1] || String(month || "");
}

export function statusMeta(status) {
  return NOTIFICATION_STATUS[status] || NOTIFICATION_STATUS.pending_entry;
}

export function nextPromotionRank(currentRank) {
  const index = PROMOTION_LADDER.indexOf(String(currentRank || "").trim());
  if (index < 0 || index >= PROMOTION_LADDER.length - 1) return "";
  return PROMOTION_LADDER[index + 1];
}

export function isPromotionForward(fromRank, toRank) {
  const from = PROMOTION_LADDER.indexOf(String(fromRank || "").trim());
  const to = PROMOTION_LADDER.indexOf(String(toRank || "").trim());
  return from >= 0 && to > from;
}

export function formatDateTime(value) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return String(value);
  }
}

export function formatDate(value) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date);
  } catch {
    return String(value);
  }
}

export function safeFileName(value) {
  return String(value || "attachment")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 90);
}

export function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/* وصف مختصر يُستخدم في الجداول وكشف الشهر */
export function reportSummary(report) {
  if (!report) return "";
  const parts = [];
  if (report.reason) parts.push(`السبب: ${report.reason}`);
  if (report.promotion_from || report.promotion_to) {
    parts.push(`الترقية: ${report.promotion_from || "—"} ← ${report.promotion_to || "—"}`);
  }
  if (report.new_payment_method) parts.push(`طريقة الدفع: ${report.new_payment_method}`);
  if (report.amount != null && report.amount !== "") parts.push(`المبلغ: ${report.amount}`);
  if (report.effective_date) parts.push(`السريان: ${formatDate(report.effective_date)}`);
  if (parts.length === 0 && report.notes) parts.push(report.notes);
  return parts.join(" • ");
}

/* الحقول الاحتياطية لعرض بيانات قديمة حتى لو تغيّر تعريف النوع لاحقًا */
export const FIELD_LABELS = {
  amount: "المبلغ / القيمة",
  payment_date: "تاريخ الصرف",
  payment_method: "طريقة الدفع الحالية",
  new_payment_method: "طريقة الدفع الجديدة",
  reason: "سبب الوقف",
  effective_date: "تاريخ السريان",
  leave_start: "تاريخ بداية الإجازة",
  leave_end: "تاريخ نهاية الإجازة",
  university: "الجهة / الجامعة",
  deduction_reason: "سبب الخصم",
  installments: "عدد الأقساط",
  promotion_from: "الدرجة الحالية",
  promotion_to: "الدرجة الجديدة",
  contract_start: "تاريخ بداية العقد",
  contract_end: "تاريخ نهاية العقد",
  contract_value: "قيمة العقد",
  notes: "ملاحظات",
};

export function typeFields(type) {
  const fields = type && Array.isArray(type.extra_fields) ? type.extra_fields : [];
  return fields
    .filter((field) => field && field.key)
    .map((field) => ({
      key: String(field.key),
      label: String(field.label || FIELD_LABELS[field.key] || field.key),
      type: String(field.type || "text"),
      required: Boolean(field.required),
      options: Array.isArray(field.options) ? field.options : [],
    }));
}

export function fieldLabel(key, type) {
  const match = typeFields(type).find((field) => field.key === key);
  return match?.label || FIELD_LABELS[key] || key;
}

/* يعيد كل الحقول المعروفة للعرض: حقول النوع الحالية + أي مفاتيح قديمة
   محفوظة في details ولم تعد موجودة في تعريف النوع. */
export function displayFields(report, type) {
  const fields = typeFields(type);
  const seen = new Set(fields.map((field) => field.key));
  const details = report && report.details && typeof report.details === "object"
    ? report.details
    : {};

  const legacy = Object.keys(details)
    .filter((key) => key !== "notes" && !seen.has(key))
    .map((key) => ({
      key,
      label: FIELD_LABELS[key] || key,
      type: "text",
      required: false,
      options: [],
    }));

  return [...fields, ...legacy];
}

export function detailValue(report, key) {
  const details = report && report.details && typeof report.details === "object"
    ? report.details
    : {};
  if (details[key] != null && details[key] !== "") return details[key];
  if (report && report[key] != null && report[key] !== "") return report[key];
  return "";
}
