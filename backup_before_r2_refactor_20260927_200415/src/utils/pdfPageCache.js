import { supabase } from "../supabaseClient";
import { openPdfDocument, renderPdfPageToJpeg } from "./executiveOrderPdf";

/* ------------------------------------------------------------------
   عرض صفحات PDF الممسوحة ضوئيًا دون تخزين صور معاينة في Storage.

   السبب: حفظ نسخة JPEG لكل صفحة كان يضاعف حجم الأرشيف داخل البكت
   حتى امتلأت حصة التخزين. الآن الصفحة تُرسم من الـPDF عند الطلب
   مع كاش صغير لأحدث المستندات المستخدمة.

   مصادر الملف المدعومة:
   - { bucket, path }  → تنزيل عبر Supabase Storage (يعمل مع RLS)
   - { url }           → fetch مباشر (للبكتات العامة)
------------------------------------------------------------------ */

const DOC_CACHE_LIMIT = 6;
const docCache = new Map();

function cacheKey(source) {
  if (source?.bucket && source?.path) return `b:${source.bucket}/${source.path}`;
  if (source?.url) return `u:${source.url}`;
  return "";
}

async function fetchPdfBytes(source) {
  if (source?.bucket && source?.path) {
    const { data, error } = await supabase.storage.from(source.bucket).download(source.path);
    if (error) throw error;
    if (!data || data.size === 0) throw new Error("الملف المخزن غير موجود أو فارغ.");
    return data.arrayBuffer();
  }

  if (source?.url) {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`تعذر تحميل الملف من المسار (${response.status}).`);
    return response.arrayBuffer();
  }

  throw new Error("لا يوجد مسار للملف.");
}

function dropDoc(key) {
  const doc = docCache.get(key);
  docCache.delete(key);
  if (doc && typeof doc.destroy === "function") {
    doc.destroy().catch(() => {});
  }
}

/* فتح (أو إعادة استخدام) مستند PDF مع الاحتفاظ بآخر DOC_CACHE_LIMIT مستند */
export async function loadPdfDoc(source) {
  const key = cacheKey(source);
  if (!key) throw new Error("لا يوجد مسار للملف.");

  const cached = docCache.get(key);
  if (cached) {
    docCache.delete(key);
    docCache.set(key, cached);
    return cached;
  }

  const doc = await openPdfDocument(await fetchPdfBytes(source));
  docCache.set(key, doc);

  while (docCache.size > DOC_CACHE_LIMIT) {
    dropDoc(docCache.keys().next().value);
  }

  return doc;
}

/* رسم صفحة واحدة حسب ترتيبها (0 = الصفحة الأولى).
   release: true يحرر المستند فورًا بعد الرسم — مناسب للبطاقات المصغرة
   حتى لا نحتفظ في الذاكرة بعدد كبير من المستندات. */
export async function renderPdfPageFromSource(source, pageIndex = 0, scale = 1.4, { release = false } = {}) {
  const key = cacheKey(source);
  const wasCached = release ? docCache.has(key) : false;
  const doc = await loadPdfDoc(source);

  try {
    return await renderPdfPageToJpeg(doc, pageIndex, scale);
  } finally {
    if (release && !wasCached) dropDoc(key);
  }
}

/* رسم صفحة مع عدد صفحات الملف (يُستعمل في العارض لبناء أزرار التنقل) */
export async function renderPdfPageWithCount(source, pageIndex = 0, scale = 1.4) {
  const doc = await loadPdfDoc(source);
  const image = await renderPdfPageToJpeg(doc, pageIndex, scale);
  return { image, pageCount: doc.numPages };
}

export function clearPdfDocCache() {
  [...docCache.keys()].forEach(dropDoc);
}
