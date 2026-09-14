import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const PARSER_SCALE = 1.5;

// ============================================
// دوال مساعدة للنص العربي
// ============================================

function normalizeDigits(str) {
  return String(str)
    .replace(/[یك]/g, (c) => (c === "ی" ? "ي" : "ك"))
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
}

function normalizeArabicText(str) {
  return normalizeDigits(str)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ﷲ/g, "الله")
    .replace(/ﷺ/g, "صلى الله عليه وسلم")
    .replace(/﷽/g, "سبحان الله")
    .replace(/﷼/g, "حسبنا الله ونعم الوكيل")
    .replace(/ﷹ/g, "أجل")
    .replace(/ﷺ/g, "صلى الله عليه وسلم")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================
// تحويل Text Layer إلى سطر منظمة مع الإحداثيات
// ============================================

function textItemsToStructuredLines(items, viewport) {
  if (!Array.isArray(items) || items.length === 0) return [];
  
  const words = items
    .filter((it) => it && it.str && it.str.trim())
    .map((it) => {
      const [x, y] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
      const fontSize = it.transform[0];
      return { 
        text: it.str.trim(), 
        x, 
        y,
        fontSize,
        width: it.width,
        height: it.height
      };
    });
  
  if (words.length === 0) return [];
  
  // ترتيب الكلمات حسب الموقع (من الأعلى للأسفل، ثم من اليمين لليسار RTL)
  words.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) < 5) return b.x - a.x; // نفس السطر - RTL
    return a.y - b.y; // سطر مختلف - من الأعلى
  });
  
  // تجميع الكلمات في سطور
  const tol = Math.max(3, viewport.height * 0.01);
  const lines = [];
  let cur = [];
  let curY = null;
  
  words.forEach((w) => {
    if (curY === null || Math.abs(w.y - curY) <= tol) {
      cur.push(w);
      curY = curY === null ? w.y : Math.min(curY, curY);
    } else {
      if (cur.length > 0) {
        // ترتيب الكلمات في السطر (RTL)
        cur.sort((a, b) => b.x - a.x);
        lines.push({ 
          y: cur[0].y, 
          words: cur,
          text: cur.map(w => w.text).join(' ')
        });
      }
      cur = [w];
      curY = w.y;
    }
  });
  
  if (cur.length > 0) {
    cur.sort((a, b) => b.x - a.x);
    lines.push({ 
      y: cur[0].y, 
      words: cur,
      text: cur.map(w => w.text).join(' ')
    });
  }
  
  return lines;
}

// ============================================
// البحث عن نص مع الإحداثيات
// ============================================

function findTextWithPosition(lines, searchText, caseSensitive = false) {
  const search = caseSensitive ? searchText : searchText.toLowerCase();
  
  for (const line of lines) {
    const text = caseSensitive ? line.text : line.text.toLowerCase();
    if (text.includes(search)) {
      const matchedWord = line.words.find(w => 
        w.text.toLowerCase().includes(search.toLowerCase())
      );
      
      return {
        text: line.text,
        x: matchedWord?.x || line.words[0]?.x,
        y: line.y,
        line: line
      };
    }
  }
  return null;
}

// ============================================
// استخراج رقم العامل بجانب Label (الطريقة الصحيحة)
// ============================================

