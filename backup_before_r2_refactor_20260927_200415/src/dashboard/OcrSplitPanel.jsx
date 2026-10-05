import { useState, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { createScheduler, createWorker } from "tesseract.js";
import { supabase } from "../supabaseClient";
import { FACULTY_SALARY_CONFIG } from "./salaryArchiveConfig";

const RENDER_SCALE = 2.2;

const MONTH_NAMES = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];

function normalizeDigits(str) {
  /* NFKC أولًا: تحويل الأشكال العربية المرئية (Presentation Forms U+FB50–U+FEFF)
     مثل «رﻗﻢ اﻟﻌﺎﻣﻞ» إلى الحروف القياسية «رقم العامل» — وإلا تفشل كل التطابقات */
  return String(str)
    .normalize("NFKC")
    .replace(/[یك]/g, (c) => (c === "ی" ? "ي" : "ك"))
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
}

function sanitizeForStorage(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function otsuThreshold(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = 0, threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = t; }
  }
  return threshold;
}

/* تحويل الصفحة لتدرج رمادي + عتبة Otsu => أبيض وأسود نقي للقراءة */
function buildBinaryOcrCanvas(src) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const gray = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, k = 0; i < d.length; i += 4, k += 1) {
    gray[k] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  }
  const t = otsuThreshold(gray);
  for (let i = 0, k = 0; i < d.length; i += 4, k += 1) {
    const v = gray[k] <= t ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* تحويل عناصر Text Layer الخاصة بصفحة إلى سطور مصفوفة وفق الموضع الفعلي
   (الإحداثيات تُحوّل عبر viewport فتُطابق معاملات العرض/القص في RENDER_SCALE) */
function textItemsToLines(items, vp) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const words = items
    .filter((it) => it && it.str && it.str.trim())
    .map((it) => {
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      return { text: it.str.trim(), x, y };
    });
  if (words.length === 0) return [];
  words.sort((a, b) => a.y - b.y || a.x - b.x);
  const tol = Math.max(3, vp.height * 0.008);
  const lines = [];
  let cur = [];
  let curY = null;
  words.forEach((w) => {
    if (curY === null || Math.abs(w.y - curY) <= tol) {
      cur.push(w);
      curY = curY === null ? w.y : Math.min(curY, w.y);
    } else {
      lines.push({ y: cur[0].y, words: cur });
      cur = [w];
      curY = w.y;
    }
  });
  if (cur.length) lines.push({ y: cur[0].y, words: cur });
  lines.forEach((l) => {
    /* ترتيب عربي RTL: قراءة الكلمات من اليمين إلى اليسار (أكبر x أولا) */
    l.words.sort((a, b) => b.x - a.x);
    l.text = l.words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
  });
  return lines.filter((l) => l.text);
}

async function renderAllPages(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pageObj = await pdf.getPage(i);
    onProgress(`قراءة صفحة ${i} من ${pdf.numPages}...`);
    const vp = pageObj.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await pageObj.render({ canvasContext: canvas.getContext("2d", { willReadFrequently: true }), viewport: vp }).promise;

    /* النص المطبوع داخل الـ PDF (Text Layer حقيقي) هو المصدر الأساسي — بدون OCR.
       الـ OCR يستخدم فقط للصفحات التي بلا نص مطبوع.
       فحص جودة النص: بعض ملفات PDF تكون طباعتها النصية تالفة (الحروف الموصولة
       مستبدلة بكودات تحكم) — نكتشفها من قلة الحروف العربية الفعلية ونستخدم OCR بدلا. */
    const textContent = await pageObj.getTextContent();
    const lines = textItemsToLines(textContent.items || [], vp);
    const arabicRich = lines.filter((l) => {
      const n = normalizeDigits(l.text);
      const a = (n.match(/[\u0600-\u06FF]/g) || []).length;
      return n.length > 0 && a / n.length >= 0.4;
    });
    const isTextual = lines.length >= 3 && (arabicRich.length / lines.length) >= 0.5;
    const ocrImage = isTextual
      ? canvas.toDataURL("image/jpeg", 0.85)
      : buildBinaryOcrCanvas(canvas).toDataURL("image/jpeg", 0.9);

    pages.push({
      index: i,
      dataUrl: canvas.toDataURL("image/jpeg", 0.85),
      ocrImage,
      width: vp.width,
      height: vp.height,
      lines,
      isTextual,
    });
  }
  return pages;
}

function ocrWorkerCount() {
  const cpus = typeof navigator !== "undefined" && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 2;
  return Math.min(6, Math.max(2, cpus));
}

/* هل الصفحة تحمل رأس مفردة بليبل رقم (مثل «رقم الكمبيوتر: 035627-30300104»)
   وليس مجرد أرقام مبالغ في أعمدة الصرف (لا يسبقها ليبل «رقم...»)؟ */
function hasLabeledNumber(text, numberPattern) {
  const norm = normalizeDigits(String(text || ""));
  const patterns = [
    numberPattern,
    "(?:صرف|كمبيوتر|وظيفي|شئون|عامل|كود)",
  ].filter(Boolean);
  return patterns.some((pattern) =>
    new RegExp(`رقم\\s*(?:ال)?${pattern}\\s*[:：]?\\s*[A-Za-z0-9]`).test(norm)
  );
}

function arabicNameTokens(name) {
  return String(name || "")
    .split(/\s+/)
    .filter((t) => /[\u0600-\u06FF]/.test(t));
}

/* هل الاسمين لنفس الشخص؟ يتشاركان في كلمة معتبرة (≥4 أحرف) أو أحدهما مجموعة فرعية
   من الآخر (اسم مجزأ بسبب اختلاف قراءة OCR بين صفحات نفس المفردة). */
function namesShareIdentity(a, b) {
  const ta = arabicNameTokens(a);
  const tb = arabicNameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.some((t) => t.length >= 4 && tb.includes(t))) return true;
  const setA = new Set(ta);
  const setB = new Set(tb);
  return setA.size <= setB.size
    ? [...setA].every((t) => setB.has(t))
    : [...setB].every((t) => setA.has(t));
}

function nameIsMoreComplete(a, b) {
  return (String(a).match(/[\u0600-\u06FF]/g) || []).length >
    (String(b).match(/[\u0600-\u06FF]/g) || []).length;
}

/* هل الاسم قراءة ضوضاء من ترويسة/تذييل/سطور قالب المرتب (مثل «نظام أوراكل للرواتب»،
   «حكومة»، «أمين الكلية»، «شيخوخة عجز ووفاه») — قراءة OCR لصفحة تتمة لا اسمَ موظفَ فيها؟
   هذه لا تُعدّ بداية مفردة ولا اسمًا صحيحًا. */
function isFooterNoiseName(name) {
  if (!name) return false;
  const norm = normalizeDigits(String(name))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .toLowerCase();
  return /اوراكل|اوركال|اوركل|الرواتب|مفردات|يعتمد|امين الكلية|امين الكليه|oracle|hrms|صافى|اجمالى|مستحقات|بيانات|الجدول|الشهر|السنة|حكومة|الحكومة|لحكومة|جمهورية|شيخوخة|عجز|وفاه|بدل|اصابة|تأمين|الريادة|الاشراف|الإشراف|امتحانات|دمغة|مجموع|خصم|منحة|نقابات|نوادى|اقساط|جودة|اساسى|استحقاق/.test(norm);
}

/* هل النص اسمُ موظف حقيقي (وليس سطر قالب أو قراءة OCR خاطئة)؟
   الاسم مقبولٌ فقط إذا حمل كلمة من قاموس الأسماء العربية الشائعة إلى جانب ألا يكون
   ضجيج قالب. أي صوت آخر (اسم من كلمة واحدة، سطر مرتب، تذييل…) يُدمج في المفردة السابقة. */
