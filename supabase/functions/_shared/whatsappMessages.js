// ============================================================================
// Shared WhatsApp message helpers (pure JS).
//
// This file is imported by:
//   - Supabase Edge Functions (Deno): send-whatsapp / update-service-request
//   - The React frontend: message preview and notification API wrapper
//   - Node unit tests: scripts/whatsapp/tests/message-builder.test.mjs
//
// Keep it free of Deno / browser / Vite environment APIs so all three runtimes
// can use the exact same message and phone-normalisation rules.
// ============================================================================

export const WHATSAPP_ENTITY_NAME = "كلية الهندسة – جامعة عين شمس";
export const WHATSAPP_DEPARTMENT_NAME = "إدارة الاستحقاقات";

// الرقم الرسمي المرسل (بصيغة دولية بدون +) — للنشر والعرض فقط.
export const WHATSAPP_OFFICIAL_NUMBER = "201132853275";
export const WHATSAPP_OFFICIAL_NUMBER_DISPLAY = "+201132853275";

export const RECEIVED_STATUS = "تم الاستلام من قبل مقدم الطلب";
export const COMPLETED_STATUS = "تم التنفيذ";

const STATUS_ALIASES = {
  "جديد": "جديدة",
  "جديده": "جديدة",
  "مرفوض": "مرفوضة",
  "مرفوضه": "مرفوضة",
  "قيد المراجعة": "قيد التنفيذ",
  "جاري التنفيذ": "قيد التنفيذ",
  "قيد المعالجة": "قيد التنفيذ",
  "معلق": "قيد التنفيذ",
  "مقبولة": "تم التنفيذ",
  "مكتمل": "تم التنفيذ",
  "مكتملة": "تم التنفيذ",
  "منتهي": "تم التنفيذ",
  "تم الصرف": "تم التنفيذ",
  [RECEIVED_STATUS]: RECEIVED_STATUS,
};

/**
 * توحيد قيم الحالة العربية القديمة والجديدة إلى قيمة واحدة.
 */
export function normalizeStatus(status) {
  const value = String(status ?? "").trim();
  if (!value) return "";
  return STATUS_ALIASES[value] || value;
}

/**
 * تصنيف الحالة إلى نوع ثابت يُستخدم في الرسائل وقواعد الإشعار.
 * @returns {"received"|"in_progress"|"completed"|"rejected"|"collected"|null}
 */
export function getStatusKind(status) {
  const value = normalizeStatus(status);
  if (value === "جديدة") return "received";
  if (value === "قيد التنفيذ") return "in_progress";
  if (value === "تم التنفيذ") return "completed";
  if (value === "مرفوضة") return "rejected";
  if (value === RECEIVED_STATUS) return "collected";
  return null;
}

/** الحالات التي تستحق إشعار WhatsApp للعميل. */
export function isNotifiableStatus(status) {
  const kind = getStatusKind(status);
  return Boolean(kind && kind !== "collected");
}

export const WHATSAPP_NOTIFIABLE_STATUSES = [
  "جديدة",
  "قيد التنفيذ",
  "تم التنفيذ",
  "مرفوضة",
];

export function statusArabicLabel(status) {
  return normalizeStatus(status) || "غير محددة";
}

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------

/**
 * تحويل رقم مصرى إلى صيغة E.164 بدون + (مثال: 01132853275 -> 201132853275).
 * يقبل: 01xxxxxxxxx / +201xxxxxxxxx / 00201xxxxxxxxx / 201xxxxxxxxx
 * يعيد null إذا كان الرقم غير صالح.
 */
export function normalizePhoneToIntl(rawPhone) {
  let digits = String(rawPhone ?? "").replace(/\D/g, "");

  if (!digits) return null;

  // 0020... -> 20...
  if (digits.startsWith("0020")) {
    digits = digits.slice(2);
  }

  // 20... already international
  if (digits.startsWith("20")) {
    // الأرقام المصرية المحمولة: 20 + 1 + 9 أرقام = 12 رقمًا.
    if (/^20(10|11|12|15)\d{8}$/.test(digits)) return digits;
    // أرقام أرضية / أرقام دولية أخرى مسموحة إذا كانت بصيغة E.164 معقولة.
    if (/^20\d{8,10}$/.test(digits)) return digits;
    return null;
  }

  // 01xxxxxxxxx -> 201xxxxxxxxx
  if (digits.startsWith("0") && digits.length === 11) {
    const local = "20" + digits.slice(1);
    return /^20(10|11|12|15)\d{8}$/.test(local) ? local : null;
  }

  // رقم محمول مصرى بدون بادئة 0 (مثال: 1132853275 -> 201132853275)
  if (digits.length === 10 && /^1(0|1|2|5)\d{8}$/.test(digits)) {
    return "20" + digits;
  }

  // أرقام دولية أخرى بصيغة E.164 معقولة (11-15 رقمًا).
  if (/^\d{11,15}$/.test(digits)) return digits;

  return null;
}

// ---------------------------------------------------------------------------
// Dates / tracking URL
// ---------------------------------------------------------------------------