function extractComputerNumber(lines) {
  const NUMBER_LABELS = "(?:عامل|صرف|كمبيوتر|وظيفي|شئون|كود)";
  
  for (const line of lines) {
    const normalized = normalizeDigits(line.text).replace(/\s+/g, " ");
    
    // البحث عن pattern: "رقم العامل    035004" أو "رقم الصرف    0036654"
    const pattern = new RegExp(`رقم\\s*(?:ال)?${NUMBER_LABELS}\\s*[:：]?\\s*([A-Za-z0-9_-]+)`);
    const match = normalized.match(pattern);
    
    if (match) {
      let value = match[1].replace(/\s+/g, "").trim();
      
      // إزالة أي رموز غير مرغوبة من البداية والنهاية
      value = value.replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9_-]+$/, "");
      
      // التأكد أن القيمة تحتوي على أرقام
      if (/\d/.test(value)) {
        // الحفاظ على القيمة كما هي (String) - لا تحويل للأرقام
        return value;
      }
    }
    
    // طريقة بديلة: البحث عن كلمة "رقم" ثم أخذ الكلمة التالية
    const words = line.words || [];
    const labelIdx = words.findIndex((w) => normalizeDigits(w.text).includes("رقم"));
    
    if (labelIdx !== -1) {
      // البحث عن الكلمة التالية التي تحتوي على أرقام
      for (let i = labelIdx + 1; i < words.length; i++) {
        const wordText = normalizeDigits(words[i].text);
        if (/\d/.test(wordText)) {
          let value = wordText.replace(/[^A-Za-z0-9_-]/g, "");
          if (value.length >= 4) { // رقم عامل عادة 4+ أرقام
            return value;
          }
        }
      }
    }
  }
  
  // طريقة إضافية: البحث عن أي رقم 4-8 أرقام في السطور الأولى
  for (const line of lines.slice(0, 10)) {
    const normalized = normalizeDigits(line.text);
    const numbers = normalized.match(/\b\d{4,8}\b/g);
    if (numbers) {
      // استبعاد السنوات (1960-2099)
      const nonYearNumbers = numbers.filter(n => {
        const num = Number(n);
        return !(num >= 1960 && num <= 2099);
      });
      
      if (nonYearNumbers.length > 0) {
        // إرجاع أطول رقم (غالباً رقم العامل)
        nonYearNumbers.sort((a, b) => b.length - a.length);
        return nonYearNumbers[0];
      }
    }
  }
  
  return null;
}

// ============================================
// استخراج الاسم من منطقة بيانات الموظف
// ============================================

const JUNK_WORDS = [
  "اجمالي","إجمالي","الإجمالي","الاجمالي","الصافي","المستقطع","صافي","مستقطع","بدلات","حوافز","الحوافز",
  "المرتب","مرتب","راتب","استحقاق","نقدي","جنيه","ج.م","مقدار","تعلن","إدارة","ادارة","شئون","الأمن","امن",
  "الموارد","البشرية","جداول","الجدول","حساب","مالية","المالية","البنك","المصرف","مكتب","مديرية","جامعة",
  "كلية","قسم","شهر","سنة","سنوى","دفع","مستحق","تأمين","علاوة","حافز","كادر","درجة","وظيف","مكأفاة",
  "مكافأة","مجموع","اللجنة","النقابات","مستحقات","أجور","اجور","تكليف","حوالة","ملاحظات","ملاحظة",
  "البيانات","عدد","قيمة","صفحة","مرتبات","الشهر",
  "اوراكل","أوراكل","اوركل","اوركال","الرواتب","مفردات","يعتمد","أمين الكلية","امين الكلية","oracle","hrms",
];

const TITLE_TAILS = [
  "أستاذ متفرغ", "الأستاذ المتفرغ", "الاستاذ المتفرغ", "المتفرغ", "متفرغ",
  "مدرس مساعد", "مدرس أول", "أستاذ مساعد", "أستاذ", "الأستاذ", "الاستاذ",
  "دكتور", "الدكتور", "معلم أول", "معلم خبير", "معلم", "مدرس",
  "مهندس", "باحث", "صراف أول", "صراف", "هيئة تدريس", "هيئة", "تدريس",
];

function hasJunkWord(text) {
  return JUNK_WORDS.some((w) => text.includes(w));
}