function isPlausibleEmployeeName(name) {
  if (!name) return false;
  if (isFooterNoiseName(name)) return false;
  const tokens = arabicNameTokens(name);
  if (tokens.length < 2) return false;
  if (tokens.some((t) => t.length >= 2 && KNOWN_ARABIC_NAMES.has(t))) return true;
  /* اسم مركّب طويل بلا كلمات قاموسية معروفة (أسماء غير شائعة مثل «بولا وجدى نصيف عزيز») —
     سطر قالب المرتب لا يبلغ 4 كلمات عربية خالصة أبدًا، فيُقبل كاسم شخص حقيقي. */
  return tokens.length >= 4 && tokens.every((t) => t.length >= 3);
}

/* تقسيم الصفحات إلى مفردات: الصفحات المتتالية لنفس مفردة المرتب مرتبطة ببعضها.
   الصفحة التكميلية ترث تلقائيًا (رقم/اسم) من أقرب صفحة سابقة موثوقة لنفس المفردة،
   ولا تُنسخ بيانات أي موظف إلى مفردة جديدة (تُصفَّر الوراثة عند بداية مفردة جديدة).

   بداية مفردة جديدة تُكتشف فقط من رأس حقيقي:
   - شهر/سنة مختلف في رأس الصفحة، أو
   - رأس بليبل رقم بخلاف رقم المفردة الحالية (أو رأس برقم عندما لا يوجد رقم بعد)، أو
   - اسم موثوق مختلف تمامًا عن اسم المفردة الحالية.

   أي رقم مختلف بلا ليبل (أرقام مبالغ أعمدة الصرف) أو اسم مجزأ جزئيًا في صفحة بلا رأس
   لا يفتح مفردة جديدة؛ الصفحة تُلحق بنفس المفردة وترث القيم الناقصة.
*/
function groupPagesByNumber(pages, numberPattern) {
  const groups = [];
  let current = null;
  /* آخر قيمة موثوقة لكل حقل داخل مجموعة المفردة الحالية — تَرِث منها الصفحات التكميلية */
  let inheritedNumber = "";
  let inheritedName = "";

  pages.forEach((p) => {
    const hasNumber = Boolean(p.detectedNumber);
    const hasName = Boolean(p.detectedName);
    const labeledNumber = hasLabeledNumber(p.text, numberPattern);
    const pYm = p.detectedYearMonth || null;

    if (!current) {
      current = {
        number: p.detectedNumber || "",
        name: p.detectedName || "",
        yearMonth: p.detectedYearMonth || null,
        ownLabeledNumber: labeledNumber && hasNumber ? p.detectedNumber : "",
        pageIndexes: [p.index],
        dataUrls: [p.dataUrl],
      };
      inheritedNumber = hasNumber ? p.detectedNumber : "";
      inheritedName = hasName ? p.detectedName : "";
      return;
    }

    const cYm = current.yearMonth || null;
    const ymBreak =
      pYm && pYm.month && cYm && cYm.month &&
      (pYm.month !== cYm.month || (pYm.year && cYm.year && pYm.year !== cYm.year));

    const sameKey =
      hasNumber && inheritedNumber && groupKeyFor(p.detectedNumber) === groupKeyFor(inheritedNumber);

    /* رأس حقيقي بليبل رقم: مختلف عن رقم المفردة الحالية، أو أول رقم مقروء للمفردة */
    const newLabeledNumber =
      labeledNumber && (!inheritedNumber || (hasNumber && !sameKey));

    /* اسم موثوق مختلف تمامًا (بلا رأس رقمي) => بداية مفردة جديدة.
       يُشترط أن يكون الاسم اسمَ شخص حقيقي (وليس سطر قالب/تتمة مثل «حكومة» أو «جودة») */
    const newDifferentName =
      hasName && inheritedName && isPlausibleEmployeeName(p.detectedName) &&
      !namesShareIdentity(p.detectedName, inheritedName);

    if (ymBreak || newLabeledNumber || newDifferentName) {
      /* بداية مفردة جديدة: تصفير الوراثة حتى لا تُنسخ بيانات الموظف السابق بالخطأ */
      groups.push({ ...current, needsReview: !current.number || !current.name });
      current = {
        number: p.detectedNumber || "",
        name: p.detectedName || "",
        yearMonth: p.detectedYearMonth || null,
        ownLabeledNumber: labeledNumber && hasNumber ? p.detectedNumber : "",
        pageIndexes: [p.index],
        dataUrls: [p.dataUrl],
      };
      inheritedNumber = hasNumber ? p.detectedNumber : "";
      inheritedName = hasName ? p.detectedName : "";
      return;
    }

    /* صفحة تكميلية لنفس المفردة: تُلحق وترث القيمة الناقصة من آخر صفحة سابقة موثوقة */
    current.pageIndexes.push(p.index);
    current.dataUrls.push(p.dataUrl);
    if (!hasNumber && !hasName) current.missingHeader = (current.missingHeader || 0) + 1;
    if (!current.yearMonth && p.detectedYearMonth) current.yearMonth = p.detectedYearMonth;
    if (labeledNumber && hasNumber) current.ownLabeledNumber = p.detectedNumber;

    /* الرقم: يُورَّث ولا يُستبدل بقيمة صحيحة. يُحدَّث فقط برقم يطابق مفتاح نفس المفردة؛
       وأرقام المبالغ (بلا ليبل) في الصفحات التكميلية لا تلمس رقم المفردة أصلًا. */
    if (hasNumber && sameKey) {
      inheritedNumber = p.detectedNumber;
      current.number = p.detectedNumber;
    }

    /* الاسم: يُورَّث ولا يُستبدل إلا بمرشّح لنفس الشخص وأكثر اكتمالًا */
    if (hasName && (!inheritedName || nameIsMoreComplete(p.detectedName, inheritedName))) {
      inheritedName = p.detectedName;
      current.name = p.detectedName;
    }
  });

  if (current) groups.push({ ...current, needsReview: !current.number || !current.name });

  /* دمج مفردات «صفحة ونص»: في الملفات الممسوحة يظهر ذيل مفردة المرتب (تتمة الصفحة)
     كمفردة منفصلة فارغة الاسم والرقم. أي مفردة لاحقة بلا اسم تُدمج تلقائيًا في المفردة
     السابقة وترث اسمَها ورقمَ كمبيوترها وتُعدّ جزءًا من نفس المفردة. */
  return mergeHeaderlessGroups(groups);
}

/* دمج أي مفردة لاحقة لا تثبت أنها موظف جديد حقيقي في المفردة السابقة مع وراثة اسمها
   ورقمها — تُستخدم لالتقاط حالة «صفحة ونص» حيث تتمة المفردة السابقة تأتي كمفردة منفصلة.

   القاعدة العامة (تُطبق على كل الملفات): المفردة اللاحقة تبقى منفصلة فقط إذا حملت
   معًا (1) رقم كمبيوتر مُسمّى بليبل مختلف عن رقم المفردة السابقة، و(2) اسم موظف حقيقي.
   أي صورة ناقصة — تتمة صفحة، ضجيج تذييل «حكومة»/«نظام أوراكل»/سطر مرتب، اسم مجزأ،
   رقم مبلغ بلا ليبل، أو رأس بلا رقم مقروء — تُدمج تلقائيًا في المفردة السابقة. */
function mergeHeaderlessGroups(groups) {
  const merged = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const prevKey = prev.number ? groupKeyFor(prev.number) : "";
      const ownKey = g.ownLabeledNumber ? groupKeyFor(g.ownLabeledNumber) : "";
      const hasDifferentLabeledNumber = Boolean(ownKey && prevKey && ownKey !== prevKey);
      const isRealNewEmployee = hasDifferentLabeledNumber && isPlausibleEmployeeName(g.name);
      if (!isRealNewEmployee) {
        prev.pageIndexes.push(...g.pageIndexes);
        prev.dataUrls.push(...g.dataUrls);
        prev.missingHeader = (prev.missingHeader || 0) + (g.missingHeader || 0) + 1;
        prev.needsReview = !prev.number || !prev.name;
        continue;
      }
    }
    merged.push(g);
  }
  return merged;
}

