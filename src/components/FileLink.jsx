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
------------------------------------------------------------------ */

import {
  isR2Ref,
  useFileUrl,
  downloadFileToDisk,
} from "../services/fileStorage";

/**
 * بديل <a href={record.file_url}>.
 * القيم القديمة (http) تمر كما هي بلا أي تأخير في العرض.
 */
export function FileAnchor({ fileRef, children, ...anchorProps }) {
  const url = useFileUrl(fileRef);

  if (!url) {
    const { className, style, title } = anchorProps;
    return (
      <span
        className={className}
        style={style}
        title={title}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }

  return (
    <a {...anchorProps} href={url}>
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
  const remoteR2 = isR2Ref(fileRef);

  const handleClick = (event) => {
    if (!remoteR2) return; // نترك المتصفح يتصرّف كالمعتاد
    event.preventDefault();
    downloadFileToDisk(fileRef, fileName || "file").catch((err) => {
      console.error("تعذر تنزيل الملف:", err);
    });
  };

  if (!url) {
    const { className, style, title } = anchorProps;
    return (
      <span
        className={className}
        style={style}
        title={title}
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
