// ============================================================================
// facultyArchiveMatcher.js
// ---------------------------------------------------------------------------
// المطابقة الذكية لملفات PDF مع أعضاء هيئة التدريس (الأرشيف الذكي).
//
// الهدف: عند اختيار ملف PDF، يقرأ النظام محتواه ويعرف:
//   • صاحب الملف (اسمه أو رقم صرفه) — بدون أي تخمين.
//   • سنة/شهر الملف إن كانا واضحين.
//
// القواعد الثابتة:
//   • المطابقة بالرقم (member_code) أعلى ثقة من المطابقة بالاسم.
//   • لا تُدمج عضوين ولا يُنشأ عضو جديد تلقائيًا — الغموض أو غياب الشخص
//     يُعرض على المستخدم ليختار أو ليضيف بياناته بنفسه.
//   • ملف ممسوح ضوئيًا (بلا نص) لا يُخمَّن: يُطلب من المستخدم تحديد العضو.
// ============================================================================

import { normalizeArabicKey, normalizeDigits, normalizeMemberCode } from "./arabicText";
import { openPdfDocument } from "./executiveOrderPdf";

/** أقصى عدد صفحات تُقرأ من الملف لاستخراج النص. */
const MAX_TEXT_PAGES = 3;

/** أقل عدد كلمات مطلوب في الاسم حتى تُقبل المطابقة بالاسم. */
const MIN_NAME_TOKENS = 2;

/** رموز الشهور العربية (مطابقة لجدول المحلل). */
const MONTH_WORDS = [
  { n: 1, names: ["يناير", "يانيير", "جناير", "جانفي"] },
  { n: 2, names: ["فبراير", "فبرايه", "فبراير", "فيفري", "شباط"] },
  { n: 3, names: ["مارس", "مارش"] },
  { n: 4, names: ["ابريل", "أبريل", "إبريل", "افريل", "أفريل"] },
  { n: 5, names: ["مايو", "مايه"] },
  { n: 6, names: ["يونيو", "يونية", "يونيه", "جوان"] },
  { n: 7, names: ["يوليو", "يولية", "يوليه", "جويلية"] },
  { n: 8, names: ["اغسطس", "أغسطس", "أوت", "غشت"] },
  { n: 9, names: ["سبتمبر", "شتنبر"] },
  { n: 10, names: ["اكتوبر", "أكتوبر"] },
  { n: 11, names: ["نوفمبر", "نونبر"] },
  { n: 12, names: ["ديسمبر", "ديسمببر", "دجنبر"] },
];

/* ------------------------------------------------------------------ */
/* استخراج نص الملف                                                    */
/* ------------------------------------------------------------------ */

/**
 * يقرأ نص أول صفحة/صفحات من ملف PDF.
 * يعيد { text, pageCount, pagesRead, hasText } — ولا يرمي إلا عند فشل الفتح.
 */