function extractEmployeeName(lines) {
  // البحث عن منطقة بيانات الموظف
  const employeeKeywords = ["بيانات الموظف", "الموظف", "اسم", "الاسم", "الاسم:"];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normalized = normalizeArabicText(line.text);
    
    // إذا وجدنا كلمة دالة على بيانات الموظف
    if (employeeKeywords.some(k => normalized.includes(k))) {
      // البحث في السطور التالية عن الاسم
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const candidateLine = lines[j];
        const candidateText = normalizeArabicText(candidateLine.text);
        
        // استبعاد السطور التي تحتوي على كلمات دخيلة
        if (hasJunkWord(candidateText)) continue;
        
        // استبعاد السطور التي تحتوي على أرقام كثيرة
        const numbers = candidateText.match(/\d/g);
        if (numbers && numbers.length > 3) continue;
        
        // استبعاد السطور القصيرة جداً
        if (candidateText.length < 3) continue;
        
        // استبعاد السطور التي تحتوي على كلمات إنجليزية كثيرة
        const englishChars = candidateText.match(/[a-zA-Z]/g);
        if (englishChars && englishChars.length > 5) continue;
        
        // إزالة الألقاب من النهاية
        let name = candidateText;
        TITLE_TAILS.forEach(title => {
          if (name.endsWith(title)) {
            name = name.slice(0, -title.length).trim();
          }
        });
        
        // إزالة أي كلمات "كلية" أو "قسم" إذا وجدت
        name = name.replace(/كلية|قسم|جامعة|هندسة/g, '').trim();
        
        if (name.length >= 3) {
          return name;
        }
      }
    }
  }
  
  // طريقة بديلة: البحث عن سطر يحتوي على اسم عربي طويل (3+ كلمات)
  for (const line of lines.slice(0, 15)) {
    const normalized = normalizeArabicText(line.text);
    
    if (hasJunkWord(normalized)) continue;
    
    const numbers = normalized.match(/\d/g);
    if (numbers && numbers.length > 2) continue;
    
    // التحقق أن السطر يحتوي على 3+ كلمات عربية
    const arabicWords = normalized.match(/[\u0600-\u06FF]+/g);
    if (arabicWords && arabicWords.length >= 3) {
      let name = normalized;
      TITLE_TAILS.forEach(title => {
        if (name.endsWith(title)) {
          name = name.slice(0, -title.length).trim();
        }
      });
      
      name = name.replace(/كلية|قسم|جامعة|هندسة/g, '').trim();
      
      if (name.length >= 3) {
        return name;
      }
    }
  }
  
  return null;
}

// ============================================
// استخراج الشهر والسنة
// ============================================

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

function extractMonthYear(lines) {
  const fullText = lines.map(l => l.text).join(' ');
  const normalized = normalizeDigits(fullText);
  
  // البحث عن pattern رقمي: "شهر 2/2019" أو "2/2019"
  const numericMatch = normalized.match(/\bشهر\s*[:：]?\s*(\d{1,2})\s*[/\\-]\s*((?:19|20)\d{2})\b/)
    || normalized.match(/\b(\d{1,2})\s*[/\\-]\s*((?:19|20)\d{2})\b/);
    
  if (numericMatch) {
    const month = Number(numericMatch[1]);
    const year = Number(numericMatch[2]);
    if (month >= 1 && month <= 12 && year >= 1960 && year <= 2099) {
      return { month, year };
    }
  }
  
  // البحث عن pattern: "يناير - ١٩" أو "يناير - 2019"
  const dashMatch = normalized.match(/(\d{1,2})\s*[-–]\s*(\d{2,4})/);
  if (dashMatch) {
    const month = Number(dashMatch[1]);
    let year = Number(dashMatch[2]);
    
    // إذا كانت السنة رقمين فقط، نضيف 2000
    if (year < 100) {
      year = 2000 + year;
    }
    
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
      return { month, year };
    }
  }
  
  // البحث عن اسم الشهر العربي
  for (const monthInfo of MONTH_KEYWORDS) {
    for (const monthName of monthInfo.names) {
      if (normalized.includes(monthName)) {
        // البحث عن سنة قريبة (بأي شكل)
        const yearMatch = normalized.match(/\b(?:19|20)?\d{2}\b/);
        if (yearMatch) {
          let year = Number(yearMatch[0]);
          // إذا كانت سنة رقمين فقط
          if (year < 100) {
            year = year >= 60 ? 1900 + year : 2000 + year;
          }
          
          if (year >= 1960 && year <= 2099) {
            return { 
              month: monthInfo.n, 
              year: year 
            };
          }
        }
        
        return { 
          month: monthInfo.n, 
          year: null 
        };
      }
    }
  }
  
  // البحث عن سنة فقط
  const yearOnlyMatch = normalized.match(/\b(?:19|20)?\d{2}\b/);
  if (yearOnlyMatch) {
    let year = Number(yearOnlyMatch[0]);
    if (year < 100) {
      year = year >= 60 ? 1900 + year : 2000 + year;
    }
    
    if (year >= 1960 && year <= 2099) {
      return { month: null, year: year };
    }
  }
  
  return { month: null, year: null };
}

// ============================================
// ربط الصفحات المتتالية لنفس مفردة المرتب
// ============================================

const NUMBER_LABELS = "(?:عامل|صرف|كمبيوتر|وظيفي|شئون|كود)";