const MONTH_KEYWORDS = [
  { n: 1, names: ["يناير", "يانيير", "جناير", "جانفي", "كانون الثاني"] },
  { n: 2, names: ["فبراير", "فبرايه", "فبراير", "فبرایر", "فيفري", "شباط"] },
  { n: 3, names: ["مارس", "مارش"] },
  { n: 4, names: ["ابريل", "أبريل", "إبريل", "افريل", "أفريل"] },
  { n: 5, names: ["مايو", "مايه", "مایو"] },
  { n: 6, names: ["يونيو", "يونية", "يونيه", "جوان", "يونیو"] },
  { n: 7, names: ["يوليو", "يولية", "يوليه", "جويلية", "يولیو"] },
  { n: 8, names: ["اغسطس", "أغسطس", "أوت", "غشت"] },
  { n: 9, names: ["سبتمبر", "شتنبر"] },
  { n: 10, names: ["اكتوبر", "أكتوبر", "تشرين الاول"] },
  { n: 11, names: ["نوفمبر", "نونبر", "تشرين الثاني"] },
  { n: 12, names: ["ديسمبر", "ديسمببر", "دجنبر", "كانون الأول"] },
];

/* الشهر والسنة من رأس المفردة: أسماء الشهور العربية (بأشكالها) + سنة 19xx/20xx قريبة،
   أو صيغة رقمية مثل "شهر 2/2019". إذا لم يوجد -> null (يُستخدم افتراضي الملف). */
function extractYearMonthFromText(text) {
  const norm = normalizeDigits(String(text || ""));
  const compact = norm.replace(/\s+/g, " ");

  const numeric = compact.match(/\bشهر\s*[:：]?\s*(\d{1,2})\s*[/\\-]\s*((?:19|20)\d{2})\b/)
    || compact.match(/\b(\d{1,2})\s*[/\\-]\s*((?:19|20)\d{2})\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    const year = Number(numeric[2]);
    if (month >= 1 && month <= 12 && year >= 1960 && year <= 2099) return { month, year };
  }

  for (const mk of MONTH_KEYWORDS) {
    const hitIndex = norm.search(new RegExp(mk.names.join("|")));
    if (hitIndex === -1) continue;
    const windowText = norm.slice(Math.max(0, hitIndex - 30), hitIndex + 40);
    const yearMatch = windowText.match(/\b(?:19|20)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0]) : null;
    return year ? { month: mk.n, year } : { month: mk.n, year: null };
  }

  const genericYear = norm.match(/\b(?:19|20)\d{2}\b/);
  return genericYear ? { month: null, year: Number(genericYear[0]) } : null;
}

/* رقم الموظف: نفضل ليبلات الأرشيف الحالي (مثل "رقم العامل" للموظفين، "رقم الصرف" لهيئة التدريس)،
   ثم باقي الليبلات، وإلا نستدل بالتكرار */
function extractNumberFromText(text, numberPattern) {
  const norm = normalizeDigits(text);
  const patterns = [
    numberPattern,
    "(?:صرف|كمبيوتر|وظيفي|شئون|عامل|كود)",
  ].filter(Boolean);
  for (const pattern of patterns) {
    const labeled = norm.match(new RegExp(`رقم\\s*(?:ال)?${pattern}\\s*[:：]?\\s*([A-Za-z0-9][A-Za-z0-9_\\- ]+)`));
    if (labeled) {
      let value = labeled[1].replace(/\s+/g, "").replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9]+$/, "");
      if (/^[0-9A-Za-z_-]+$/.test(value)) {
        /* تصحيح تشابه القراءة الأوتوماتيكية (0/O، 5/S، 8/B...) لكن فقط عندما تكون
           القيمة رقمية بالأساس (≥80% أرقام) حتى لا نتلف أكوادًا حرفية مثل BE_330014 */
        const sep = value.replace(/[_-]/g, "");
        const digitRatio = sep.length ? (sep.match(/\d/g) || []).length / sep.length : 0;
        if (digitRatio >= 0.8) {
          value = value
            .replace(/[Oo]/g, "0")
            .replace(/[lI]/g, "1")
            .replace(/[Ss]/g, "5")
            .replace(/[Bb]/g, "8")
            .replace(/[Zz]/g, "2")
            .replace(/[Gg]/g, "6");
        }
      }
      if (!/^[0-9A-Za-z_-]+$/.test(value)) return null;
      return value;
    }
  }
  const lineInfo = text.split("\n").map((raw) => {
    const n = normalizeDigits(raw);
    const isMoneyLine = /\b(جنيه|ج\.م|جنيها?|EGP|LE|£|دولار|ريال|ميه|الف)\b/i.test(n);
    return { norm: n, isMoneyLine };
  });
  const counts = {};
  const all = [];
  lineInfo.forEach(({ norm: n, isMoneyLine }) => {
    (n.match(/\b\d{4,8}\b/g) || []).forEach((t) => {
      const num = Number(t);
      if (num >= 1960 && num <= 2099) return;
      if (isMoneyLine) return;
      counts[t] = (counts[t] || 0) + 1;
      all.push(t);
    });
  });
  if (all.length === 0) return null;
  const ranked = Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length
  );
  const preferred = ranked.filter(([t]) => t.length >= 5);
  return (preferred.length ? preferred : ranked)[0][0];
}

/* مفتاح تجميع الصفحات: الجزء قبل الشرطة (الرقم الثابت للموظف) مع الحفاظ على الحروف والشرطة السفلية
   مثال: "30300104-003665" -> "30300104" ، "BE_330014" -> "BE_330014" */
function groupKeyFor(number) {
  const raw = (number || "").split("-")[0].replace(/[^A-Za-z0-9_]/g, "");
  return raw || String(number || "");
}

const NUMBER_LABELS = "(?:عامل|صرف|كمبيوتر|وظيفي|شئون|كود)";

/* استخراج رقم الموظف من سطر الليبل فقط: القيمة الملاصقة لكلمة «رقم» على نفس السطر
   (آخر رقم بجوار الليبل رغم ترتيب RTL)، تُحفظ كسلسلة نصية كما هي (٠٣٥٠٠٤ -> "035004").
   يُستهلك فقط التوابع الرقمية المتلاصقة («03524» + «1») أو رمز واحد ألواني (BE_330014) —
   ولا يلتقط أي رقم آخر في الصفحة. */
function extractNumberBesideLabel(lines) {
  if (!Array.isArray(lines)) return null;
  for (const line of lines) {
    const n = normalizeDigits(line.text).replace(/\s+/g, " ");
    if (!new RegExp(`رقم\\s*(?:ال)?${NUMBER_LABELS}`).test(n)) continue;
    const words = line.words || [];
    const labelIdx = words.findIndex((w) => normalizeDigits(w.text).includes("رقم"));
    if (labelIdx === -1) continue;
    const next = words[labelIdx + 1];
    if (!next) continue;
    const first = normalizeDigits(next.text);
    let value = null;
    if (/^[0-9]+$/.test(first)) {
      value = first;
      for (let i = labelIdx + 2; i < words.length; i += 1) {
        const t = normalizeDigits(words[i].text);
        if (!/^[0-9]+$/.test(t)) break;
        value += t;
      }
    } else if (/^[A-Za-z0-9_-]+$/.test(first) && /\d/.test(first)) {
      value = first;
    }
    if (value) return value.replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9]+$/, "");
  }
  return null;
}

