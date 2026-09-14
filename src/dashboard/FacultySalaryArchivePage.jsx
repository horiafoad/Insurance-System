import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "../supabaseClient";
import OcrSplitPanel from "./OcrSplitPanel";
import { FACULTY_SALARY_CONFIG } from "./salaryArchiveConfig";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const PAGE_SIZE = 60;

const migrationHint = (cfg) =>
  `تأكدي من تنفيذ ملف "${cfg.migrationFile}" بالكامل في Supabase SQL Editor ` +
  `(ينشئ جدولَي ${cfg.migrationTables} وبكت ${cfg.migrationBucket}).`;

const withMigrationHint = (err, cfg) => {
  const msg = err?.message || String(err);
  const hints = [/could not find the table/i, /does not exist/i, /relation .* does not exist/i, /permission denied/i, /row-level security/i, /could not find the bucket/i];
  return hints.some((re) => re.test(msg))
    ? `${msg}\n\n\u{1F6A7} ${migrationHint(cfg)}`
    : msg;
};

const MONTH_NAMES = [
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

const ARABIC_MONTHS = [
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

const ENGLISH_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function sanitizeName(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function asciiSafe(value) {
  return String(value || "")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function monthName(month) {
  return MONTH_NAMES[Number(month) - 1] || String(month);
}

function normalizeDigits(str) {
  return String(str)
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
}

const ARABIC_MONTH_SHORT = {
  ينا: 1, فبر: 2, مار: 3, ابر: 4, ابريل: 4, ماي: 5, يون: 6, يول: 7,
  اغس: 8, أغس: 8, سبت: 9, سبر: 9, اكت: 10, أكت: 10, نوف: 11, ديس: 12,
};

const ENGLISH_MONTH_SHORT = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/* ------------------------------------------------------------------
   استخراج بيانات من اسم الملف بشكل متحفظ (لا تخمين)
   يعيد null لأي قيمة غير مؤكدة حتى تذهب للمراجعة اليدوية.
   اسم العضو لا يُستخرج أبدًا تلقائيًا حفاظًا على الدقة.
------------------------------------------------------------------ */
function extractMetaFromFilename(rawName) {
  const name = normalizeDigits(rawName);
  const lower = name.toLowerCase();

  let year = null;
  const yearMatches = name.match(/(19|20)\d{2}/g) || [];
  const uniqueYears = [...new Set(yearMatches)];
  if (uniqueYears.length === 1) year = Number(uniqueYears[0]);

  const monthCandidates = new Set();

  ARABIC_MONTHS.forEach((m, i) => {
    if (name.includes(m)) monthCandidates.add(i + 1);
  });

  Object.entries(ARABIC_MONTH_SHORT).forEach(([short, m]) => {
    if (name.includes(short)) monthCandidates.add(m);
  });

  ENGLISH_MONTHS.forEach((m, i) => {
    if (lower.includes(m)) monthCandidates.add(i + 1);
  });

  Object.entries(ENGLISH_MONTH_SHORT).forEach(([short, m]) => {
    const label = m === 9 ? ["sep", "sept"] : [short];
    if (label.some((s) => new RegExp(`\\b${s}\\b`).test(lower))) monthCandidates.add(m);
  });

  const sep = "[\\s/._-]+";
  const mmYy = lower.match(new RegExp(`(?:^|[^\\d])(1[0-2]|0[1-9]|[1-9])${sep}(19|20)\\d{2}(?:$|[^\\d])`));
  const yyMm = lower.match(new RegExp(`(?:^|[^\\d])(19|20)\\d{2}${sep}(1[0-2]|0[1-9]|[1-9])(?:$|[^\\d])`));
  if (mmYy) monthCandidates.add(Number(mmYy[1]));
  if (yyMm) monthCandidates.add(Number(yyMm[2]));

  let month = null;
  if (monthCandidates.size === 1) {
    month = [...monthCandidates][0];
  }

  let computerNumber = null;
  const digitTokens = lower.match(/\b\d{4,8}\b/g) || [];
  const nonYearTokens = digitTokens.filter((t) => !(Number(t) >= 1960 && Number(t) <= 2099));
  const uniqueNumbers = [...new Set(nonYearTokens)];
  if (uniqueNumbers.length === 1) {
    computerNumber = String(uniqueNumbers[0]);
  }

  return { year, month, computerNumber };
}

/* ------------------------------------------------------------------
   توليد صور معاينة لكل صفحات الـPDF عبر pdfjs (مكتبة موجودة بالفعل)
------------------------------------------------------------------ */
async function renderPdfPagesToJpeg(arrayBuffer, scale = 1.4) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.82));
  }

  return { images, pageCount: pdf.numPages };
}

function createUniqueToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function uploadToBucket(bucket, path, blob, contentType) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function downloadQueryUrl(fileUrl, downloadName) {
  const separator = fileUrl.includes("?") ? "&" : "?";
  return `${fileUrl}${separator}download=${encodeURIComponent(downloadName || "salary.pdf")}`;
}

/* ------------------------------------------------------------------
   البحث في الأرشيف بالاسم ورقم الكمبيوتر مع تجاهل اختلافات الكتابة العربية
   (أ/إ/آ/ا ، ة/ه ، ي/ى) ومطابقة كل كلمة بحث على حدة (AND بين الكلمات)
   - يُبحث عن رقم الكمبيوتر كـ exact match.
   - يُبحث عن الاسم مع variants عربية.
   - كل مجموعة or تُدمج مع الأخرى بـ AND (سلوك PostgREST المتكرر).
------------------------------------------------------------------ */
function escFilter(v) {
  return String(v).replace(/[%_,()]/g, " ");
}

function arabicSearchVariants(term) {
  const s = String(term || "");
  if (!s) return [];
  const variants = new Set([s]);
  variants.add(s.replace(/[أإآٱ]/g, "ا").replace(/[ىي]/g, "ي").replace(/ة/g, "ه"));
  variants.add(s.replace(/[أإآٱ]/g, "ا").replace(/[ىي]/g, "ى").replace(/ة/g, "ه"));
  variants.add(s.replace(/[أإآٱ]/g, "ا").replace(/[ىي]/g, "ي").replace(/ة/g, "ت"));
  return [...variants].filter((v) => v).slice(0, 6);
}

function applyNameSearch(query, nameCol, rawQuery) {
  const q = String(rawQuery || "").trim();
  if (!q) return query;
  const groups = [];
  const seen = new Set();

  const pushGroup = (text) => {
    const group = arabicSearchVariants(text)
      .map((v) => `${nameCol}.ilike.%${escFilter(v)}%`)
      .join(",");
    if (group && !seen.has(group)) {
      seen.add(group);
      groups.push(group);
    }
  };

  /* الجملة كاملة كجزء متصل (يطابق الاسم المكتوب بمسافاته) + كل كلمة على حدة (AND بينها) */
  pushGroup(q);
  q.split(/\s+/).filter(Boolean).slice(0, 4).forEach(pushGroup);

  let result = query;
  groups.forEach((g) => {
    result = result.or(g);
  });
  return result;
}

/* البحث برقم الكمبيوتر - يطابق أي جزء من الرقم */
function applyComputerNumberSearch(query, computerNumberCol, rawQuery) {
  const q = String(rawQuery || "").trim();
  if (!q) return query;
  return query.ilike(computerNumberCol, `%${escFilter(q)}%`);
}

/* دالة بحث شاملة تدعم الاسم ورقم الكمبيوتر */
function applyCombinedSearch(query, nameCol, computerNumberCol, rawQuery) {
  const q = String(rawQuery || "").trim();
  if (!q) return query;
  
  // إذا كان البحث رقمًا فقط أو رمزًا مختلطًا (حروف وأرقام)، ابحث في رقم الكمبيوتر
  if (/^\d+$/.test(q) || /^[A-Za-z][A-Za-z0-9_-]{2,}$/.test(q)) {
    return applyComputerNumberSearch(query, computerNumberCol, q);
  }
  
  // وإلا استخدم بحث الاسم (يدعم جزءًا من الاسم بالعربية)
  return applyNameSearch(query, nameCol, q);
}