/* هل الصفحة تحمل رأس مفردة بليبل رقم ("رقم العامل: 035004")؟
   أرقام المبالغ في أعمدة الصرف لا يسبقها ليبل «رقم...» فلا تُعد رأس مفردة. */
function hasLabeledComputerNumber(lines) {
  const re = new RegExp(`رقم\\s*(?:ال)?${NUMBER_LABELS}\\s*[:：]?\\s*[A-Za-z0-9]`);
  return Array.isArray(lines) && lines.some((l) => re.test(normalizeDigits(l.text)));
}

function arabicNameTokens(name) {
  return String(name || "").split(/\s+/).filter((t) => /[\u0600-\u06FF]/.test(t));
}

/* هل الاسمين لنفس الشخص؟ يتشاركان في كلمة معتبرة (≥4 أحرف) أو أحدهما مجموعة فرعية من
   الآخر (اسم مجزأ بسبب اختلاف قراءة OCR بين صفحات نفس المفردة). */
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

/* مفتاح تجميع رقمين: الجزء قبل الشرطة (الرقم الثابت للموظف) مع الحفاظ على الحروف */
function sameComputerNumberKey(a, b) {
  const key = (n) => String(n || "").split("-")[0].replace(/[^A-Za-z0-9_]/g, "");
  return key(a) === key(b);
}

// ============================================
// اكتشاف بداية مفردة جديدة
// ============================================

function isNewSalarySlip(lines, previousSlip = null) {
  const fullText = lines.map(l => l.text).join(' ');
  const normalized = normalizeArabicText(fullText);

  // مؤشرات عامة على رأس مفردة (ليست كلها كافية وحدها لفتح مفردة جديدة)
  const strongIndicators = [
    "بيانات مفردات مرتب",
    "مفردات مرتب",
    "بيانات الموظف",
  ];

  const hasStrongIndicator = strongIndicators.some(indicator =>
    normalized.includes(indicator)
  );

  const computerNumber = extractComputerNumber(lines);
  const employeeName = extractEmployeeName(lines);
  const hasLabeledNumberLine = hasLabeledComputerNumber(lines);

  // رقم حقيقي مقروء بليبل: مختلف عن رقم المفردة السابقة => مفردة جديدة
  if (computerNumber && hasLabeledNumberLine) {
    if (previousSlip && previousSlip.computerNumber) {
      return !sameComputerNumberKey(computerNumber, previousSlip.computerNumber);
    }
    return true;
  }

  // اسم مختلف تمامًا (لا يتشارك مع اسم المفردة السابقة) => مفردة جديدة (رقم غير مقروء)
  // ما لم يكن الاسم ضجيج تذييل كـ «نظام أوراكل للرواتب» / «أمين الكلية» (قراءة OCR خاطئة)
  if (employeeName && !isFooterNoiseName(employeeName)) {
    if (previousSlip && previousSlip.employeeName) {
      return !namesShareIdentity(employeeName, previousSlip.employeeName);
    }
    return true;
  }

  // رأس عام بلا بيانات مقروءة: تكميلي عندما توجد مفردة سابقة مكتملة
  if (hasStrongIndicator) {
    return !previousSlip || !previousSlip.computerNumber;
  }

  return false;
}

// ============================================
// اكتشاف صفحة تكميلية (استمرار لنفس المفردة)
// ============================================

function isContinuationPage(lines, currentSlip) {
  if (!currentSlip) return false;

  // رأس بليبل رقم: القرار يُترك لاكتشاف بداية المفردة (وليس تكميلية)
  if (hasLabeledComputerNumber(lines)) return false;

  const employeeName = extractEmployeeName(lines);

  // لا اسم مقروء (أرقام المبالغ لا تُعد رأسًا) => صفحة تكميلية
  if (!employeeName) return true;

  // نفس الاسم (أو جزء منه بسبب OCR) => تكميلية لنفس المفردة
  if (currentSlip.employeeName) {
    return namesShareIdentity(employeeName, currentSlip.employeeName);
  }

  return false;
}

// ============================================
// المحرك الرئيسي لتحليل PDF
// ============================================