export function formatEgyptDateTime(value) {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
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

/** هل رابط المتابعة آمن للعرض داخل الرسالة؟ */
export function isSafeTrackingUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:") return true;
    if (
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function buildTrackingUrl(baseUrl, requestId) {
  const base = String(baseUrl ?? "").trim();
  const id = String(requestId ?? "").trim();
  if (!base || !id) return "";

  try {
    const url = new URL("?track=" + encodeURIComponent(id), base);
    return isSafeTrackingUrl(url.toString()) ? url.toString() : "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Message body
// ---------------------------------------------------------------------------

function statusCustomerLine(status, options) {
  const kind = getStatusKind(status);
  const reason = String(options?.rejectionReason ?? "").trim();

  if (kind === "received") {
    return "تم استلام طلبكم بنجاح، وهو الآن قيد المراجعة من قبل الإدارة.";
  }
  if (kind === "in_progress") {
    return "نفيدكم بأن طلبكم قيد التنفيذ حاليًا، وسيتم إبلاغكم فور اكتماله.";
  }
  if (kind === "completed") {
    return "يسرنا إبلاغكم بأنه تم الانتهاء من تنفيذ طلبكم بنجاح.";
  }
  if (kind === "rejected") {
    if (reason) {
      return "نأسف لإبلاغكم بأنه تم رفض طلبكم للسبب التالي: " + reason;
    }
    return "نأسف لإبلاغكم بأنه تم رفض طلبكم. للاستفسار يرجى التواصل مع الإدارة.";
  }
  return "تم تحديث حالة طلبكم.";
}

/**
 * بناء نص رسالة WhatsApp العربية النهائية.
 *
 * @param {object} params
 * @param {object} params.request - صف service_requests
 * @param {string} [params.status] - الحالة التي أحدثت الإشعار
 * @param {string} [params.trackingBaseUrl] - رابط المتابعة الأساسي
 * @param {boolean} [params.includeRejectionReason] - إظهار سبب الرفض
 * @param {boolean} [params.includeNotes] - إظهار ملاحظات الموظف (معطّل افتراضيًا)
 * @param {string} [params.updatedAt] - وقت التحديث
 */
export function buildWhatsAppMessage({
  request,
  status,
  trackingBaseUrl,
  includeRejectionReason = false,
  includeNotes = false,
  updatedAt,
} = {}) {
  const row = request || {};
  const requestId = String(row.id ?? row.request_number ?? "").trim();
  const statusValue = normalizeStatus(status || row.status);
  const statusLabel = statusArabicLabel(statusValue);
  const kind = getStatusKind(statusValue);
  const dateText = formatEgyptDateTime(
    updatedAt || row.updated_at || row.created_at || row.arrival_at
  );
  const trackingUrl = buildTrackingUrl(
    trackingBaseUrl || row.trackingBaseUrl,
    requestId
  );
  const notes = String(row.notes ?? "").trim();
  const rejectionReason =
    includeRejectionReason && kind === "rejected" ? notes : "";

  const lines = [
    WHATSAPP_ENTITY_NAME,
    WHATSAPP_DEPARTMENT_NAME,
    "",
    "السيد/السيدة مقدم الطلب،",
    "تحية طيبة وبعد،",
    "",
    statusCustomerLine(statusValue, { rejectionReason }),
    "",
    "رقم الطلب: " + (requestId || "غير متاح"),
    "الحالة الجديدة: " + statusLabel,
  ];

  if (dateText) {
    lines.push("تاريخ التحديث: " + dateText);
  }

  if (includeNotes && notes && kind !== "rejected") {
    lines.push("", "ملاحظات الإدارة:", notes);
  }

  if (trackingUrl) {
    lines.push("", "لمتابعة تفاصيل الطلب:", trackingUrl);
  }

  lines.push(
    "",
    "هذه الرسالة خاصة بمتابعة طلبكم، ولا يمكن تعديل حالة الطلب من خلال WhatsApp.",
    "",
    "مع خالص التحية،",
    WHATSAPP_DEPARTMENT_NAME
  );

  return lines.join("\n");
}

/**
 * تجهيز معاملات قالب Meta (Template) بنفس ترتيب القالب الموثّق في
 * WHATSAPP_SETUP.md.
 *
 * القالب العام (4 معاملات):
 *   {{1}} رقم الطلب
 *   {{2}} الحالة الجديدة
 *   {{3}} تاريخ التحديث
 *   {{4}} رابط المتابعة
 *
 * قالب الرفض (5 معاملات):
 *   {{1}} رقم الطلب
 *   {{2}} الحالة الجديدة
 *   {{3}} تاريخ التحديث
 *   {{4}} سبب الرفض
 *   {{5}} رابط المتابعة
 */
export function buildTemplateParams({
  request,
  status,
  trackingBaseUrl,
  includeRejectionReason = false,
  updatedAt,
} = {}) {
  const row = request || {};
  const requestId = String(row.id ?? row.request_number ?? "").trim();
  const statusValue = normalizeStatus(status || row.status);
  const statusLabel = statusArabicLabel(statusValue);
  const kind = getStatusKind(statusValue);
  const dateText =
    formatEgyptDateTime(updatedAt || row.updated_at || row.created_at || row.arrival_at) ||
    "غير متاح";
  const trackingUrl =
    buildTrackingUrl(trackingBaseUrl || row.trackingBaseUrl, requestId) ||
    "غير متاح";
  const reason =
    includeRejectionReason && kind === "rejected"
      ? String(row.notes ?? "").trim() || "غير مذكور"
      : "";

  if (reason) {
    return {
      rejected: true,
      params: [requestId || "غير متاح", statusLabel, dateText, reason, trackingUrl],
    };
  }

  return {
    rejected: false,
    params: [requestId || "غير متاح", statusLabel, dateText, trackingUrl],
  };
}

/**
 * مفتاح منع التكرار. لا يتغير لنفس الطلب/الحدث/الحالة/وقت التحديث.
 */
export function buildDedupeKey({ requestId, event, status, updatedAt } = {}) {
  const id = String(requestId ?? "").trim();
  const eventName = String(event ?? "status_change").trim() || "status_change";
  const statusValue = normalizeStatus(status) || String(status ?? "").trim();
  const at = String(updatedAt ?? "").trim();
  return [id, eventName, statusValue, at].filter(Boolean).join(":");
}