export async function extractPdfText(file, maxPages = MAX_TEXT_PAGES) {
  if (!file) return { text: "", pageCount: 0, pagesRead: 0, hasText: false };

  let doc = null;
  try {
    const buffer = await file.arrayBuffer();
    doc = await openPdfDocument(buffer);
    const pagesRead = Math.min(doc.numPages, Math.max(1, maxPages));
    const chunks = [];

    for (let i = 1; i <= pagesRead; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = (content.items || [])
        .map((item) => (item && item.str ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) chunks.push(text);
    }

    return {
      text: chunks.join("\n"),
      pageCount: doc.numPages,
      pagesRead,
      hasText: chunks.length > 0,
    };
  } catch {
    return { text: "", pageCount: 0, pagesRead: 0, hasText: false };
  } finally {
    if (doc && typeof doc.destroy === "function") {
      try {
        await doc.destroy();
      } catch {
        /* تجاهُل */
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* استخراج رقم الصرف                                                   */
/* ------------------------------------------------------------------ */

/** رقم مثبّت بصيغة «رقم العامل: 035004» أو «رقم الصرف …». */
const LABELED_CODE_RE =
  /(?:رقم\s*(?:ال)?(?:عامل|صرف|كمبيوتر|وظيفي|شئون|كود)|computer\s*(?:no|number))\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9\-_/]{1,})/i;

/**
 * يبحث عن رقم الصرف في نص الملف ثم في اسمه.
 * يعيد الرقم كما ورد (بدون تحويل الأرقام العربية إلى لاتينية).
 */
export function detectMemberCode(text, fileName) {
  const fromText = String(text || "").match(LABELED_CODE_RE);
  if (fromText) {
    const code = String(fromText[1] || "").trim();
    if (normalizeMemberCode(code)) return code;
  }

  const name = String(fileName || "");
  const labeledInName = name.match(LABELED_CODE_RE);
  if (labeledInName) {
    const code = String(labeledInName[1] || "").trim();
    if (normalizeMemberCode(code)) return code;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* استخراج السنة والشهر                                                */
/* ------------------------------------------------------------------ */

function validYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  if (year >= 100 && year < 1000) {
    return year >= 60 ? 1900 + year : 2000 + year;
  }
  if (year >= 1960 && year <= 2099) return year;
  return null;
}

/**
 * يستخرج السنة والشهر من نص الملف أو من اسمه.
 * يعيد { year, month } — كل منهما قد يكون null.
 */
export function detectYearMonth(text, fileName) {
  const haystack = normalizeDigits(`${fileName || ""} ${text || ""}`);
  let year = null;
  let month = null;

  // «2024/03» أو «03/2024»
  const numeric = haystack.match(/(?:^|[^\d])(\d{1,2})\s*[\/\-]\s*((?:19|20)\d{2})(?:[^\d]|$)/);
  const numericReverse = haystack.match(/(?:^|[^\d])((?:19|20)\d{2})\s*[\/\-]\s*(\d{1,2})(?:[^\d]|$)/);

  if (numeric) {
    month = Number(numeric[1]);
    year = validYear(numeric[2]);
  } else if (numericReverse) {
    year = validYear(numericReverse[1]);
    month = Number(numericReverse[2]);
  }

  if (!year) {
    const yearOnly = haystack.match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/);
    if (yearOnly) year = validYear(yearOnly[1]);
  }

  if (month != null && (month < 1 || month > 12)) month = null;

  if (!month) {
    const lower = haystack.toLowerCase();
    for (const info of MONTH_WORDS) {
      if (info.names.some((n) => lower.includes(n))) {
        month = info.n;
        break;
      }
    }
  }

  return { year, month };
}

/* ------------------------------------------------------------------ */
/* تحديد نوع الوثيقة                                                   */
/* ------------------------------------------------------------------ */

const DOC_TYPE_HINTS = [
  { type: "salary", words: ["مفردات مرتب", "مفرده مرتب", "المرتب", "مرتب", "استحقاق", "الرواتب"] },
  { type: "certificate", words: ["شهادة", "شهاده"] },
  { type: "contract", words: ["عقد", "كتاب"] },
  { type: "decision", words: ["قرار"] },
];

/**
 * يستنتج نوع الوثيقة من نص الملف واسمه.
 * يعيد one of: salary | certificate | contract | decision | other
 */
export function detectDocType(text, fileName) {
  const hay = normalizeArabicKey(`${fileName || ""} ${text || ""}`);
  for (const hint of DOC_TYPE_HINTS) {
    if (hint.words.some((w) => hay.includes(normalizeArabicKey(w)))) {
      return hint.type;
    }
  }
  return "other";
}

/* ------------------------------------------------------------------ */
/* مطابقة العضو                                                        */
/* ------------------------------------------------------------------ */

function nameTokens(normalizedName) {
  return String(normalizedName || "")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && /[\u0600-\u06FF]/.test(token));
}

/**
 * يطابق ملف مع عضو.
 *
 * @param {Array} members قائمة الأعضاء (fetchMembers).
 * @param {Object} input  { text, fileName, code }
 * @returns {Object|null} { member, score, reason, ambiguous, candidates }
 */
export function matchMember(members, { text = "", fileName = "", code = null } = {}) {
  const list = Array.isArray(members) ? members : [];
  if (!list.length) return null;

  /* 1) رقم الصرف — أعلى ثقة */
  const rawCode = code || detectMemberCode(text, fileName);
  if (rawCode) {
    const wanted = normalizeMemberCode(rawCode);
    const byCode = list.find(
      (m) =>
        normalizeMemberCode(m.member_code) === wanted ||
        normalizeMemberCode(m.member_code_raw) === wanted
    );
    if (byCode) {
      return {
        member: byCode,
        score: 100,
        reason: "تطابق رقم الصرف",
        ambiguous: false,
        candidates: [],
      };
    }
  }

  /* 2) الاسم — من اسم الملف أولًا ثم من نص الملف */
  const fileKey = normalizeArabicKey(fileName || "");
  const textKey = normalizeArabicKey(text || "");

  const scored = [];
  for (const member of list) {
    const fullKey = normalizeArabicKey(member.full_name || "");
    if (!fullKey) continue;
    const tokens = nameTokens(fullKey);

    let score = 0;
    let reason = "";

    if (fileKey && fileKey.includes(fullKey)) {
      score = 90;
      reason = "الاسم موجود في اسم الملف";
    } else if (textKey && textKey.includes(fullKey)) {
      score = 85;
      reason = "الاسم موجود داخل الملف";
    } else if (tokens.length >= MIN_NAME_TOKENS) {
      const inFile = tokens.filter((t) => fileKey.includes(t)).length;
      const inText = tokens.filter((t) => textKey.includes(t)).length;
      const found = Math.max(inFile, inText);
      if (found === tokens.length) {
        score = 75;
        reason = "كل كلمات الاسم موجودة";
      } else if (found >= MIN_NAME_TOKENS && found / tokens.length >= 0.6) {
        score = 55 + (found / tokens.length) * 15;
        reason = "تطابق جزئي بالاسم";
      }
    }

    if (score > 0) {
      scored.push({ member, score: Math.round(score), reason });
    }
  }

  if (!scored.length) return null;

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const rivals = scored.filter((s) => s.score === top.score);

  if (rivals.length > 1) {
    return {
      member: null,
      score: top.score,
      reason: "تطابق متساوٍ بين أكثر من عضو",
      ambiguous: true,
      candidates: rivals.map((r) => r.member),
    };
  }

  return {
    member: top.member,
    score: top.score,
    reason: top.reason,
    ambiguous: false,
    candidates: [top.member],
  };
}

/**
 * تحليل كامل لملف: نص + رقم صرف + سنة/شهر + العضو المطابق.
 */
export async function analyzeArchiveFile(file, members) {
  const { text, pageCount, hasText } = await extractPdfText(file);
  const code = detectMemberCode(text, file.name);
  const { year, month } = detectYearMonth(text, file.name);
  const match = matchMember(members, { text, fileName: file.name, code });
  const docType = detectDocType(text, file.name);

  return {
    text,
    pageCount,
    hasText,
    code,
    year,
    month,
    docType,
    match,
  };
}