export async function analyzeSalaryPDF(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const totalPages = pdf.numPages;
  const pages = [];
  
  for (let i = 1; i <= totalPages; i++) {
    if (onProgress) {
      onProgress(`جاري تحليل صفحة ${i} من ${totalPages}...`);
    }
    
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: PARSER_SCALE });
    const textContent = await page.getTextContent();
    
    const structuredLines = textItemsToStructuredLines(textContent.items, viewport);
    const fullText = structuredLines.map(l => l.text).join(' ');
    
    // استخراج البيانات من الصفحة
    const computerNumber = extractComputerNumber(structuredLines);
    const employeeName = extractEmployeeName(structuredLines);
    const monthYear = extractMonthYear(structuredLines);
    
    pages.push({
      pageNumber: i,
      viewport: { width: viewport.width, height: viewport.height },
      lines: structuredLines,
      fullText: fullText.substring(0, 300), // أول 300 حرف للتحليل
      computerNumber,
      employeeName,
      month: monthYear.month,
      year: monthYear.year,
      isTextual: structuredLines.length >= 3
    });
  }
  
  return {
    totalPages,
    pages
  };
}

// ============================================
// تجميع الصفحات في مفردات
// ============================================

export function groupPagesIntoSalarySlips(pages) {
  const slips = [];
  let currentSlip = null;
  
  for (const page of pages) {
    const isNew = isNewSalarySlip(page.lines, currentSlip);
    
    if (!currentSlip || isNew) {
      // بدء مفردة جديدة (تصفير الوراثة: لا تُنسخ بيانات الموظف السابق إلى الجديد)
      if (currentSlip) {
        slips.push(currentSlip);
      }
      
      currentSlip = {
        computerNumber: page.computerNumber,
        employeeName: page.employeeName,
        month: page.month,
        year: page.year,
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
        pages: [page],
        needsReview: !page.computerNumber || !page.employeeName
      };
    } else {
      // صفحة تكميلية / غير حاسمة لنفس المفردة: تُلحق ولا تُسقَط،
      // وتَرِث تلقائيًا القيم الناقصة من أقرب صفحة سابقة موثوقة لنفس المفردة
      isContinuationPage(page.lines, currentSlip);
      
      currentSlip.pageEnd = page.pageNumber;
      currentSlip.pages.push(page);
      
      if (!currentSlip.computerNumber && page.computerNumber) {
        currentSlip.computerNumber = page.computerNumber;
      }
      if (!currentSlip.employeeName && page.employeeName) {
        currentSlip.employeeName = page.employeeName;
      }
      if (!currentSlip.month && page.month) {
        currentSlip.month = page.month;
      }
      if (!currentSlip.year && page.year) {
        currentSlip.year = page.year;
      }
      
      currentSlip.needsReview = !currentSlip.computerNumber || !currentSlip.employeeName;
    }
  }
  
  // إضافة المفردة الأخيرة
  if (currentSlip) {
    slips.push(currentSlip);
  }

  // دمج مفردات «صفحة ونص»: أي مفردة انفصلت بلا اسم (ذيل/تتمة مفردة سابقة) — أو بضجيج
  // تذييل قالب مثل «نظام أوراكل للرواتب» — تُدمج تلقائيًا في المفردة السابقة وترث
  // رقمها واسمها وتُعدّ جزءًا من نفس المفردة.
  const merged = [];
  for (const s of slips) {
    const prev = merged[merged.length - 1];
    if (prev && (!s.employeeName || isFooterNoiseName(s.employeeName))) {
      prev.pages.push(...s.pages);
      prev.pageEnd = s.pageEnd;
      prev.needsReview = !prev.computerNumber || !prev.employeeName;
      continue;
    }
    merged.push(s);
  }

  return merged;
}

/* هل هذا نص من تذييل/ترويسة قالب (مثل «نظام أوراكل للرواتب» أو «أمين الكلية») —
   قراءة OCR خاطئة لا تُعدّ اسمَ موظف ولا بداية مفردة؟ */
function isFooterNoiseName(name) {
  if (!name) return false;
  const norm = normalizeDigits(String(name))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .toLowerCase();
  return /اوراكل|اوركال|اوركل|الرواتب|مفردات|يعتمد|امين الكلية|امين الكليه|oracle|hrms|صافى|اجمالى|مستحقات|بيانات|الجدول|الشهر|السنة/.test(norm);
}

// ============================================
// تصدير الدوال للاستخدام الخارجي
// ============================================

export {
  normalizeDigits,
  normalizeArabicText,
  textItemsToStructuredLines,
  extractComputerNumber,
  extractEmployeeName,
  extractMonthYear,
  isNewSalarySlip,
  isContinuationPage
};