const JUNK_WORDS = [
  "اجمالي","إجمالي","الإجمالي","الاجمالي","الصافي","المستقطع","صافي","مستقطع","بدلات","حوافز","الحوافز",
  "المرتب","مرتب","راتب","استحقاق","نقدي","جنيه","ج.م","مقدار","تعلن","إدارة","ادارة","شئون","الأمن","امن",
  "الموارد","البشرية","جداول","الجدول","حساب","مالية","المالية","البنك","المصرف","مكتب","مديرية","جامعة",
  "كلية","قسم","شهر","سنة","سنوى","دفع","مستحق","تأمين","علاوة","حافز","كادر","درجة","وظيف","مكأفاة",
  "مكافأة","مجموع","اللجنة","النقابات","مستحقات","أجور","اجور","تكليف","حوالة","ملاحظات","ملاحظة",
  "البيانات","عدد","قيمة","صفحة","مرتبات","الشهر",
  "القومي","الرقم","الكود","اوركال","الاوركال","اوركل","ضريبة","الضرائب","الاستقطاع","استقطاع",
  "الخصم","الخصومات","التأسيسي","الاساسي","الأساسي","المستندات","التاريخ","الدرجة","الدرجه",
  "اوراكل","أوراكل","اوركل","اوركال","الرواتب","مفردات","يعتمد","أمين الكلية","امين الكلية","oracle","hrms",
  "حكومة","الحكومة","لحكومة","الجمهورية","جمهورية","مصرية",
];

/* سطور التسميات (Labels) التي قد تُتخَطّف كاسم بالخطأ — مثل "الرقم القومي" ثم رقم قومي طويل */
const LABEL_PREFIX_RE = /^(?:رقم|الرقم|كود|الكود|اوركال|الاوركال|اوركل|القومي|المصرف|البنك|الدرجة|الدرجه|التاريخ|ملاحظات|الأساسي|الاساسي|التأسيسي|اسم|الاسم)\b/;

/* كلمات تُرفض من مرشّح الاسم مهما كان مساره */
const LABEL_TOKENS = [
  "القومي", "الرقم", "الكود", "اوركال", "الاوركال", "اوركل", "قومي",
  "الدرجة", "الدرجه", "التاريخ", "ملاحظات", "الملاحظات", "المصرف",
];

/* الاسم: أول سطر عربي نقي خالي من الأرقام والكلمات الدخيلة، أو من جنب ليبلات الاسم المباشرة */
function hasJunkWord(line) {
  return JUNK_WORDS.some((w) => line.includes(w));
}

/* ألقاب/وظائف تُقص من نهاية الاسم المستخرج من رأس المفردة */
const TITLE_TAILS = [
  "أستاذ متفرغ", "الأستاذ المتفرغ", "الاستاذ المتفرغ", "المتفرغ", "متفرغ",
  "مدرس مساعد", "مدرس أول", "أستاذ مساعد", "أستاذ", "الأستاذ", "الاستاذ",
  "دكتور", "الدكتور", "معلم أول", "معلم خبير", "معلم", "مدرس",
  "مهندس", "باحث", "صراف أول", "صراف", "هيئة تدريس", "هيئة", "تدريس",
];

/* قاموس أسماء عربية شائعة (أوائل + ألقاب/عائلات) للكشف عن الكلمات المقلوبة في Text Layer
   مثل "دمحم" -> "محمد" أو "دومحم" -> "محمود". يُقلب فقط إذا كان المعكوس اسمًا معروفًا
   والأصل ليس اسمًا حقيقيًا معروفًا (حماية لأسماء حقيقية مثل "رهام"/"ماهر"). */
const KNOWN_ARABIC_NAMES = new Set(`
محمد احمد أحمد عبد الله عبدالله عبد الرحمن عبدالرحمن عبد الرزاق عبدالرزاق عبد الحميد عبدالحميد عبد الغني عبدالغني
عبد الفتاح عبدالفتاح عبد المنعم عبدالمنعم عبد العظيم عبدالعظيم عبد الحليم عبدالحليم عبد العزيز عبدالعزيز علي على
حسن حسين حسيني الحسينى الحسيني الحسن حسنى مصطفى محمود اسماعيل اسماعیل إسماعيل ابراهيم إبراهيم يوسف يعقوب
عمر عمرو خالد طارق سامي سمير سعيد سعد سيد صالح صلاح شريف شوقي شوقى عصام عادل عاطف أشرف أكرم أكمل
الهام عفيفي عبدالله عبدالرحمن عبدالرزاق عبدالحميد عبدالغني عبدالفتاح عبدالمنعم رشاد رضوان رفعت رمضان
سماحة سامية سوسن سناء شادية صفوت ضياء طه طلعت عبود غريب حامد حماد حلمي حمدي خليل خميس دسوقي ذكي رأفت
رؤوف زكي زمزم شعبان صابر عامر فاروق فؤاد فيروز كمال لطفي لطفى لويس ماجد ممدوح منير نجلاء نادية هدى هند
وائل وليد ياسر يسري مجدي محسن محفوظ مجاهد منصور نور الدين نورالدين طارق الدين اسلام إسلام ايمان إيمان شيماء
سمر دعاء رهام ماهر وسام وليد منال منى سالي هالة نيفين جيهان امل أمل اسماء أسماء أماني رانيا ريهام غادة هبة
اميرة أميرة اسامة أسامة ايهاب إيهاب بسيونى بسيوني جمال جمعة جابر جاد جرجس جرجس جارحي خطاب خاطر رجب رمزى
رمزي رفاعي الرفاعي السيد الشيحة الشناوى شلبي صادق صبري صباح صفا طيبة ظريف الغريب الغريب الفاوي القاضي
القداح الكاشف اللبيدي المتولي النجار الوكيل بطرس بخيت بركات برهام بشرى بهاء توفيق تمام ثروت جادو جرج
حامد حبيب حسن حسنين حلمى حنا داود دسوقى دهب راضي رشيد رشيدي سعداوي سلامة سليمان سمرة شاهين شحاتة
شكري شهاب صالح صيام طحا عبد المطلب عبدالمطلب عبده عبد الجواد عبدالجواد عبد الحفيظ عبدالحفيظ عبد الخالق
عبدالخالق عبد السلام عبدالسلام عبد الصمد عبدالصمد عبد الغفار عبدالغفار عبد الله عبدالله عبد الوهاب عبدالوهاب
عبيد عثمان عز الدين عزاللدين عزام عزت عياد غانم غنيم فرج فتح الله فتحي فتحى فرحات فريد فهمى فهمي فياض
قاسم قناوي كامل كامل لبيب لطفى مجاهد محجوب محرز مسعد مطر مفتاح مهدى مهدي ناجي ناصر نبيه نجيب هنداوي
هيكل وجدي وحيد وديع ياسين ياقوت يعقوب هشام هيثم عمرو رأفت سمير وائل أكمل صفاء وفاء
`.trim().split(/\s+/));

/* تصحيح أخطاء Text Layer في الاسم: تطبيع الليغاتورات (ﻼ->لا، ﷲ->الله) +
   قلب الكلمات المقلوبة المرشّحة (المعكوس اسم معروف والأصل غير معروف) */