/* ------------------------------------------------------------------
   مودال عرض المفردة: تكبير + تنقل + طباعة + تحميل الـPDF الأصلي
------------------------------------------------------------------ */
function RecordViewer({ record, records, onClose, onNavigate, nameCol, numberLabel }) {
  const [pageIndex, setPageIndex] = useState(0);
  const recordIndex = useMemo(
    () => records.findIndex((r) => r.id === record.id),
    [records, record]
  );

  const previews = useMemo(() => {
    const urls = Array.isArray(record.preview_urls)
      ? record.preview_urls
      : [];
    if (urls.length > 0) return urls;
    return record.preview_url ? [record.preview_url] : [];
  }, [record]);

  const currentImage = previews[pageIndex] || record.preview_url || "";

  const printRecord = () => {
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      alert("من فضلك اسمحي بالنوافذ المنبثقة لطباعة المفردة.");
      return;
    }

    const content = previews
      .map(
        (src, i) =>
          `<div style="page-break-after: always; text-align:center;">
             <img src="${src}" style="max-width:100%; height:auto;" alt="صفحة ${i + 1}" />
           </div>`
      )
      .join("");

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>مفردة مرتب - ${monthName(record.month)} ${record.year}</title>
          <style>
            body { font-family: 'Cairo', 'Segoe UI', sans-serif; margin: 0; padding: 16px; }
            .head { text-align:center; margin-bottom: 14px; font-size: 16px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="head">
            ${record[nameCol]} - ${numberLabel}: ${record.computer_number}
            <br/>${monthName(record.month)} ${record.year} (${previews.length} صفحة)
          </div>
          ${content}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();

    const doPrint = () => {
      printWindow.print();
    };
    printWindow.onload = () => setTimeout(doPrint, 350);
    setTimeout(doPrint, 700);
  };

  const goPrev = () => {
    if (recordIndex > 0) {
      onNavigate(records[recordIndex - 1]);
    }
  };

  const goNext = () => {
    if (recordIndex < records.length - 1) {
      onNavigate(records[recordIndex + 1]);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "14px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "min(900px, 100%)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid #E5E7EB",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: "#1E293B" }}>
            📄 {record[nameCol]}
            <span style={{ color: "#64748B", fontWeight: 600 }}>
              {" "}- {numberLabel}: {record.computer_number}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={goPrev}
              disabled={recordIndex <= 0}
              style={{
                ...navButtonStyle,
                background: "#F1F5F9",
                color: recordIndex <= 0 ? "#CBD5E1" : "#334155",
                cursor: recordIndex <= 0 ? "not-allowed" : "pointer",
              }}
            >
              السابق
            </button>
            <button
              onClick={goNext}
              disabled={recordIndex >= records.length - 1}
              style={{
                ...navButtonStyle,
                background: "#F1F5F9",
                color: recordIndex >= records.length - 1 ? "#CBD5E1" : "#334155",
                cursor: recordIndex >= records.length - 1 ? "not-allowed" : "pointer",
              }}
            >
              التالي
            </button>

            <button onClick={printRecord} style={{ ...navButtonStyle, background: "#EFF6FF", color: "#1D4ED8" }}>
              🖨️ طباعة
            </button>

            <a
              href={downloadQueryUrl(record.file_url, record.original_filename)}
              style={{ ...navButtonStyle, background: "#ECFDF5", color: "#065F46", textDecoration: "none" }}
            >
              ⬇️ تحميل PDF
            </a>

            <a
              href={record.file_url}
              target="_blank"
              rel="noreferrer"
              style={{ ...navButtonStyle, background: "#F3E8FF", color: "#6B21A8", textDecoration: "none" }}
            >
              📂 فتح الملف الأصلي
            </a>

            <button onClick={onClose} style={{ ...navButtonStyle, background: "#FEE2E2", color: "#B91C1C" }}>
              ✕ إغلاق
            </button>
          </div>
        </div>

        <div style={{ padding: 12, overflow: "auto", background: "#F1F5F9" }}>
          {currentImage ? (
            <img
              src={currentImage}
              alt={`مفردة ${monthName(record.month)} ${record.year} صفحة ${pageIndex + 1}`}
              style={{ display: "block", width: "100%", height: "auto", borderRadius: 8 }}
            />
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "#64748B" }}>
              لا توجد صورة معاينة لهذه المفردة.
            </div>
          )}
        </div>

        {previews.length > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "10px 16px",
              borderTop: "1px solid #E5E7EB",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageIndex === 0}
              style={{
                border: "1px solid #CBD5E1",
                background: "#fff",
                borderRadius: 8,
                padding: "7px 12px",
                cursor: pageIndex === 0 ? "not-allowed" : "pointer",
                opacity: pageIndex === 0 ? 0.5 : 1,
              }}
            >
              الصفحة السابقة
            </button>
            <span style={{ fontSize: 13, color: "#475569" }}>
              صفحة {pageIndex + 1} من {previews.length}
            </span>
            <button
              onClick={() => setPageIndex((p) => Math.min(previews.length - 1, p + 1))}
              disabled={pageIndex >= previews.length - 1}
              style={{
                border: "1px solid #CBD5E1",
                background: "#fff",
                borderRadius: 8,
                padding: "7px 12px",
                cursor: pageIndex >= previews.length - 1 ? "not-allowed" : "pointer",
                opacity: pageIndex >= previews.length - 1 ? 0.5 : 1,
              }}
            >
              الصفحة التالية
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const navButtonStyle = {
  border: 0,
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

/* ------------------------------------------------------------------
   الصفحة الرئيسية للقسم
------------------------------------------------------------------ */
export default function FacultySalaryArchivePage({ currentUser, config }) {
  const cfg = config || FACULTY_SALARY_CONFIG;
  const ARCHIVE_TABLE = cfg.table;
  const IMPORTS_TABLE = cfg.importsTable;
  const BUCKET = cfg.bucket;
  const NAME_COL = cfg.nameColumn;
  const storageRoot = cfg.storageRoot;

  const [viewMode, setViewMode] = useState("archive"); // archive | import | review
  const [search, setSearch] = useState("");
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [yearOpen, setYearOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const selectedYearsKey = selectedYears.join(",");
  const selectedMonthsKey = selectedMonths.join(",");

  const [records, setRecords] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedAll, setLoadedAll] = useState(false);

  const [years, setYears] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [staged, setStaged] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");

  const [reviewRows, setReviewRows] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);

  const [members, setMembers] = useState([]);
  const fileInputRef = useRef(null);

  const [ocrMode, setOcrMode] = useState(false);

  const pageRef = useRef(0);

  /* قوائم الخيارات مشتقة من البيانات الفعلية (تُعرَّف بعد كل الـ states) — لا قوائم ثابتة */
  const yearOptionsList = [...new Set(years.map((y) => Number(y)).filter(Number.isFinite))].sort((a, b) => b - a);
  const monthOptionsList =
    availableMonths.length > 0
      ? [...new Set(availableMonths.map((m) => Number(m)).filter((m) => Number.isFinite(m) && m >= 1 && m <= 12))].sort((a, b) => a - b)
      : [...Array(12)].map((_, i) => i + 1);

  /* دالة مشتركة: تجلب السنوات والشهور والأعضاء بطريقة تتجاوز الحد الأقصى
     (هذا المشروع يرجع 1000 صف كحد أقصى حتى مع limit يُحدد أكبر).
     لذلك: أقل/أكبر سنة باستعلام limit=1، وفحص كل سنة محتملة بطلب صغير،
     وفحص الشهور 1..12 بطلبات صغيرة، وجلب الأعضاء بتقسيم الصفحات. */
  const loadMetaData = async () => {
    const table = ARCHIVE_TABLE;

    const [minRes, maxRes] = await Promise.all([
      supabase.from(table).select("year").order("year", { ascending: true }).limit(1),
      supabase.from(table).select("year").order("year", { ascending: false }).limit(1),
    ]);
    const minYear = Number(minRes.data?.[0]?.year);
    const maxYear = Number(maxRes.data?.[0]?.year);

    let yearList = [];
    let monthList;

    if (Number.isFinite(minYear) && Number.isFinite(maxYear) && minYear <= maxYear) {
      const probeYears = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
      const yearProbes = await Promise.all(
        probeYears.map((y) => supabase.from(table).select("year").eq("year", y).limit(1))
      );
      yearList = yearProbes
        .map((res, i) => (res.data && res.data.length > 0 ? probeYears[i] : null))
        .filter((y) => y !== null)
        .sort((a, b) => b - a);
    }

    const monthProbes = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        supabase.from(table).select("month").eq("month", i + 1).limit(1)
      )
    );
    monthList = monthProbes
      .map((res, i) => (res.data && res.data.length > 0 ? i + 1 : null))
      .filter((m) => m !== null);

    const memberRows = [];
    let memberOffset = 0;
    while (true) {
      const { data, error: memberError } = await supabase
        .from(table)
        .select(`${NAME_COL}, computer_number`)
        .order("computer_number", { ascending: true })
        .range(memberOffset, memberOffset + 999);
      if (memberError || !data || data.length === 0) break;
      memberRows.push(...data);
      if (data.length < 1000) break;
      memberOffset += 1000;
    }

    const seen = new Set();
    const uniqueMembers = [];
    memberRows.forEach((r) => {
      const key = `${r.computer_number}|${r[NAME_COL]}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMembers.push(r);
      }
    });

    return { yearList, monthList, memberRows: uniqueMembers };
  };

  /* ------------------ تحميل السنوات والشهور والأعضاء المتاحين ------------------ */
  useEffect(() => {
    let mounted = true;

    const loadMeta = async () => {
      try {
        const { yearList, monthList, memberRows } = await loadMetaData();
        if (!mounted) return;
        setYears(yearList);
        setAvailableMonths(monthList);
        setMembers(memberRows);
      } catch (err) {
        console.error("تعذر تحميل بيانات الأرشيف:", err);
      }
    };

    loadMeta();
    return () => {
      mounted = false;
    };
  }, []);

  /* ------------------ تحميل النتائج (Server-side pagination) ------------------ */
  useEffect(() => {
    let cancelled = false;
    pageRef.current = 0;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        let query = supabase
          .from(ARCHIVE_TABLE)
          .select("*", { count: "exact" })
          .range(0, PAGE_SIZE - 1);

        const q = search.trim();
        if (q) {
          query = applyCombinedSearch(query, NAME_COL, 'computer_number', q);
        }
        if (selectedYears.length > 0) {
          query = query.in("year", selectedYears.map(Number));
        }
        if (selectedMonths.length > 0) {
          query = query.in("month", selectedMonths.map(Number));
        }

        query = query
          .order("computer_number", { ascending: true })
          .order("year", { ascending: false })
          .order("month", { ascending: true })
          .order("sequence", { ascending: true });

        const { data, count, error: queryError } = await query;

        if (cancelled) return;
        if (queryError) throw queryError;

        setRecords(data || []);
        setTotalCount(count || 0);
        setLoadedAll(!data || data.length < PAGE_SIZE);
      } catch (err) {
        console.error("خطأ في تحميل الأرشيف:", err);
        if (!cancelled) setError("تعذر تحميل الأرشيف: " + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [search, selectedYearsKey, selectedMonthsKey]);

  const loadMore = async () => {
    if (loading || loadedAll) return;

    setLoading(true);
    try {
      const nextPage = pageRef.current + 1;
      const start = nextPage * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      let query = supabase
        .from(ARCHIVE_TABLE)
        .select("*")
        .range(start, end);

      const q = search.trim();
      if (q) {
        query = applyCombinedSearch(query, NAME_COL, 'computer_number', q);
      }
      if (selectedYears.length > 0) {
        query = query.in("year", selectedYears.map(Number));
      }
      if (selectedMonths.length > 0) {
        query = query.in("month", selectedMonths.map(Number));
      }

      query = query
        .order("computer_number", { ascending: true })
        .order("year", { ascending: false })
        .order("month", { ascending: true })
        .order("sequence", { ascending: true });

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      pageRef.current = nextPage;

      setRecords((current) => {
        const seen = new Set(current.map((r) => r.id));
        const merged = [...current];
        (data || []).forEach((r) => {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            merged.push(r);
          }
        });
        return merged;
      });
      setLoadedAll(!data || data.length < PAGE_SIZE);
    } catch (err) {
      console.error("خطأ في تحميل المزيد:", err);
      setError("تعذر تحميل المزيد من النتائج: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ------------------ تجميع النتائج للعرض ------------------ */
  const grouped = useMemo(() => {
    const membersMap = new Map();

    records.forEach((record) => {
      const key = `${record.computer_number}|${record[NAME_COL]}`;

      if (!membersMap.has(key)) {
        membersMap.set(key, {
          computer_number: record.computer_number,
          faculty_name: record[NAME_COL],
          years: new Map(),
          filesCount: 0,
          latest: record,
        });
      }

      const member = membersMap.get(key);

      if (!member.years.has(record.year)) {
        member.years.set(record.year, new Map());
      }

      const months = member.years.get(record.year);

      if (!months.has(record.month)) {
        months.set(record.month, []);
      }

      months.get(record.month).push(record);
      member.filesCount += 1;
      if (isNewer(record, member.latest)) member.latest = record;
    });

    const sortedMembers = [...membersMap.values()].sort((a, b) =>
      (a.faculty_name || "").localeCompare(b.faculty_name || "", "ar")
    );

    const yearsSorted = (membersArr) =>
      membersArr.map((member) => ({
        ...member,
        years: [...member.years.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([year, months]) => ({
            year,
            months: [...months.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([month, rows]) => ({ month, rows })),
          })),
      }));

    return yearsSorted(sortedMembers);
  }, [records]);

  const openRecord = (record) => {
    setSelectedRecord(record);
  };

  // إعادة تعيين مفتاح إعادة فرض RecordViewer عند التنقل
  const [viewerKey, setViewerKey] = useState(0);

  const navigateRecord = (record) => {
    setViewerKey((k) => k + 1);
    setSelectedRecord(record);
  };

  /* ------------------ اختيار الملفات وفحصها ------------------ */
  const handleSelectFiles = (event) => {
    const files = [...(event.target.files || [])];
    if (files.length === 0) return;

    const stagedFiles = files.map((file) => {
      const meta = extractMetaFromFilename(file.name.replace(/\.pdf$/i, ""));
      return {
        file,
        originalName: file.name,
        extracted: meta,
        [NAME_COL]: "",
        computer_number: meta.computerNumber || "",
        year: meta.year || "",
        month: meta.month || "",
        needsReview: !meta.year || !meta.month || !meta.computerNumber,
      };
    });


    setStaged(stagedFiles);
    setViewMode("import");
    event.target.value = "";
  };

  const updateStaged = (index, field, value) => {
    setStaged((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, [field]: value };
        next.needsReview =
          !String(next.year).trim() ||
          !String(next.month).trim() ||
          !String(next.computer_number).trim() ||
          !String(next[NAME_COL]).trim();
        return next;
      })
    );
  };

  const sanitizeForPath = (value) => sanitizeName(value);

  const buildArchiveRecord = async (item) => {
    const currentYear = Number(item.year);
    const currentMonth = Number(item.month);
    const computerNumber = sanitizeForPath(item.computer_number);
    const safeOriginal = asciiSafe(item.originalName) || "salary";

    const folder = `${storageRoot}/${computerNumber}/${currentYear}/${String(currentMonth).padStart(2, "0")}`;

    const { count } = await supabase
      .from(ARCHIVE_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("computer_number", computerNumber)
      .eq("year", currentYear)
      .eq("month", currentMonth);

    const sequence = (count || 0) + 1;

    const pdfPath = `${folder}/${String(currentMonth).padStart(2, "0")}-${sequence}-${safeOriginal}`;
    const fileUrl = await uploadToBucket(BUCKET, pdfPath, item.file, "application/pdf");

    setImportProgress(`تحويل الـPDF إلى صور (${item.originalName})`);
    const { images, pageCount } = await renderPdfPagesToJpeg(await item.file.arrayBuffer());

    const previewUrls = [];
    for (let i = 0; i < images.length; i += 1) {
      const previewPath = `${folder}/previews/${String(currentMonth).padStart(2, "0")}-${sequence}-page-${i + 1}.jpg`;
      const url = await uploadToBucket(BUCKET, previewPath, dataUrlToBlob(images[i]), "image/jpeg");
      previewUrls.push(url);
    }

    return {
      [NAME_COL]: item[NAME_COL].trim(),
      computer_number: String(computerNumber),
      year: currentYear,
      month: currentMonth,
      sequence,
      file_url: fileUrl,
      preview_url: previewUrls[0] || null,
      preview_urls: previewUrls,
      page_count: pageCount,
      file_path: pdfPath,
      original_filename: item.originalName,
      created_by: currentUser?.full_name || currentUser?.username || null,
    };
  };

  const importAllStaged = async () => {
    const incomplete = staged.filter((item) => item.needsReview);
    if (incomplete.length > 0) {
      alert("توجد ملفات غير مكتملة البيانات. أكمل البيانات أو أرسلها لقائمة المراجعة.");
      return;
    }

    setImporting(true);
    setError("");
    let successCount = 0;

    try {
      const duplicates = [];
      for (let i = 0; i < staged.length; i += 1) {
        const item = staged[i];
        setImportProgress(`فحص البيانات (${i + 1}/${staged.length}): ${item.originalName}`);

        const { count } = await supabase
          .from(ARCHIVE_TABLE)
          .select("*", { count: "exact", head: true })
          .eq("computer_number", sanitizeForPath(item.computer_number))
          .eq("year", Number(item.year))
          .eq("month", Number(item.month));

        if ((count || 0) > 0) duplicates.push(item.originalName);
      }

      if (duplicates.length > 0) {
        const proceed = window.confirm(
          `تم العثور على ${duplicates.length} ملف مسجلة بالفعل لنفس ${cfg.memberLabel} في نفس السنة والشهر:\n\n` +
            duplicates.map((n) => `• ${n}`).join("\n") +
            `\n\nسيتم إضافة نسخة إضافية ولن يُحذف السجل القديم. هل تريدين المتابعة؟`
        );
        if (!proceed) return;
      }

      for (let i = 0; i < staged.length; i += 1) {
        const item = staged[i];
        setImportProgress(`رفع ومعالجة (${i + 1}/${staged.length}): ${item.originalName}`);

        const record = await buildArchiveRecord(item);
        const { error: insertError } = await supabase.from(ARCHIVE_TABLE).insert(record);
        if (insertError) throw new Error(`${item.originalName}: ${insertError.message}`);

        successCount += 1;
      }

      alert(`تم استيراد ${successCount} ملف بنجاح إلى الأرشيف.`);
      setStaged([]);

      setViewMode("archive");
      await Promise.all([refreshResults(), refreshMeta()]);
    } catch (err) {
      console.error("خطأ في الاستيراد:", err);
      setError("تعذر استيراد الملفات: " + err.message);
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  };

  const sendToReview = async () => {
    if (staged.length === 0) return;

    setImporting(true);
    setError("");

    try {
      let addedCount = 0;

      for (let i = 0; i < staged.length; i += 1) {
        const item = staged[i];
        setImportProgress(`رفع ملف للمراجعة (${i + 1}/${staged.length}): ${item.originalName}`);

        const computerNumber = sanitizeForPath(item.computer_number) || "unidentified";
        const yearFolder = item.year || "unidentified";
        const monthFolder = item.month ? String(item.month).padStart(2, "0") : "unidentified";
        const folder = `${storageRoot}/${computerNumber}/${yearFolder}/${monthFolder}`;
        const safeOriginal = asciiSafe(item.originalName) || "salary";
        const pdfPath = `${folder}/review-${createUniqueToken()}-${safeOriginal}.pdf`;

const fileUrl = await uploadToBucket(BUCKET, pdfPath, item.file, "application/pdf");

        const { error: insertError } = await supabase.from(IMPORTS_TABLE).insert({
          file_name: item.originalName,
          storage_path: pdfPath,
          file_url: fileUrl,
          extracted_name: item.extracted?.name || null,
          extracted_computer_number: item.extracted?.computerNumber || null,
          extracted_year: item.extracted?.year || null,
          extracted_month: item.extracted?.month || null,
          status: "needs_review",
          notes: "بيانات غير مؤكدة - تحتاج مراجعة يدوية",
        });

        if (insertError) throw new Error(`${item.originalName}: ${insertError.message}`);

        addedCount += 1;
      }

      alert(`تم إرسال ${addedCount} ملف إلى قائمة المراجعة.`);
      setStaged([]);

      await refreshReviewRows();
      setViewMode("review");
    } catch (err) {
      console.error("خطأ في إرسال المراجعة:", err);
      setError("تعذر إرسال الملفات للمراجعة: " + withMigrationHint(err, cfg));
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  };

  /* ------------------ قائمة المراجعة ------------------ */
  const refreshReviewRows = async () => {
    setReviewLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from(IMPORTS_TABLE)
        .select("*")
        .eq("status", "needs_review")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;
      setReviewRows(data || []);
    } catch (err) {
      console.error("خطأ في تحميل المراجعة:", err);
      setError("تعذر تحميل قائمة المراجعة: " + err.message);
    } finally {
      setReviewLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === "review") {
      refreshReviewRows();
    }
  }, [viewMode]);

  const updateReviewRow = (index, field, value) => {
    setReviewRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const confirmReviewRow = async (index) => {
    const row = reviewRows[index];
    const facultyName = (row[NAME_COL] || row.extracted_name || "").trim();
    const computerNumber = (row.computer_number || row.extracted_computer_number || "").trim();
    const year = row.year || row.extracted_year;
    const month = row.month || row.extracted_month;

    if (!facultyName || !computerNumber || !year || !month) {
      alert("أكمل الاسم ورقم الكمبيوتر والسنة والشهر قبل إضافة المفردة للأرشيف.");
      return;
    }

    setImporting(true);
    setError("");

    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(row.storage_path);

      if (downloadError || !fileData) {
        throw new Error(`تعذر تحميل الملف من التخزين: ${row.storage_path}`);
      }

      const stagedItem = {
        file: new File([fileData], row.file_name || "salary.pdf", { type: "application/pdf" }),
        originalName: row.file_name || "salary.pdf",
        [NAME_COL]: facultyName,
        computer_number: computerNumber,
        year: Number(year),
        month: Number(month),
        needsReview: false,
      };

      const record = await buildArchiveRecord(stagedItem);

      const { error: insertError } = await supabase.from(ARCHIVE_TABLE).insert(record);
      if (insertError) throw new Error(`تعذر إضافة المفردة للأرشيف: ${insertError.message}`);

      const { error: updateError } = await supabase
        .from(IMPORTS_TABLE)
        .update({ status: "imported", updated_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateError) throw new Error(`تعذر تحديث حالة المراجعة: ${updateError.message}`);

      alert("تمت إضافة المفردة إلى الأرشيف بنجاح.");
      await Promise.all([refreshResults(), refreshMeta(), refreshReviewRows()]);
    } catch (err) {
      console.error("خطأ في تأكيد مراجعة:", err);
      setError("تعذر تأكيد المراجعة: " + err.message);
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  };

  const discardReviewRow = async (index) => {
    const row = reviewRows[index];
    if (!window.confirm(`هل تريدين تجاهل الملف "${row.file_name}"؟ سيتم الاحتفاظ بملفه فقط.`)) {
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from(IMPORTS_TABLE)
        .update({ status: "discarded", updated_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateError) throw updateError;
      await refreshReviewRows();
    } catch (err) {
      console.error("خطأ في تجاهل الملف:", err);
      setError("تعذر تجاهل الملف: " + err.message);
    }
  };

  /* ------------------ أدوات مساعدة ------------------ */
  const refreshResults = async () => {
    pageRef.current = 0;
    const q = search.trim();

    let query = supabase
      .from(ARCHIVE_TABLE)
      .select("*", { count: "exact" })
      .range(0, PAGE_SIZE - 1);

    if (q) query = applyCombinedSearch(query, NAME_COL, 'computer_number', q);
    if (selectedYears.length > 0) query = query.in("year", selectedYears.map(Number));
    if (selectedMonths.length > 0) query = query.in("month", selectedMonths.map(Number));

    const { data, count, error: queryError } = await query
      .order("computer_number", { ascending: true })
      .order("year", { ascending: false })
      .order("month", { ascending: true })
      .order("sequence", { ascending: true });

    if (queryError) throw queryError;
    setRecords(data || []);
    setTotalCount(count || 0);
    setLoadedAll(!data || data.length < PAGE_SIZE);
  };

  const refreshMeta = async () => {
    const { yearList, monthList, memberRows } = await loadMetaData();
    setYears(yearList);
    setAvailableMonths(monthList);
    setMembers(memberRows);
  };

  /* ------------------ فلاتر متعددة ------------------ */
  const toggleYear = (value) => {
    setSelectedYears((current) => {
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      /* إذا تم اختيار كل السنوات المتاحة، يعادل «كل السنوات» (بدون فلتر) */
      if (yearOptionsList.length > 0 && next.length === yearOptionsList.length) return [];
      return next.sort((a, b) => b - a);
    });
  };

  const toggleMonth = (value) => {
    setSelectedMonths((current) => {
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (monthOptionsList.length > 0 && next.length === monthOptionsList.length) return [];
      return next.sort((a, b) => a - b);
    });
  };

  /* «تحديد الكل» = «كل السنوات/الشهور» = بدون فلتر */
  const selectAllYears = () => setSelectedYears([]);
  const clearAllYears = () => setSelectedYears([]);
  const selectAllMonths = () => setSelectedMonths([]);
  const clearAllMonths = () => setSelectedMonths([]);

  const clearFilters = () => {
    setSearch("");
    setSelectedYears([]);
    setSelectedMonths([]);
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([refreshResults(), refreshMeta()]);
    } catch (err) {
      console.error("خطأ في تحديث الأرشيف:", err);
      setError("تعذر تحديث الأرشيف: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (record) => {
    setError("");
    if (!record || !record.file_url) {
      setError("لا يوجد ملف PDF لهذه المفردة.");
      return;
    }
    const filename =
      record.original_filename ||
      `${record[NAME_COL]} - ${record.year} - ${monthName(record.month)}.pdf`;
    const link = document.createElement("a");
    link.href = record.file_url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ------------------ الواجهة ------------------ */
  const filterRowStyle = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 16,
  };

  const controlStyle = {
    border: "1px solid #CBD5E1",
    background: "#fff",
    borderRadius: 8,
    padding: "11px 12px",
    fontSize: 14,
    fontFamily: "inherit",
  };

  return (
    <div style={{ paddingBottom: 24 }}>
      <style>{`
        .fsa-skeleton-line,
        .fsa-skeleton-thumb {
          background: linear-gradient(90deg, #EEF1F5 25%, #E6EBF2 50%, #EEF1F5 75%);
          background-size: 200% 100%;
          animation: fsa-shimmer 1.4s ease-in-out infinite;
          border-radius: 8px;
        }
        @keyframes fsa-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <datalist id="fsa-members-list">
        {members.map((m) => (
          <option key={`${m.computer_number}|${m[NAME_COL]}`} value={m[NAME_COL]}>
            {m[NAME_COL]} - {cfg.numberLabel}: {m.computer_number}
          </option>
        ))}
      </datalist>

      {/* العنوان الرئيسي */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 8, fontWeight: 600 }}>
            قسم الاستحقاقات
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 34, lineHeight: 1 }}>{cfg.headerEmoji}</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 25, fontWeight: 900, color: "#0F2942", lineHeight: 1.35 }}>
                {cfg.title}
              </h2>
              <p style={{ margin: "5px 0 0", color: "#64748B", fontSize: 13.5, lineHeight: 1.8 }}>
                {cfg.id === "faculty"
                  ? "متابعة الأعمال وتقييم الأداء بصورة يومية وأسبوعية وشهرية"
                  : cfg.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={handleRefresh}
            style={headerIconButtonStyle}
            disabled={loading}
            title="تحديث الأرشيف"
          >
            🔄 تحديث
          </button>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setNotifyOpen((v) => !v)}
              style={headerIconButtonStyle}
              title="الإشعارات"
            >
              🔔
            </button>
            {notifyOpen && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "calc(100% + 8px)",
                  background: "#fff",
                  border: "1px solid #E2E8F0",
                  borderRadius: 12,
                  boxShadow: "0 16px 34px rgba(15,41,66,.14)",
                  zIndex: 50,
                  padding: "14px 16px",
                  minWidth: 220,
                  fontSize: 13,
                  color: "#334155",
                }}
              >
                لا توجد إشعارات جديدة حاليًا. ✔️
              </div>
            )}
          </div>
        </div>
      </div>

      {/* شريط معلومات */}
      <div style={infoBannerStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 34, lineHeight: 1 }}>📄</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 6, color: "#1E3A5F" }}>
              {cfg.title}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.9, color: "#47607D" }}>
              يتيح لك عرض سريع للمفردات من الأرشيف (مسح ضوئي PDF أصلي). ابحث بالاسم أو رقم الكمبيوتر مع
              فلترة أكثر من سنة أو شهر معًا، واعاين أو نزّل أي مفردة مباشرة.
            </div>
          </div>
        </div>
      </div>

      {/* التبويبات */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {[
          { id: "archive", label: "🔎 الأرشيف" },
          { id: "import", label: "📥 استيراد جماعي" },
          { id: "review", label: "⚠️ يحتاج مراجعة" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id)}
            style={{
              border: viewMode === tab.id ? "1px solid #1E3A5F" : "1px solid #DCE6F2",
              background: viewMode === tab.id ? "#1E3A5F" : "#fff",
              color: viewMode === tab.id ? "#fff" : "#334A63",
              borderRadius: 10,
              padding: "10px 18px",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              boxShadow:
                viewMode === tab.id ? "0 3px 10px rgba(30,58,95,.22)" : "0 1px 3px rgba(15,41,66,.04)",
            }}
          >
            {tab.label}
            {tab.id === "review" && reviewRows.length > 0 && (
              <span
                style={{
                  background: viewMode === tab.id ? "#fff" : "#B3464E",
                  color: viewMode === tab.id ? "#1E3A5F" : "#fff",
                  borderRadius: 999,
                  padding: "1px 8px",
                  fontSize: 11,
                  fontWeight: 900,
                  marginRight: 6,
                }}
              >
                {reviewRows.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            background: "#FEE2E2",
            border: "1px solid #FECACA",
            color: "#991B1B",
            borderRadius: 9,
            padding: 12,
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* ==================== استيراد جماعي ==================== */}
      {viewMode === "import" && (
        <div>
          <div
            style={{
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              borderRadius: 12,
              padding: 18,
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1E40AF", marginBottom: 6 }}>
              📤 استيراد جماعي لملفات PDF
            </div>
            <p style={{ margin: "0 0 12px", color: "#475569", fontSize: 13, lineHeight: 1.8 }}>
              يمكنك اختيار عدد كبير من ملفات PDF دفعة واحدة. يتم استخراج السنة والشهر ورقم الكمبيوتر من اسم الملف
              تلقائيًا عندما تكون واضحة وموثوقة. أي ملف لا يمكن استخراج بياناته بشكل قاطع يُرسل إلى قائمة
              «يحتاج مراجعة» ولا يتم إضافته للأرشيف إلا بعد تصحيحه يدويًا — بدون أي تخمين.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleSelectFiles}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: 0,
                background: "#2563EB",
                color: "#fff",
                borderRadius: 9,
                padding: "12px 18px",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ＋ اختيار ملفات PDF
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              onClick={() => setOcrMode(false)}
              style={{
                border: ocrMode ? "1px solid #CBD5E1" : "1px solid #2563EB",
                background: ocrMode ? "#fff" : "#EFF6FF",
                color: ocrMode ? "#334155" : "#1D4ED8",
                borderRadius: 9,
                padding: "9px 14px",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              📦 استيراد يدوي
            </button>
            <button
              onClick={() => setOcrMode(true)}
              style={{
                border: ocrMode ? "1px solid #7C3AED" : "1px solid #CBD5E1",
                background: ocrMode ? "#F5F3FF" : "#fff",
                color: ocrMode ? "#6D28D9" : "#334155",
                borderRadius: 9,
                padding: "9px 14px",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              🔮 استيراد شهري بالـOCR (تقسيم آلي)
            </button>
          </div>

          {ocrMode && (
            <OcrSplitPanel
              currentUser={currentUser}
              config={cfg}
              onImportComplete={() => {
                setOcrMode(false);
                Promise.all([refreshResults(), refreshMeta()]);
              }}
              onBack={() => setOcrMode(false)}
            />
          )}

          {!ocrMode && staged.length > 0 && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  مراجعة بيانات الملفات ({staged.length})
                </h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={sendToReview}
                    disabled={importing}
                    style={{
                      border: "1px solid #B45309",
                      background: "#FEF3C7",
                      color: "#92400E",
                      borderRadius: 9,
                      padding: "10px 14px",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: importing ? "not-allowed" : "pointer",
                      opacity: importing ? 0.6 : 1,
                    }}
                  >
                    ⚠️ إرسال غير المكتمل للمراجعة
                  </button>
                  <button
                    onClick={importAllStaged}
                    disabled={importing}
                    style={{
                      border: 0,
                      background: "#047857",
                      color: "#fff",
                      borderRadius: 9,
                      padding: "10px 18px",
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: importing ? "not-allowed" : "pointer",
                      opacity: importing ? 0.6 : 1,
                    }}
                  >
                    {importing ? "جاري الاستيراد..." : "استيراد جميع الملفات للأرشيف"}
                  </button>
                </div>
              </div>

              {importing && importProgress && (
                <div
                  style={{
                    background: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    color: "#065F46",
                    borderRadius: 9,
                    padding: 10,
                    marginBottom: 10,
                    fontSize: 13,
                  }}
                >
                  ⏳ {importProgress}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {staged.map((item, index) => (
                  <StagedFileRow
                    key={`${item.originalName}-${index}`}
                    item={item}
                    index={index}
                    yearOptions={years}
                    nameCol={NAME_COL}
                    numberLabel={cfg.numberLabel}
                    numberPlaceholder={cfg.numberPlaceholder}
                    memberLabel={cfg.memberLabel}
                    memberPlaceholder={cfg.memberPlaceholder}
                    onChange={updateStaged}
                    onRemove={() => {
                      setStaged((current) => current.filter((_, i) => i !== index));
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {!ocrMode && staged.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8" }}>
              لم يتم اختيار ملفات بعد. اضغطي «اختيار ملفات PDF» لبدء الاستيراد الجماعي.
            </div>
          )}
        </div>
      )}

      {/* ==================== يحتاج مراجعة ==================== */}
      {viewMode === "review" && (
        <div>
          <div
            style={{
              background: "#FFFBEB",
              border: "1px solid #FDE68A",
              borderRadius: 12,
              padding: 14,
              marginBottom: 14,
              fontSize: 13,
              color: "#92400E",
              lineHeight: 1.8,
            }}
          >
            هذه الملفات لم تتم إضافتها للأرشيف لأن بياناتها (الاسم/رقم الكمبيوتر/السنة/الشهر) غير واضحة أو غير
            مؤكدة. أكملي البيانات ثم اضغطي «إضافة للأرشيف». لا يتم استخراج اسم العضو تلقائيًا حفاظًا على الدقة.
          </div>

          {reviewLoading && <div style={{ color: "#64748B", padding: 12 }}>جاري تحميل قائمة المراجعة...</div>}

          {!reviewLoading && reviewRows.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8" }}>
              لا توجد ملفات تحتاج مراجعة حاليًا. ✔️
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reviewRows.map((row, index) => (
              <ReviewRow
                key={row.id}
                row={row}
                index={index}
                yearOptions={years}
                nameCol={NAME_COL}
                numberLabel={cfg.numberLabel}
                numberPlaceholder={cfg.numberPlaceholder}
                memberLabel={cfg.memberLabel}
                memberPlaceholder={cfg.memberPlaceholder}
                onChange={updateReviewRow}
                onConfirm={confirmReviewRow}
                onDiscard={discardReviewRow}
                busy={importing}
              />
            ))}
          </div>
        </div>
      )}

      {/* ==================== الأرشيف ==================== */}
      {viewMode === "archive" && (
        <div>
          {/* البحث والفلاتر */}
          <div style={filterRowStyle}>
            <input
              type="search"
              placeholder={
                cfg.id === "faculty"
                  ? "🔎 ابحث باسم الموظف أو رقم الكمبيوتر..."
                  : cfg.searchPlaceholder
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                ...controlStyle,
                flex: 1,
                minWidth: 240,
                maxWidth: 420,
                borderRadius: 10,
                boxShadow: "0 1px 3px rgba(15,41,66,.06)",
              }}
            />

            <MultiSelectDropdown
              icon="📅"
              label="السنوات"
              placeholder="كل السنوات"
              allLabel="كل السنوات"
              open={yearOpen}
              onOpen={setYearOpen}
              options={yearOptionsList.map((y) => ({ value: y, label: `سنة ${y}` }))}
              selected={selectedYears}
              onToggle={toggleYear}
              onSelectAll={selectAllYears}
              onClearAll={clearAllYears}
            />

            <MultiSelectDropdown
              icon="🗓️"
              label="الشهور"
              placeholder="كل الشهور"
              allLabel="كل الشهور"
              open={monthOpen}
              onOpen={setMonthOpen}
              options={monthOptionsList.map((m) => ({ value: m, label: monthName(m) }))}
              selected={selectedMonths}
              onToggle={toggleMonth}
              onSelectAll={selectAllMonths}
              onClearAll={clearAllMonths}
            />

            <button onClick={clearFilters} style={clearFiltersButtonStyle}>
              🗑 مسح الفلاتر
            </button>
          </div>

          {(selectedYears.length > 0 || selectedMonths.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {selectedYears.map((year) => (
                <span key={`y-${year}`} style={chipStyle}>
                  📅 {year}
                  <button
                    type="button"
                    onClick={() => toggleYear(year)}
                    style={chipRemoveStyle}
                    aria-label={`إزالة ${year}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {selectedMonths.map((month) => (
                <span key={`m-${month}`} style={chipStyle}>
                  🗓️ {monthName(month)}
                  <button
                    type="button"
                    onClick={() => toggleMonth(month)}
                    style={chipRemoveStyle}
                    aria-label={`إزالة ${monthName(month)}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 14,
              fontSize: 13.5,
              color: "#475569",
              fontWeight: 700,
            }}
          >
            <span style={{ color: "#64748B" }}>تم العثور على</span>
            <span
              style={{
                background: "#EFF6FF",
                color: "#1D4ED8",
                borderRadius: 999,
                padding: "4px 12px",
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              {totalCount} ملف
            </span>
            <span style={{ color: "#64748B" }}>مطابقة</span>
          </div>

          {loading && records.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[0, 1, 2].map((s) => (
                <div key={s} style={skeletonCardStyle}>
                  <div className="fsa-skeleton-line" style={{ width: "55%", height: 18, marginBottom: 12 }} />
                  <div className="fsa-skeleton-line" style={{ width: "34%", height: 13, marginBottom: 16 }} />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {[0, 1, 2, 3].map((t) => (
                      <div key={t} className="fsa-skeleton-thumb" style={{ height: 84 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "56px 24px",
                background: "#fff",
                border: "1px dashed #CBD5E1",
                borderRadius: 18,
                color: "#94A3B8",
              }}
            >
              <div style={{ fontSize: 46, marginBottom: 10 }}>📁</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#334155", marginBottom: 6 }}>
                لا توجد ملفات مطابقة للبحث
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
                جرّب تغيير الاسم أو السنة أو الشهر، أو اضغطي «مسح الفلاتر» لعرض كامل الأرشيف.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {grouped.map((member) => (
                <div
                  key={`${member.computer_number}|${member.faculty_name}`}
                  style={{
                    background: "#fff",
                    border: "1px solid #E7EBF0",
                    borderRadius: 16,
                    padding: 18,
                    boxShadow: "0 2px 10px rgba(15,41,66,.045)",
                  }}
                >
                  {/* رأس العضو */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 220 }}>
                      <span
                        style={{
                          width: 48,
                          height: 48,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          background: "linear-gradient(135deg,#2B5FA8,#5B8BC9)",
                          color: "#fff",
                          fontSize: 22,
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        {(member.faculty_name || "؟").trim().charAt(0)}
                      </span>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 900, color: "#0F2942", lineHeight: 1.4 }}>
                          {member.faculty_name}
                        </div>
                        <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
                          💻 {cfg.numberLabel}: {member.computer_number}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 10,
                      }}
                    >
                      <span style={memberChipStyle}>📄 عدد الملفات: {member.filesCount}</span>
                      <span style={memberChipStyle}>
                        📅 آخر تحديث:{" "}
                        {formatShortDate((member.latest && member.latest.updated_at) || (member.latest && member.latest.created_at))}
                      </span>
                      <button onClick={() => openRecord(member.latest)} style={previewButtonStyle}>
                        👁️ معاينة سريعة
                      </button>
                      <button onClick={() => handleDownload(member.latest)} style={downloadButtonStyle}>
                        📥 تحميل
                      </button>
                    </div>
                  </div>

                  {/* السنوات */}
                  {member.years.map((yearBlock) => (
                    <div key={yearBlock.year} style={{ marginBottom: 16 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <span
                          style={{
                            background: "#EFF6FF",
                            color: "#1D4ED8",
                            borderRadius: 8,
                            padding: "5px 12px",
                            fontWeight: 900,
                            fontSize: 15,
                            whiteSpace: "nowrap",
                          }}
                        >
                          📅 {yearBlock.year}
                        </span>
                        <div style={{ height: 1, flex: 1, background: "#E5E7EB" }} />
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                          gap: 12,
                        }}
                      >
                        {yearBlock.months.map((monthBlock) => (
                          <div key={monthBlock.month}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 800,
                                color: "#334155",
                                marginBottom: 8,
                              }}
                            >
                              {monthName(monthBlock.month)}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {monthBlock.rows.map((record) => (
                                <ThumbnailCard
                                  key={record.id}
                                  record={record}
                                  onOpen={openRecord}
                                  onDownload={handleDownload}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {!loadedAll && !loading && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={loadMore}
                style={{
                  border: "1px solid #2563EB",
                  background: "#EFF6FF",
                  color: "#1D4ED8",
                  borderRadius: 9,
                  padding: "11px 22px",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                تحميل المزيد من النتائج
              </button>
            </div>
          )}
        </div>
      )}

      {/* معاينة المفردة */}
      {selectedRecord && (
        <RecordViewer
          key={viewerKey}
          record={selectedRecord}
          records={records}
          nameCol={NAME_COL}
          numberLabel={cfg.numberLabel}
          onClose={() => setSelectedRecord(null)}
          onNavigate={navigateRecord}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   أنماط وأدوات مساعدة (خاصة بهذه الصفحة)
------------------------------------------------------------------ */
const headerIconButtonStyle = {
  border: "1px solid #DCE6F2",
  background: "#fff",
  color: "#1E3A5F",
  borderRadius: 11,
  padding: "10px 16px",
  fontWeight: 800,
  fontSize: 13.5,
  cursor: "pointer",
  boxShadow: "0 1px 4px rgba(15,41,66,.06)",
};

const infoBannerStyle = {
  background: "#EDF4FF",
  border: "1px solid #CFE0F7",
  color: "#1E3A5F",
  borderRadius: 16,
  padding: "18px 20px",
  marginBottom: 18,
};

const clearFiltersButtonStyle = {
  border: "1px solid #F0D5D8",
  background: "#FDF4F4",
  color: "#B3464E",
  borderRadius: 10,
  padding: "11px 18px",
  fontWeight: 800,
  fontSize: 13.5,
  cursor: "pointer",
};

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#EDF4FF",
  border: "1px solid #C7DBF5",
  color: "#1E4E8C",
  borderRadius: 999,
  padding: "5px 10px",
  paddingLeft: 6,
  fontSize: 12.5,
  fontWeight: 800,
};

const chipRemoveStyle = {
  border: 0,
  background: "transparent",
  color: "#1E4E8C",
  fontSize: 15,
  lineHeight: 1,
  cursor: "pointer",
  padding: "0 4px",
  borderRadius: 999,
};

const skeletonCardStyle = {
  background: "#fff",
  border: "1px solid #EEF1F5",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 2px 8px rgba(15,41,66,.035)",
};

const memberChipStyle = {
  background: "#F4F7FB",
  border: "1px solid #E2E9F2",
  color: "#47607D",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const previewButtonStyle = {
  border: "1px solid #C8DAF2",
  background: "#EDF4FF",
  color: "#1E4E8C",
  borderRadius: 9,
  padding: "8px 14px",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const downloadButtonStyle = {
  border: "1px solid #2B5FA8",
  background: "#2B5FA8",
  color: "#fff",
  borderRadius: 9,
  padding: "8px 14px",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

function formatShortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ar-EG", {
    numberingSystem: "latn",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isNewer(a, b) {
  if (!b) return true;
  const aKey = (a.year << 8) + (a.month || 0);
  const bKey = (b.year << 8) + (b.month || 0);
  if (aKey !== bKey) return aKey > bKey;
  return (a.sequence || 1) >= (b.sequence || 1);
}

/* ------------------------------------------------------------------
   قائمة اختيار متعدد (سنوات / شهور)
------------------------------------------------------------------ */
function MultiSelectDropdown({ icon, label, placeholder, allLabel, open, onOpen, options, selected, onToggle, onSelectAll, onClearAll }) {
  const nothingSelected = selected.length === 0;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => onOpen(!open)}
        style={{
          border: "1px solid #D6E0EC",
          background: "#fff",
          borderRadius: 10,
          padding: "11px 14px",
          fontSize: 14,
          fontWeight: 800,
          color: "#1E3A5F",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          boxShadow: "0 1px 3px rgba(15,41,66,.05)",
          whiteSpace: "nowrap",
        }}
      >
        <span>{icon}</span>
        <span>
          {nothingSelected ? allLabel || placeholder : `${label}: ${selected.length}`}
        </span>
        <span style={{ fontSize: 10, color: "#64748B" }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 12,
            boxShadow: "0 16px 34px rgba(15,41,66,.13)",
            zIndex: 40,
            minWidth: 240,
            maxWidth: "calc(100vw - 32px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "10px 12px",
              borderBottom: "1px solid #EFF3F8",
            }}
          >
            <button type="button" onClick={onSelectAll} style={msActionButtonStyle}>
              تحديد الكل
            </button>
            <button type="button" onClick={onClearAll} style={msActionButtonStyle}>
              إلغاء تحديد الكل
            </button>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 260, padding: 6 }}>
            {allLabel && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 10px",
                  borderRadius: 9,
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 800,
                  color: "#1E3A5F",
                }}
              >
                <input
                  type="checkbox"
                  checked={nothingSelected}
                  onChange={onClearAll}
                  style={{ accentColor: "#2563EB", width: 16, height: 16, cursor: "pointer" }}
                />
                <span>{allLabel}</span>
              </label>
            )}
            {options.map((option) => (
              <label
                key={String(option.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 10px",
                  borderRadius: 9,
                  cursor: "pointer",
                  fontSize: 13.5,
                  color: "#334155",
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => onToggle(option.value)}
                  style={{ accentColor: "#2563EB", width: 16, height: 16, cursor: "pointer" }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const msActionButtonStyle = {
  border: "1px solid #DBEAFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
  borderRadius: 7,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

/* ------------------------------------------------------------------
   صف ملف وارد للاستيراد
------------------------------------------------------------------ */
function StagedFileRow({ item, index, yearOptions, onChange, onRemove, nameCol, numberLabel, numberPlaceholder, memberLabel, memberPlaceholder }) {
  const metaHints = [];

  if (item.extracted.year) {
    metaHints.push(`السنة المستخرجة: ${item.extracted.year}`);
  }
  if (item.extracted.month) {
    metaHints.push(`الشهر المستخرج: ${monthName(item.extracted.month)}`);
  }
  if (item.extracted.computerNumber) {
    metaHints.push(`${numberLabel} المستخرج: ${item.extracted.computerNumber}`);
  }
  if (!item.extracted.year || !item.extracted.month || !item.extracted.computerNumber) {
    metaHints.push("⚠️ بيانات غير مكتملة — سيتم إرسالها للمراجعة إذا لم تُستكمل");
  }

  const inputStyle = {
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        background: item.needsReview ? "#FFFBEB" : "#F8FAFC",
        border: `1px solid ${item.needsReview ? "#FDE68A" : "#E2E8F0"}`,
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>
          📄 {item.originalName}
        </span>
        <button
          onClick={onRemove}
          style={{
            border: 0,
            background: "#FEE2E2",
            color: "#B91C1C",
            borderRadius: 7,
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          إزالة
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 8,
        }}
      >
        <div>
          <label style={fieldLabelStyle}>{memberLabel} *</label>
          <input
            list="fsa-members-list"
            value={item[nameCol]}
            onChange={(e) => onChange(index, nameCol, e.target.value)}
            placeholder={memberPlaceholder}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>{numberLabel} *</label>
          <input
            value={item.computer_number}
            onChange={(e) => onChange(index, "computer_number", e.target.value)}
            placeholder={numberPlaceholder}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>السنة *</label>
          <select
            value={item.year}
            onChange={(e) => onChange(index, "year", e.target.value)}
            style={inputStyle}
          >
            <option value="">اختر السنة</option>
            {[...new Set([...(yearOptions || []), ...Array.from({ length: 16 }, (_, i) => new Date().getFullYear() - i)])]
              .sort((a, b) => b - a)
              .map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label style={fieldLabelStyle}>الشهر *</label>
          <select
            value={item.month}
            onChange={(e) => onChange(index, "month", e.target.value)}
            style={inputStyle}
          >
            <option value="">اختر الشهر</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {metaHints.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#6B7280", lineHeight: 1.8 }}>
          {metaHints.join(" • ")}
        </div>
      )}
    </div>
  );
}

const fieldLabelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  marginBottom: 5,
};

/* ------------------------------------------------------------------
   صف في قائمة المراجعة
------------------------------------------------------------------ */
function ReviewRow({ row, index, yearOptions, onChange, onConfirm, onDiscard, busy, nameCol, numberLabel, numberPlaceholder, memberLabel, memberPlaceholder }) {
  const inputStyle = {
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  };

  const extractedHints = [];
  if (row.extracted_year) extractedHints.push(`السنة: ${row.extracted_year}`);
  if (row.extracted_month) extractedHints.push(`الشهر: ${monthName(row.extracted_month)}`);
  if (row.extracted_computer_number) extractedHints.push(`${numberLabel}: ${row.extracted_computer_number}`);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #FDE68A",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#1E293B" }}>
            📄 {row.file_name}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>
            {extractedHints.length > 0
              ? extractedHints.join(" • ")
              : "لم يُستخرج شيء من اسم الملف — أدخلي البيانات يدويًا"}
          </div>
        </div>
        <span
          style={{
            background: "#FEF3C7",
            color: "#92400E",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          ⚠️ يحتاج مراجعة
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div>
          <label style={fieldLabelStyle}>{memberLabel} *</label>
          <input
            list="fsa-members-list"
            value={row[nameCol] || row.extracted_name || ""}
            onChange={(e) => onChange(index, nameCol, e.target.value)}
            placeholder={memberPlaceholder}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>{numberLabel} *</label>
          <input
            value={row.computer_number || row.extracted_computer_number || ""}
            onChange={(e) => onChange(index, "computer_number", e.target.value)}
            placeholder={numberPlaceholder}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>السنة *</label>
          <select
            value={row.year || row.extracted_year || ""}
            onChange={(e) => onChange(index, "year", e.target.value)}
            style={inputStyle}
          >
            <option value="">اختر السنة</option>
            {[...new Set([...(yearOptions || []), ...Array.from({ length: 16 }, (_, i) => new Date().getFullYear() - i)])]
              .sort((a, b) => b - a)
              .map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label style={fieldLabelStyle}>الشهر *</label>
          <select
            value={row.month || row.extracted_month || ""}
            onChange={(e) => onChange(index, "month", e.target.value)}
            style={inputStyle}
          >
            <option value="">اختر الشهر</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => onConfirm(index)}
          disabled={busy}
          style={{
            border: 0,
            background: "#047857",
            color: "#fff",
            borderRadius: 8,
            padding: "9px 16px",
            fontWeight: 800,
            fontSize: 13,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          ✔ إضافة للأرشيف
        </button>
        <button
          onClick={() => onDiscard(index)}
          disabled={busy}
          style={{
            border: "1px solid #FECACA",
            background: "#FEF2F2",
            color: "#B91C1C",
            borderRadius: 8,
            padding: "9px 14px",
            fontWeight: 800,
            fontSize: 13,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          🗑 تجاهل
        </button>
        {row.file_url && (
          <a
            href={row.file_url}
            target="_blank"
            rel="noreferrer"
            style={{
              border: "1px solid #CBD5E1",
              background: "#fff",
              color: "#334155",
              borderRadius: 8,
              padding: "9px 14px",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            📂 فتح الـPDF
          </a>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   بطاقة مصغرة لمفردة
------------------------------------------------------------------ */
function ThumbnailCard({ record, onOpen, onDownload }) {
  const previewSrc = record.preview_url || "";
  const fileName = record.original_filename || `${monthName(record.month)}-${record.year}`;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E2E9F2",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(15,41,66,.06)",
        display: "flex",
        flexDirection: "column",
        transition: "transform .15s ease, box-shadow .15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 6px 16px rgba(15,41,66,.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(15,41,66,.06)";
      }}
    >
      <button
        onClick={() => onOpen(record)}
        title={`${monthName(record.month)} ${record.year}${record.page_count > 1 ? ` (${record.page_count} صفحات)` : ""}`}
        style={{
          border: 0,
          padding: 0,
          cursor: "pointer",
          background: "transparent",
          textAlign: "right",
          fontFamily: "inherit",
          width: "100%",
        }}
      >
        <div
          style={{
            height: 150,
            background: "#F4F7FB",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {previewSrc ? (
            <img
              src={previewSrc}
              alt={`مفردة ${monthName(record.month)} ${record.year}`}
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9AAEBD",
                fontSize: 13,
              }}
            >
              لا توجد صورة
            </div>
          )}

          {record.page_count > 1 && (
            <span
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                background: "rgba(15,41,66,.82)",
                color: "#fff",
                borderRadius: 6,
                fontSize: 11,
                padding: "2px 7px",
              }}
            >
              {record.page_count} صفحات
            </span>
          )}
        </div>
      </button>

      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#1E3A5F" }}>
            {monthName(record.month)} {record.year}
          </span>
          <span style={{ fontSize: 11, color: "#7D93AB" }}>
            {record.preview_urls?.length > 1
              ? `${record.preview_urls.length} صفحات`
              : `${record.page_count || 1} صفحة`}
          </span>
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "#64748B",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={fileName}
        >
          📄 {fileName}
        </div>
        <button
          onClick={() => onDownload && onDownload(record)}
          style={{
            border: "1px solid #DCE6F2",
            background: "#fff",
            color: "#1E4E8C",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          📥 تحميل PDF
        </button>
      </div>
    </div>
  );
}
