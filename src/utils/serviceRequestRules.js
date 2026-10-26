// قواعد عمل طلبات الخدمة (service_requests).
// تُستخدم من واجهة الموظف ومن مسار الحفظ معًا، وتطابق ما فُرض في محفّزات
// قاعدة البيانات (ملف supabase/migrations/20261018_service_requests_workflow.sql).

export const RECEIVED_STATUS = "تم الاستلام من قبل مقدم الطلب";
export const COMPLETED_STATUS = "تم التنفيذ";

// مراحل العمل الداخلية (تظهر للإدارة فقط، لا لمقدم الطلب).
export const INTERNAL_STAGES = [
  { value: 1, label: "تم طباعة الطلب وإخراجه بواسطة الموظف المختص", icon: "🖨️" },
  { value: 2, label: "توقيع مدير القسم", icon: "✍️" },
  { value: 3, label: "توقيع أمين الكلية", icon: "🏛️" },
];

export const NO_INTERNAL_STAGE = 0;

export function internalStageLabel(stage) {
  const value = Number(stage) || 0;
  if (value <= 0) return "لم تبدأ المراحل الداخلية بعد";
  const match = INTERNAL_STAGES.find((item) => item.value === value);
  return match ? match.label : "لم تبدأ المراحل الداخلية بعد";
}

const SALARY_TYPES = ["مفردات مرتب", "مفردات المرتب", "مفرد مرتب", "مفرد المرتب"];
const CERTIFICATE_TYPES = ["الإفادات"];
const CARE_TYPES = ["الرعاية الصحية", "خدمة الرعاية", "الرعاية الاجتماعية"];
const FELLOWSHIP_TYPES = ["صندوق الزمالة", "الزمالة"];

export function normalizeServiceType(serviceType) {
  return String(serviceType || "").trim();
}

/** هل هذا النوع يحتاج حقل «موجّه إلى» إجباري؟ */
export function requiresDirectedTo(serviceType) {
  const st = normalizeServiceType(serviceType);
  return SALARY_TYPES.includes(st) || CERTIFICATE_TYPES.includes(st);
}

/** هل هذا النوع يحتاج حقل «المطلوب» إجباري؟ */
export function requiresRequestedDetails(serviceType) {
  const st = normalizeServiceType(serviceType);
  return CARE_TYPES.includes(st) || FELLOWSHIP_TYPES.includes(st);
}

/**
 * تحقق من الحقول الإجبارية حسب نوع الطلب.
 * يُستدعى داخل دوال الحفظ نفسها (وليس لإخفاء الأزرار فقط)،
 * ونفس القواعد مفروضة على مستوى القاعدة بمحفّز trg_service_requests_validate.
 *
 * @returns {string|null} رسالة خطأ عربية، أو null إذا كانت القيم صالحة.
 */
export function validateServiceRequestFields(serviceType, fields = {}) {
  const directedTo = String(fields.directedTo ?? fields.directed_to ?? "").trim();
  const requestedDetails = String(
    fields.requestedDetails ?? fields.requested_details ?? ""
  ).trim();

  if (requiresDirectedTo(serviceType) && !directedTo) {
    return "حقل «موجّه إلى» إجباري لهذا النوع من الطلبات.";
  }
  if (requiresRequestedDetails(serviceType) && !requestedDetails) {
    return "حقل «المطلوب» إجباري لهذا النوع من الطلبات.";
  }
  return null;
}

/**
 * هل يجوز انتقال الحالة إلى «تم الاستلام من قبل مقدم الطلب»؟
 * القاعدة: فقط من «تم التنفيذ» (لا انتقال تلقائي ولا من «جديدة/قيد التنفيذ»).
 */
export function canTransitionToStatus(previousStatus, newStatus) {
  if (newStatus !== RECEIVED_STATUS) return true;
  const prev = previousStatus === "جديد" ? "جديدة" : previousStatus;
  return prev === COMPLETED_STATUS || prev === RECEIVED_STATUS;
}

/** توقيت مصر المحلي الموحّد للعرض. */
export function formatEgyptDateTime(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("ar-EG", {
      timeZone: "Africa/Cairo",
      numberingSystem: "latn",
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}