function fixNameSpelling(name) {
  if (!name) return name;
  const norm = String(name).normalize("NFKC");
  const tokens = norm.split(/\s+/).filter(Boolean);
  return tokens
    .map((tok) => {
      const arabic = (tok.match(/[\u0600-\u06FF]/g) || []).length;
      if (tok.length < 3 || arabic < tok.length * 0.7) return tok;
      const rev = [...tok].reverse().join("");
      if (KNOWN_ARABIC_NAMES.has(tok)) return tok;
      if (KNOWN_ARABIC_NAMES.has(rev)) return rev;
      return tok;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTitleTail(raw) {
  let name = String(raw || "").trim();
  for (const t of TITLE_TAILS) {
    const idx = name.indexOf(t);
    if (idx !== -1) {
      const before = name.slice(0, idx).trim();
      if (before.length >= 3) {
        name = before;
        break;
      }
    }
  }
  return name.trim();
}

function cleanNamePart(raw) {
  let name = String(raw || "").trim();
  name = name
    .split(/رقم\s*(?:ال)?(?:صرف|كمبيوتر|عامل|وظيفي|شئون)[:：]?\s*[\d- ]*/)[0]
    .trim();
  name = name.replace(/^[\s•،.,،:：-]+/, "").replace(/[\s•،.,،:：-]+$/, "").trim();
  if (name.length < 3 || /^\d/.test(name)) return null;
  /* قص أي أرقام متبقّية (مثل أسطر الرقم القومي) */
  name = name.split(/\d/, 1)[0].trim();
  if (name.length < 3) return null;
  name = name.replace(
    /^(السيد|السيدة|الاستاذ|الأستاذ|الدكتور|الاستاذ الدكتور|الأستاذ الدكتور|أ\.د|د\/|م\/|أ\/|د\.)\s*/,
    ""
  ).trim();
  name = stripTitleTail(name);
  if (name.length < 3) return null;
  /* رفض أي مرشّح يحمل كلمة تسمية (القومي/الكود/اوركال...) مهما كان مساره */
  if (LABEL_TOKENS.some((w) => name.includes(w))) return null;
  name = fixNameSpelling(name);
  return name.length >= 3 ? name : null;
}

function extractNameFromText(text) {
  const norm = normalizeDigits(text);

  /* الرقم + الاسم: الاسم يظهر بعد الرقم على نفس السطر أو السطر التالي مباشرة،
     وقد تلحقه أرقام مبالغ (أعمدة صرف) تُقص عند أول رقم بالاسم. */
  const labeled = norm.match(
    new RegExp(`رقم\\s*(?:ال)?(?:صرف|كمبيوتر|وظيفي|شئون|عامل|كود)\\s*[:：]?\\s*([0-9][0-9 \\-]*)`)
  );
  if (labeled) {
    const headEnd = (labeled.index || 0) + labeled[0].length;
    const contLine = norm
      .slice(headEnd)
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (contLine) {
      const candidate = contLine.split(/\d/, 1)[0].trim();
      const name = cleanNamePart(candidate);
      if (name) return name;
    }
  }

  const labeledName = norm.match(/(?:اسم|الاسم)\s*(?:ال)?موظف\s*[:：]?\s*([^\n]+)/);
  if (labeledName) {
    const name = cleanNamePart(labeledName[1]);
    if (name) return name;
  }

  /* الخطوط النقية: أي سطر عربي يبدأ بالاسم يتقدم، وقد تلحقه أعمدة أرقام (مبالغ) تُقص */
  const lines = norm.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 4) continue;
    const candidate = line.split(/\d/, 1)[0].trim();
    if (candidate.length < 3 || candidate.length > 60) continue;
    if (LABEL_PREFIX_RE.test(candidate)) continue;
    if (hasJunkWord(candidate)) continue;
    const letters = candidate.replace(/[^\u0600-\u06FF]/g, "");
    if (letters.length < candidate.length * 0.55) continue;
    const name = cleanNamePart(candidate);
    if (name) return name;
  }
  return null;
}

function dataUrlToBlob(dataUrl) {
  const [, data] = dataUrl.split(",");
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

function cropDataUrl(dataUrl, y0, y1) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = Math.max(1, Math.round(y1 - y0));
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, y0, img.width, y1 - y0, 0, 0, img.width, y1 - y0);
        resolve(c.toDataURL("image/jpeg", 0.85));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/* تحويل إحداثيات بلوكات OCR إلى سطور نصية مصفوفة حسب الموضع */
function wordsToLines(blocks) {
  if (!Array.isArray(blocks)) return [];
  const words = [];
  blocks.forEach((b) => {
    (Array.isArray(b.words) ? b.words : []).forEach((w) => {
      if (!w || !w.bbox) return;
      const t = String(w.text || "").trim();
      if (t && /[\u0600-\u06FFA-Za-z0-9]/.test(t)) {
        words.push({ text: t, y: w.bbox.y0, x0: w.bbox.x0 || 0, y1: w.bbox.y1 || w.bbox.y0 });
      }
    });
  });
  if (words.length === 0) return [];
  words.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines = [];
  let cur = [];
  let curY = null;
  words.forEach((w) => {
    if (curY === null || Math.abs(w.y - curY) <= 12) {
      cur.push(w);
      curY = curY === null ? w.y : Math.min(curY, w.y);
    } else {
      lines.push({ y: cur[0].y, y1: Math.max(...cur.map((c) => c.y1)), text: cur.map((c) => c.text).join(" ") });
      cur = [w];
      curY = w.y;
    }
  });
  if (cur.length) lines.push({ y: cur[0].y, y1: Math.max(...cur.map((c) => c.y1)), text: cur.map((c) => c.text).join(" ") });
  return lines;
}

/* كشف حدود المفردات داخل الصفحة الواحدة (مفردة «صفحة ونص»):
   - أكثر من رقم مختلف => فصل بين توابعهم
   - رقم واحد منخفض عن أعلى الصفحة مع محتوى رقمي أعلى منه => أعلى الصفحة تذييل مفردة سابقة */
function findPageSplits(blocks, numberPattern, pageHeight) {
  const lines = wordsToLines(blocks);
  if (lines.length === 0) return null;

  const anchors = [];
  lines.forEach((line) => {
    const text = normalizeDigits(line.text.replace(/\s+/g, " "));
    const num = extractNumberFromText(text, numberPattern);
    if (num) anchors.push({ number: num, y: line.y });
  });

  const distinct = [];
  anchors.forEach((a) => {
    const key = groupKeyFor(a.number);
    const existing = distinct.find((d) => d.key === key);
    if (existing) {
      if (a.y < existing.y) existing.y = a.y;
    } else {
      distinct.push({ key, number: a.number, y: a.y });
    }
  });
  distinct.sort((a, b) => a.y - b.y);

  if (distinct.length > 1) {
    return { splitLines: distinct.slice(1).map((d) => d.y), type: "multi" };
  }

  if (distinct.length === 1 && distinct[0].y > pageHeight * 0.3) {
    const topLines = lines.filter((l) => l.y < distinct[0].y);
    const topHasDigits = topLines.some((l) => /\d/.test(l.text));
    if (topLines.length > 0 && topHasDigits) {
      return { splitLines: [distinct[0].y], type: "tail" };
    }
  }

  return null;
}

/* قص الصفحة لأجزاء حسب حدود الرؤوس، مع نص OCR خاص بكل جزء */
async function segmentPageFromSplits(page, info) {
  const bounds = [0, ...info.splitLines, page.height];
  const lines = wordsToLines(page._blocks || []);
  const segments = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const y0 = bounds[i];
    const y1 = bounds[i + 1];
    const segLines = lines.filter((l) => l.y >= y0 - 6 && l.y < y1 + 6);
    const text = segLines.map((l) => l.text).join("\n");
    const dataUrl = await cropDataUrl(page.dataUrl, y0, y1);
    segments.push({ dataUrl, text, height: y1 - y0 });
  }
  return segments;
}

/* تقسيم صفحة Text Layer إلى أجزاء حسب مواضع سطور الرأس («رقم العامل»):
   - أكثر من رأس -> قص عند كل رأس تالٍ
   - رأس واحد منخفض (نتيجة «صفحة ونص») -> الجزء العلوي تذييل المفردة السابقة */
function segmentTextPage(page) {
  const lines = Array.isArray(page.lines) ? page.lines : [];
  if (lines.length === 0) return [{ y0: 0, y1: page.height, lines }];
  const labels = [];
  lines.forEach((l, i) => {
    if (new RegExp(`رقم\\s*(?:ال)?${NUMBER_LABELS}`).test(normalizeDigits(l.text).replace(/\s+/g, " "))) {
      labels.push({ i, y: l.y });
    }
  });
  const splits = [];
  if (labels.length > 1) {
    labels.slice(1).forEach((l) => splits.push(l.y));
  } else if (labels.length === 1 && labels[0].y > page.height * 0.3) {
    const topHasDigits = lines.filter((l) => l.y < labels[0].y).some((l) => /\d/.test(l.text));
    if (topHasDigits) splits.push(labels[0].y);
  }
  const bounds = [0, ...splits, page.height];
  const segments = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const y0 = bounds[i];
    const y1 = bounds[i + 1];
    segments.push({ y0, y1, lines: lines.filter((l) => l.y >= y0 - 6 && l.y < y1 + 6) });
  }
  return segments;
}

function createToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

let batchSeq = 0;

export default function OcrSplitPanel({ currentUser, onImportComplete, onBack, config }) {
  const cfg = config || FACULTY_SALARY_CONFIG;
  const ARCHIVE_TABLE = cfg.table;
  const BUCKET = cfg.bucket;
  const storageRoot = cfg.storageRoot;
  const NAME_COL = cfg.nameColumn;

  const [phase, setPhase] = useState("setup");
  const [selections, setSelections] = useState([]);
  const [progress, setProgress] = useState("");
  const [batches, setBatches] = useState([]);
  const [activeBatchIdx, setActiveBatchIdx] = useState(0);
  const [memberNames, setMemberNames] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const addFiles = (e) => {
    const incoming = [...(e.target.files || [])];
    const now = new Date();
    const mapped = incoming.map((f) => ({
      id: `sel-${batchSeq++}`,
      file: f,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    }));
    setSelections((cur) => [...cur, ...mapped]);
    e.target.value = "";
  };

  const removeSelection = (id) => setSelections((cur) => cur.filter((s) => s.id !== id));

  const updateSelection = (id, field, value) =>
    setSelections((cur) => cur.map((s) => (s.id === id ? { ...s, [field]: value } : s)));

  /* قراءة كل الملفات بالتوازي + مطابقة مع الأرشيف بعد القراءة */
  const startAll = useCallback(async () => {
    if (selections.length === 0) return;
    setPhase("processing");
    setError("");
    try {
      const fileMeta = [];
      for (let fi = 0; fi < selections.length; fi += 1) {
        const sel = selections[fi];
        const pages = await renderAllPages(sel.file, (p) =>
          setProgress(`تحويل صفحات الملف ${fi + 1}/${selections.length}: ${sel.file.name} — ${p}`)
        );
        fileMeta.push({ id: sel.id, fileName: sel.file.name, file: sel.file, year: sel.year, month: sel.month, pages });
      }

      /* فصل الصفحات: صفحات بنص مطبوع حقيقي (Text Layer) تُقرأ مباشرة،
         وصفحات بلا نص تُرسل إلى OCR كخيار احتياطي فقط */
      const textPages = [];
      const ocrPages = [];
      fileMeta.forEach((fm, fi) => {
        fm.pages.forEach((page) => {
          if (page.isTextual) textPages.push({ fi, page });
          else ocrPages.push({ fi, page });
        });
      });
      const totalPages = fileMeta.reduce((s, fm) => s + fm.pages.length, 0);

      const buckets = fileMeta.map(() => []);

      /* 1) الصفحات النصية: استخراج مباشر من Text Layer بإحداثياته (بلا OCR) */
      let textDone = 0;
      for (const { fi, page } of textPages) {
        const segments = segmentTextPage(page);
        const multi = segments.length > 1;
        for (let si = 0; si < segments.length; si += 1) {
          const seg = segments[si];
          const text = seg.lines.map((l) => l.text).join("\n");
          const dataUrl = multi ? await cropDataUrl(page.dataUrl, seg.y0, seg.y1) : page.dataUrl;
          buckets[fi].push({
            index: page.index,
            dataUrl,
            ocrImage: dataUrl,
            width: page.width,
            height: seg.y1 - seg.y0,
            text,
            detectedNumber:
              extractNumberBesideLabel(seg.lines) ||
              extractNumberFromText(text, cfg.numberPattern) ||
              "",
            detectedName: extractNameFromText(text) || "",
            detectedYearMonth: extractYearMonthFromText(text),
          });
        }
        textDone += 1;
        setProgress(`قراءة النصوص المطبوعة: ${textDone} من ${textPages.length} صفحة...`);
      }

      /* 2) الصفحات بلا نص: OCR فقط لها */
      if (ocrPages.length > 0) {
        const scheduler = createScheduler();
        const nWorkers = Math.min(ocrWorkerCount(), Math.max(1, ocrPages.length));
        for (let w = 0; w < nWorkers; w += 1) await scheduler.addWorker(await createWorker("ara+eng"));

        let done = 0;
        const recognized = await Promise.all(
          ocrPages.map(async (job) => {
            let result;
            try {
              result = await scheduler.addJob("recognize", job.page.ocrImage, {}, { text: true, blocks: true });
            } catch {
              result = await scheduler.addJob("recognize", job.page.ocrImage, {}, { text: true });
            }
            done += 1;
            setProgress(`OCR (صفحات بلا نص): ${done} من ${ocrPages.length} صفحة...`);
            return { fi: job.fi, page: job.page, data: result.data };
          })
        );
        await scheduler.terminate();

        for (const r of recognized) {
          const data = r.data;
          const page = r.page;
          page._blocks = data.blocks;

          /* صفحة واحدة قد تضم مفردتين («صفحة ونص»): تذييل مفردة سابقة أعلى + رأس التالية أسفل
             -> قصّها عند حدود الرأس واقرأ كل جزء على حدة */
          const info = Array.isArray(data.blocks)
            ? findPageSplits(data.blocks, cfg.numberPattern, page.height)
            : null;

          if (info) {
            const segments = await segmentPageFromSplits(page, info);
            segments.forEach((seg) => {
              buckets[r.fi].push({
                index: page.index,
                dataUrl: seg.dataUrl,
                ocrImage: seg.dataUrl,
                width: page.width,
                height: seg.height,
                text: seg.text || data.text,
                detectedNumber: extractNumberFromText(seg.text || data.text, cfg.numberPattern) || "",
                detectedName: extractNameFromText(seg.text || data.text) || "",
                detectedYearMonth: extractYearMonthFromText(seg.text || data.text),
              });
            });
          } else {
            const pageRest = { ...page };
            delete page._blocks;
            delete page.lines;
            delete page.textItems;
            buckets[r.fi].push({
              ...pageRest,
              text: data.text,
              detectedNumber: extractNumberFromText(data.text, cfg.numberPattern) || "",
              detectedName: extractNameFromText(data.text) || "",
              detectedYearMonth: extractYearMonthFromText(data.text),
            });
          }
        }
      }

      setProgress(`معاينة ${totalPages} صفحة من ${selections.length} ملف...`);

      let known = [];
      try {
        const { data, error: exErr } = await supabase
          .from(ARCHIVE_TABLE)
          .select(`computer_number, ${NAME_COL}, year, month`);
        if (!exErr) known = data || [];
      } catch { /* لا يمنع الاستيراد */ }

      const map = new Map();
      const dupSet = new Set();
      known.forEach((m) => {
        const key = normNumber(m.computer_number);
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        if (!map.get(key).includes(m[NAME_COL])) map.get(key).push(m[NAME_COL]);
        dupSet.add(`${m.computer_number}|${m.year}|${m.month}`);
      });
      setMemberNames([...new Set(known.map((m) => m[NAME_COL]).filter(Boolean))]);

      const builtBatches = buckets.map((pagesArr, fi) => {
        const groups = groupPagesByNumber(pagesArr, cfg.numberPattern);
        const fileYear = fileMeta[fi].year;
        const fileMonth = fileMeta[fi].month;
        const resolved = groups.map((g) => {
          const gYear = (g.yearMonth && g.yearMonth.year) || fileYear;
          const gMonth = (g.yearMonth && g.yearMonth.month) || fileMonth;
          const knownNames = map.get(normNumber(g.number)) || [];
          return {
            ...g,
            year: gYear,
            month: gMonth,
            yearAuto: Boolean(g.yearMonth && g.yearMonth.month),
            monthAuto: Boolean(g.yearMonth && g.yearMonth.month),
            knownNames,
            isDuplicate: dupSet.has(`${g.number}|${gYear}|${gMonth}`),
          };
        });
        return {
          id: fileMeta[fi].id,
          fileName: fileMeta[fi].fileName,
          file: fileMeta[fi].file,
          year: fileYear,
          month: fileMonth,
          duplicateCount: resolved.filter((gg) => gg.isDuplicate).length,
          groups: resolved.map((g, gi) => ({
            ...g,
            id: `g-${fileMeta[fi].id}-${gi}`,
          })),
        };
      });

      setBatches(builtBatches);
      setActiveBatchIdx(0);
      setPhase("review");
    } catch (err) {
      console.error("OCR error:", err);
      setError("خطأ في القراءة: " + err.message);
      setPhase("setup");
    }
  }, [selections]);

  const updateGroup = (batchIdx, groupIdx, field, value) =>
    setBatches((cur) =>
      cur.map((b, bi) =>
        bi !== batchIdx
          ? b
          : {
              ...b,
              groups: b.groups.map((g, gi) =>
                gi !== groupIdx ? g : { ...g, [field]: value, needsReview: false }
              ),
            }
      )
    );

  const removeGroup = (batchIdx, groupIdx) =>
    setBatches((cur) =>
      cur.map((b, bi) => (bi !== batchIdx ? b : { ...b, groups: b.groups.filter((_, gi) => gi !== groupIdx) }))
    );

  const importSingleBatch = async (batch) => {
    const incomplete = batch.groups.filter((g) => !g.number || !g.name);
    if (incomplete.length > 0) return { ok: false, msg: `ملف "${batch.fileName}": أكملي الرقم والاسم لكل مفردة قبل الاستيراد.` };
    const base = storageRoot;
    const monthFolder = `${String(batch.month).padStart(2, "0")}`;
    const safeName = batch.fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-40);
    const origPath = `${base}/${monthFolder}/original-${safeName}-${createToken()}.pdf`;
    const { error: origErr } = await supabase.storage.from(BUCKET).upload(origPath, batch.file, { contentType: "application/pdf", upsert: true });
    if (origErr) throw new Error(`${batch.fileName}: تعذر رفع الملف الأصلي: ${origErr.message}`);
    const { data: origPub } = supabase.storage.from(BUCKET).getPublicUrl(origPath);
    const duplicateGroups = [];
    const seenCombos = new Set();
    for (const g of batch.groups) {
      const combo = `${g.number}|${g.year}|${g.month}`;
      if (seenCombos.has(combo)) continue;
      seenCombos.add(combo);
      const { count } = await supabase
        .from(ARCHIVE_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("computer_number", String(g.number).trim())
        .eq("year", Number(g.year))
        .eq("month", Number(g.month));
      if ((count || 0) > 0) {
        duplicateGroups.push(g);
      }
    }
    if (duplicateGroups.length > 0) {
      const proceed = window.confirm(
        `ملف "${batch.fileName}": تم العثور على ${duplicateGroups.length} مفردة مسجلة بالفعل لنفس ${cfg.ocrNameLabel} في نفس السنة/الشهر.\n\n` +
          duplicateGroups.map((g) => `• ${g.number} — ${g.name} (${MONTH_NAMES[g.month - 1]} ${g.year})`).join("\n") +
          `\n\nسيتم إضافة نسخة إضافية ولن يُحذف السجل القديم. هل تريدين المتابعة؟`
      );
      if (!proceed) return { ok: false, msg: `ملف "${batch.fileName}": تم إلغاء الاستيراد بسبب وجود مفردات مكررة.` };
    }
    let ok = 0;
    for (let i = 0; i < batch.groups.length; i += 1) {
      const g = batch.groups[i];
      const gYear = Number(g.year || batch.year);
      const gMonth = Number(g.month || batch.month);
      const monthFolder = `${String(gMonth).padStart(2, "0")}`;
      const memberFolder = `${base}/${sanitizeForStorage(g.number)}/${gYear}/${monthFolder}`;
      const previewUrls = [];
      for (let j = 0; j < g.dataUrls.length; j += 1) {
        const pPath = `${memberFolder}/previews/page-${g.pageIndexes[j]}.jpg`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(pPath, dataUrlToBlob(g.dataUrls[j]), { contentType: "image/jpeg", upsert: true });
        if (upErr) throw new Error(`${g.name} — صفحة ${g.pageIndexes[j]}: ${upErr.message}`);
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(pPath);
        previewUrls.push(pub.publicUrl);
      }
      const rowData = {
        [NAME_COL]: g.name.trim(),
        computer_number: g.number.trim(),
        year: gYear,
        month: gMonth,
        sequence: g.pageIndexes[0],
        file_url: origPub.publicUrl,
        preview_url: previewUrls[0] || null,
        preview_urls: previewUrls,
        page_count: g.pageIndexes.length,
        file_path: origPath,
        original_filename: batch.fileName,
        created_by: currentUser?.full_name || currentUser?.username || null,
      };
      let insErr = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { error } = await supabase.from(ARCHIVE_TABLE).insert(rowData);
        insErr = error;
        if (!error) break;
        if (error.code === "23505") {
          rowData.sequence = (rowData.sequence || 0) + 100000 + Date.now() % 1000;
          continue;
        }
        break;
      }
      if (insErr) throw new Error(`${g.name}: ${insErr.message}`);
      ok += 1;
    }
    return { ok: true, count: ok };
  };

  const importAllBatches = async () => {
    setImporting(true);
    setError("");
    let total = 0;
    try {
      for (let bi = 0; bi < batches.length; bi += 1) {
        const b = batches[bi];
        setImportProgress(`استيراد الملف ${bi + 1}/${batches.length}: ${b.fileName}`);
        const result = await importSingleBatch(b);
        if (!result.ok) { alert(result.msg); break; }
        total += result.count;
      }
      alert(`تم استيراد ${total} مفردة من ${batches.length} ملف إلى الأرشيف.`);
      onImportComplete();
    } catch (err) {
      console.error("OCR import error:", err);
      setError("خطأ في الاستيراد: " + err.message);
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  };

  const activeBatch = batches[activeBatchIdx];
  const btnBase = { border: 0, borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer" };

  if (phase === "setup") {
    return (
      <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>🔮 استيراد شهري (قراءة النصوص المطبوعة + تقسيم آلي)</h3>
          <button onClick={onBack} style={{ ...btnBase, background: "#F1F5F9", color: "#334155" }}>رجوع</button>
        </div>
        <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.8, margin: "0 0 14px" }}>
          ارفعي ملف أو كذا ملف شهري مع بعض. النظام يقرأ النصوص المطبوعة (Text Layer) داخل الـ PDF مباشرة وبإحداثياتها،
          فيستخرج رقم {cfg.ocrNameLabel} من بجانب الليبل والاسم والشهر تلقائيًا ويقسّم الملف المبسّط إلى مفردات مستقلة.
          الـOCR يُستخدم فقط للصفحات التي لا تحتوي نصًا مطبوعًا.
        </p>
        {error && <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 9, padding: 12, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <input ref={fileInputRef} type="file" accept="application/pdf" multiple onChange={addFiles} style={{ display: "none" }} />
        <button onClick={() => fileInputRef.current?.click()} style={{ ...btnBase, background: "#2563EB", color: "#fff" }}>＋ اختيار ملفات PDF</button>
        {selections.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {selections.map((s) => (
              <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 12px" }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13, minWidth: 140 }}>📄 {s.file.name}</span>
                <select value={s.year} onChange={(e) => updateSelection(s.id, "year", Number(e.target.value))} style={{ borderRadius: 8, padding: "7px 8px", border: "1px solid #CBD5E1", fontSize: 13 }}>
                  {Array.from({ length: 20 }, (_, i) => 2026 - i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={s.month} onChange={(e) => updateSelection(s.id, "month", Number(e.target.value))} style={{ borderRadius: 8, padding: "7px 8px", border: "1px solid #CBD5E1", fontSize: 13 }}>
                  {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <button onClick={() => removeSelection(s.id)} style={{ ...btnBase, background: "#FEE2E2", color: "#991B1B", padding: "6px 10px" }}>✕</button>
              </div>
            ))}
            <button onClick={startAll} style={{ ...btnBase, background: "#7C3AED", color: "#fff", fontSize: 14, alignSelf: "flex-start" }}>
              🔮 بدء القراءة الآلية ({selections.length} ملف)
            </button>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.7 }}>
              💡 يفضل أن تكون ملفات الـPDF أصلية (بنصوص مطبوعة) للحصول على أدق نتيجة وأسرع قراءة.
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: 18, textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#1E40AF", marginBottom: 10 }}>⏳ جاري قراءة الملفات بالتوازي...</div>
        <div style={{ fontSize: 14, color: "#475569" }}>{progress}</div>
        <div style={{ marginTop: 16, width: "100%", height: 8, background: "#E5E7EB", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", background: "#2563EB", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
        </div>
      </div>
    );
  }

  if (phase === "review" && activeBatch) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>📋 نتائج القراءة: {batches.length} ملف</h3>
          <button onClick={onBack} style={{ ...btnBase, background: "#F1F5F9", color: "#334155" }}>رجوع</button>
        </div>
        {error && <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 9, padding: 12, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {importing && importProgress && <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", borderRadius: 9, padding: 10, marginBottom: 10, fontSize: 13 }}>⏳ {importProgress}</div>}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {batches.map((b, i) => (
            <button
              key={b.id}
              onClick={() => setActiveBatchIdx(i)}
              style={{
                border: i === activeBatchIdx ? "2px solid #7C3AED" : "1px solid #CBD5E1",
                background: i === activeBatchIdx ? "#F5F3FF" : "#fff",
                color: i === activeBatchIdx ? "#6D28D9" : "#334155",
                borderRadius: 8,
                padding: "8px 12px",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {b.fileName.length > 28 ? b.fileName.slice(0, 25) + "…" : b.fileName}
              <span style={{ marginRight: 6, opacity: 0.6 }}>({b.groups.length})</span>
              {b.duplicateCount > 0 && (
                <span style={{ marginRight: 4, background: "#DC2626", color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 800 }}>{b.duplicateCount} مكرر</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={() => importSingleBatch(activeBatch).then((r) => { if (r.ok) { alert(`تم استيراد ${r.count} مفردة من "${activeBatch.fileName}".`); } else alert(r.msg); })} disabled={importing || batches.length === 0} style={{ ...btnBase, background: importing ? "#94A3B8" : "#047857", color: "#fff" }}>
            {importing ? "جاري..." : `✅ استيراد مفردات "${activeBatch.fileName.slice(0, 20)}"`}
          </button>
          <button onClick={importAllBatches} disabled={importing || batches.length === 0} style={{ ...btnBase, background: importing ? "#94A3B8" : "#1D4ED8", color: "#fff" }}>
            {importing ? "جاري..." : `📦 استيراد كل الملفات (${batches.length})`}
          </button>
        </div>

        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 10 }}>
          📄 {activeBatch.fileName} — {MONTH_NAMES[activeBatch.month - 1]} {activeBatch.year} — {activeBatch.groups.length} مفردة
          {activeBatch.duplicateCount > 0 && (
            <span style={{ background: "#FEF2F2", color: "#B91C1C", borderRadius: 999, padding: "1px 8px", marginLeft: 8, fontWeight: 700 }}>
              {activeBatch.duplicateCount} مفردة مسجلة مسبقًا
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {activeBatch.groups.map((g, gi) => (
            <div key={g.id} style={{ display: "flex", gap: 12, background: "#fff", border: g.needsReview ? "1px solid #F59E0B" : "1px solid #E5E7EB", borderRadius: 12, padding: 12, flexWrap: "wrap" }}>
              <img src={g.dataUrls[0]} alt={`صفحة ${g.pageIndexes[0]}`} style={{ width: 100, height: 130, objectFit: "cover", borderRadius: 8, border: "1px solid #CBD5E1" }} loading="lazy" />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>
                  مفردة من {g.pageIndexes.length} صفحة: {g.pageIndexes.join(", ")}
                  {g.missingHeader > 0 && (
                    <span style={{ color: "#D97706", fontWeight: 700 }}> — صفحات لاحقة بلا رأس أُلحقت بهذه المفردة</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{cfg.ocrNumberLabel} *</label>
                    <input value={g.number} onChange={(e) => updateGroup(activeBatchIdx, gi, "number", e.target.value)} placeholder={cfg.ocrNumberLabel} style={{ width: "100%", border: "1px solid #CBD5E1", borderRadius: 8, padding: "7px 10px", fontSize: 13, marginTop: 2, borderColor: g.number ? "#CBD5E1" : "#EF4444" }} />
                  </div>
                  <div style={{ flex: 2, minWidth: 180 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{cfg.ocrNameLabel} *</label>
                    <input list={`names-${activeBatchIdx}`} value={g.name} onChange={(e) => updateGroup(activeBatchIdx, gi, "name", e.target.value)} placeholder="الاسم الكامل" style={{ width: "100%", border: "1px solid #CBD5E1", borderRadius: 8, padding: "7px 10px", fontSize: 13, marginTop: 2, borderColor: g.name ? "#CBD5E1" : "#EF4444" }} />
                  </div>
                  <button onClick={() => removeGroup(activeBatchIdx, gi)} style={{ ...btnBase, background: "#FEE2E2", color: "#991B1B", padding: "6px 10px", alignSelf: "flex-end" }}>🗑️</button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>الشهر</label>
                  <select value={g.month} onChange={(e) => updateGroup(activeBatchIdx, gi, "month", Number(e.target.value))} style={{ borderRadius: 8, padding: "6px 8px", border: "1px solid #CBD5E1", fontSize: 12 }}>
                    {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>السنة</label>
                  <select value={g.year} onChange={(e) => updateGroup(activeBatchIdx, gi, "year", Number(e.target.value))} style={{ borderRadius: 8, padding: "6px 8px", border: "1px solid #CBD5E1", fontSize: 12 }}>
                    {Array.from({ length: 20 }, (_, i) => 2026 - i).map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  {g.monthAuto && (
                    <span style={{ fontSize: 12, color: "#7C3AED", fontWeight: 700 }}>↖ استُخرج الشهر/السنة من رأس المفردة</span>
                  )}
                </div>
                {g.knownNames.length > 0 && !g.knownNames.includes(g.name.trim()) && (
                  <div style={{ marginTop: 8, background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 8, padding: "8px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>⚠️ {cfg.ocrNumberLabel} {g.number} مسجل في الأرشيف باسم: {g.knownNames.join("، ")}</span>
                    <button onClick={() => updateGroup(activeBatchIdx, gi, "name", g.knownNames[0])} style={{ ...btnBase, background: "#92400E", color: "#fff", padding: "4px 10px", fontSize: 12 }}>
                      ↩ اعتماد الاسم من الأرشيف
                    </button>
                  </div>
                )}
                {g.isDuplicate && (
                  <div style={{ marginTop: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                    🟠 مسجل مسبقًا لنفس {cfg.ocrNameLabel} في {MONTH_NAMES[g.month - 1]} {g.year} — سيُحفظ نسخة إضافية ولن يُحذف السجل القديم.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <datalist id={`names-${activeBatchIdx}`}>
          {(activeBatch.groups.filter((g) => g.name).map((g) => g.name)).concat(memberNames).filter((v, i, a) => a.indexOf(v) === i).map((name, i) => <option key={i} value={name} />)}
        </datalist>
      </div>
    );
  }

  return null;
}