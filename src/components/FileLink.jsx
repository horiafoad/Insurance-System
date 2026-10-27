/* ------------------------------------------------------------------
   FileLink.jsx — روابط الملفات التي تتعامل مع المراجع القديمة والجديدة

   لماذا ملف منفصل؟
   هذا المشروع يبني عبر rolldown-vite الذي لا يفعّل JSX داخل ملفات .js،
   لذا تبقى منطق التخزين في services/fileStorage.js (JS خالص)
   وتبقى العناصر المرئية هنا في .jsx.

   الفرق بين المرجعين:
   • رابط http (Supabase) → يمر كما هو، سلوك المتصفح نفسه
   • مرجع r2://           → bucket خاص، فنوقّع رابطًا قصيرًا عند العرض،
                            و«تنزيل» يُنفَّذ بجلب المحتوى ثم حفظه محليًا
   • مرجع local://        → ملف محفوظ على جهاز العميل (ديسكتوب فقط)،
                            نفتحه ببرنامج العارض الافتراضي مباشرة
------------------------------------------------------------------ */

import {
  isR2Ref,
  isAsuRef,
  isLocalRef,
  isLegacyUnavailableUrl,
  useFileUrl,
  downloadFileToDisk,
  openLocalFile,
} from "../services/fileStorage";

/** رابط خاص (r2 أو asu) يحتاج توقيعًا عند الفتح وتنزيلًا عبر المحتوى. */
const isPrivateRef = (ref) => isR2Ref(ref) || isAsuRef(ref);

/** ملف كان على مشروع Supabase قديم توقّف (تجاوز حصة التخزين). */
const LEGACY_TITLE = "الملف كان على تخزين سحابي قديم توقّف، ولم يعد متاحًا";

/**
 * بديل <a href={record.file_url}>.
 * القيم القديمة (http) تمر كما هي بلا أي تأخير في العرض.
 */
export function FileAnchor({ fileRef, children, ...anchorProps }) {
  const local = isLocalRef(fileRef);
  const legacy = isLegacyUnavailableUrl(fileRef);
  const url = useFileUrl(fileRef);

  async function handleClick(event) {
    if (local) {
      event.preventDefault();
      try {
        await openLocalFile(fileRef);
      } catch (err) {
        console.error("تعذر فتح الملف:", err);
      }
      return;
    }
    if (!isPrivateRef(fileRef)) return; // روابط http سلوك المتصفح نفسه
  }

  if (local) {
    return (
      <a {...anchorProps} href="#local" onClick={handleClick}>
        {children}
      </a>
    );
  }

  if (!url) {
    const { className, style, title } = anchorProps;
    return (
      <span
        className={className}
        style={legacy ? { ...style, opacity: 0.55, cursor: "not-allowed" } : style}
        title={legacy ? LEGACY_TITLE : title}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }

  return (
    <a {...anchorProps} href={url} onClick={handleClick}>
      {children}
    </a>
  );
}

/**
 * بديل <a href={...} download>.
 *  • رابط http → سلوك المتصفح نفسه كما كان
 *  • مرجع r2:// → يُنزَّل المحتوى ثم يُحفظ باسم الملف، لأن bucket خاص
 *                  لا يسمح للمتصفح بإضافة رأس download من نطاق آخر
 */
export function FileDownloadLink({
  fileRef,
  fileName,
  children,
  ...anchorProps
}) {
  const url = useFileUrl(fileRef);
  const remoteR2 = isPrivateRef(fileRef);
  const local = isLocalRef(fileRef);
  const legacy = isLegacyUnavailableUrl(fileRef);

  const handleClick = (event) => {
    if (local) {
      event.preventDefault();
      openLocalFile(fileRef, fileName || "file").catch((err) => {
        console.error("تعذر فتح الملف:", err);
      });
      return;
    }
    if (!remoteR2) return; // نترك المتصفح يتصرّف كالمعتاد
    event.preventDefault();
    downloadFileToDisk(fileRef, fileName || "file").catch((err) => {
      console.error("تعذر تنزيل الملف:", err);
    });
  };

  if (local) {
    return (
      <a {...anchorProps} href="#local" onClick={handleClick}>
        {children}
      </a>
    );
  }

  if (!url) {
    const { className, style, title } = anchorProps;
    return (
      <span
        className={className}
        style={legacy ? { ...style, opacity: 0.55, cursor: "not-allowed" } : style}
        title={legacy ? LEGACY_TITLE : title}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }

  return (
    <a
      {...anchorProps}
      href={url}
      {...(remoteR2 ? {} : { download: fileName || "" })}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}

export default FileAnchor;
