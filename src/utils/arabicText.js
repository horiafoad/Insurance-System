// arabicText.js
//
// أدوات تطبيع النص العربي — تُستخدم في «الأرشيف الذكي لأعضاء هيئة التدريس».
//
// لماذا هذه الأداة موجودة؟
// ملف Excel لأعضاء هيئة التدريس يخزّن الأسماء بالحروف العربية التقديمية
// (Arabic Presentation Forms-B) مثل:  ﺍﺑﺮﺍﻫﻴﻢ  بدل  ابراهيم .
// هذه الأشكال:
//   • لا يقابلها بحث ilike في PostgreSQL بشكل موثوق،
//   • ولا تطابق الأسماء التي تُكتب يدويًا في المطالبات والطلبات (أساسية)،
//   • تفسد الروابط التلقائية بين الأرشيف وبقية الأقسام.
//
// لذلك: نحول كل اسم قادم من Excel إلى الحروف الأساسية قبل تخزينه،
// ونحتفظ بالشكل الأصلي في عمود منفصل (full_name_raw) للمراجعة.
//
// كل الدوال لا تُعدّل المُدخل ولا ترمي استثناءً.

const DIACRITICS_AND_TATWEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** يحوّل الأرقام العربية-الهندية والفارسية إلى أرقام لاتينية. */
export function normalizeDigits(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (c) => ARABIC_INDIC_DIGITS.indexOf(c))
    .replace(/[۰-۹]/g, (c) => PERSIAN_DIGITS.indexOf(c));
}

/**
 * يحوّل الأشكال التقديمية (Presentation Forms-B) إلى الحروف العربية الأساسية.
 * NFKC يتعامل مع كل الحروف التقديمية دفعةً واحدة (ﺍ→ا، ﺑ→ب، ﻡ→م …).
 * لا يزيل التشكيل ولا التطويل — لذلك تُستخدم stripDiacritics بعده عند الحاجة.
 */
export function toBaseArabic(value) {
  return String(value ?? "").normalize("NFKC");
}

/** يزيل التشكيل (الفتحة/الضمة/الكسرة/الشدة/السكون) والتطويل (ــ). */
export function stripDiacritics(value) {
  return String(value ?? "").replace(DIACRITICS_AND_TATWEEL, "");
}

/** ينظّف المسافات المتعددة ويقصّ الأطراف. */
export function collapseSpaces(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * مفتاح البحث الموحّد.
 * يوحّد: الأشكال التقديمية، الأرقام العربية، التشكيل، التطويل،
 * الهمزات (أ إ آ ٱ ← ا)، الألف المقصورة (ى ← ي)، التاء المربوطة (ة ← ه)،
 * والهمزة على الواو (ؤ ← و). ثم يحوّل الحروف إلى أحرف صغيرة.
 *
 * الاسم الأصلي المخزَّن لا يُعدَّل أبدًا — هذا للبحث والمطابقة فقط.
 */
export function normalizeArabicKey(value) {
  return stripDiacritics(toBaseArabic(normalizeDigits(value)))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىيئ]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * اسم جاهز للعرض والتخزين: حروف أساسية + مسافات مضغوطة.
 * (التشكيل يُحذف أيضًا لأن أسماء الملف تحمله أحيانًا بشكل غير منتظم.)
 */
export function toDisplayName(value) {
  return collapseSpaces(stripDiacritics(toBaseArabic(normalizeDigits(value))));
}

/**
 * يقرأ رقمًا من Excel أو من نص عربي.
 * يتعامل مع: 471.6 ، "٤٧١٫٦" ، "٢٤٦" ، "246" ، "246.50" ، "٬" ، "٫"
 * يعيد null إذا تعذّر الفحص (لا تخمين).
 */
export function parseArabicNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;

  const cleaned = normalizeDigits(value)
    .replace(/[٫٬،]/g, ".")
    .replace(/[^\d.\-]/g, "")
    .replace(/(\.\d*)\.+/g, "$1")
    .replace(/^\.+|\.+$/g, "");

  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** يقرأ تاريخًا بصيغة يوم/شهر/سنة ويعيده بصيغة YYYY-MM-DD أو null. */
export function parseArabicDate(value) {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const text = normalizeDigits(value).trim();

  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }

  return null;
}

/** يزيل الفواصل والمسافات من رقم الصرف مع تحويل الأرقام العربية. */
export function normalizeMemberCode(value) {
  return normalizeDigits(value).replace(/[^\d\-]/g, "");
}

/** تنسيق رقم بخانتين عشريتين للعرض. */
export function formatArabicNumber(value) {
  const n = parseArabicNumber(value);
  if (n === null) return "";
  return n.toFixed(2);
}
