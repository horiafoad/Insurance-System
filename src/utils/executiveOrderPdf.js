// executiveOrderPdf.js
//
// عمليات PDF لأرشيف الأوامر التنفيذية:
//   - تحويل صورة (JPG) إلى صفحة PDF عبر pdf-lib.
//   - دمج أمر جديد في ملف الشخص الحالي (إضافة الصفحات في نهاية الملف فقط —
//     كل الصفحات القديمة تُحفظ كما هي ولا يُحذف أو يُعدّل منها شيء).
//   - تحويل صفحات PDF إلى صور معاينة عبر pdfjs (نفس مكتبة عرض الأرشيف الحالية).
//
// pdf-lib هي مكتبة الكتابة/الدمج الوحيدة المضافة لهذه الميزة؛ pdfjs-dist كانت
// موجودة بالفعل وتُستخدم للقراءة والعرض فقط.

import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/* تحويل صورة JPG إلى PDF بصفحة A4 والصورة داخل هوامش مناسبة (لا تمديد) */
export async function jpegBlobToPdfBytes(blob) {
  const pdfDoc = await PDFDocument.create();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let image;
  try {
    image = await pdfDoc.embedJpg(bytes);
  } catch (err) {
    const wrapped = new Error(
      "تعذر قراءة الصورة المحوّلة: " + (err?.message || err)
    );
    throw Object.assign(wrapped, { cause: err });
  }

  const PAGE_W = 595.28; // A4 بالمقاس النقطي
  const PAGE_H = 841.89;
  const MARGIN = 18;
  const maxW = PAGE_W - MARGIN * 2;
  const maxH = PAGE_H - MARGIN * 2;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawImage(image, {
    x: (PAGE_W - w) / 2,
    y: (PAGE_H - h) / 2,
    width: w,
    height: h,
  });

  return pdfDoc.save();
}

/*
 * تحويل ملف مرفوع (صورة أو PDF) إلى بايتات PDF جاهزة للدمج.
 * الصورة: تُفكك في المتصفح إلى JPG ثم تُغلف كصفحة PDF.
 * الـPDF: يُرجع بايتاته كما هي (بدون إعادة بناء — لا تعديل للصفحات الأصلية).
 */
export async function fileToOrderPdfBlob(file) {
  const type = String(file?.type || "").toLowerCase();

  if (type === "application/pdf" || /\.pdf$/i.test(file?.name || "")) {
    return file; // يُستخدم مباشرة
  }

  if (type.startsWith("image/") || !type) {
    const jpeg = await fileToJpegBlob(file);
    return jpeg;
  }

  throw new Error("نوع الملف غير مدعوم. ارفع صورة أو ملف PDF.");
}

/* فك أي صورة (JPEG/PNG/HEIC...) إلى JPG عبر عنصر Image ثم Canvas */
export function fileToJpegBlob(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.width || img.naturalWidth;
      canvas.height = img.height || img.naturalHeight;
      if (!canvas.width || !canvas.height) {
        reject(new Error("تعذر قراءة الصورة المرفوعة."));
        return;
      }
      canvas.getContext("2d").drawImage(img, 0, 0);
      const finish = (b) => (b ? resolve(b) : reject(new Error("تعذر تحويل الصورة.")));
      canvas.toBlob
        ? canvas.toBlob(finish, "image/jpeg", 0.85)
        : finish(dataUrlToBlob(canvas.toDataURL("image/jpeg", 0.85)));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذر فتح الصورة المرفوعة."));
    };
    img.src = url;
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/*
 * دمج أمر جديد في ملف الشخص:
 *   - existingBytes: بايتات ملف الشخص الحالي (أو null لأول أمر).
 *   - additionBytes: بايتات PDF للأمر الجديد (من صورة أو PDF).
 * يعيد: { mergedBytes, oldCount, addedCount, newCount }
 * الصفحات القديمة تُنقل كما هي إلى النتيجة النهائية دون حذف.
 */
export async function mergeOrderIntoArchive(existingBytes, additionBytes) {
  const existingDoc = existingBytes
    ? await PDFDocument.load(existingBytes, { ignoreEncryption: true })
    : await PDFDocument.create();
  const additionDoc = await PDFDocument.load(additionBytes, {
    ignoreEncryption: true,
  });

  const oldCount = existingBytes ? existingDoc.getPageCount() : 0;
  const addedCount = additionDoc.getPageCount();
  const pageIndexes = Array.from({ length: addedCount }, (_, i) => i);
  const copiedPages = await existingDoc.copyPages(additionDoc, pageIndexes);
  copiedPages.forEach((p) => existingDoc.addPage(p));

  const mergedBytes = await existingDoc.save();
  return {
    mergedBytes,
    oldCount,
    addedCount,
    newCount: oldCount + addedCount,
  };
}

/* تحويل صفحات PDF إلى صور JPG للعرض (نفس أسلوب أرشيف المفردات) */
export async function renderPdfBytesToJpegs(arrayBuffer, scale = 1.4) {
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

/* عدّ صفحات PDF (سريع — بدون رسم صور) — يُستخدم في استيراد الأرشيف القديم */
export async function pdfPageCount(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}