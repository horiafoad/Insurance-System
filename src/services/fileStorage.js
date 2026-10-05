/* ------------------------------------------------------------------
   fileStorage.js — طبقة التخزين الموحّدة (Storage Abstraction Layer)

   الهدف: ألا تتعامل أي صفحة مع Supabase Storage أو R2 مباشرة.
   كل صفحة تستدعي هذه الدوال فقط، فيمكن تغيير مزوّد التخزين مستقبلًا
   من هذا الملف وحده دون تعديل عشرات الصفحات.

   المزوّدان المدعومان:
     • supabase — السلوك الحالي كما هو تمامًا (بكتات public + getPublicUrl)
     • r2       — Cloudflare R2 عبر بابت خلفي وروابط موقّعة قصيرة الأجل

   كيف يُحفظ مرجع الملف في قاعدة البيانات؟
   ------------------------------------------------------------------
   • مزوّد supabase : يُخزَّن رابط HTTP عام كما كان بالضبط (توافق كامل).
   • مزوّد r2       : يُخزَّن مرجعًا ثابتًا بلا أي سر:
                      r2://<logical-bucket>/<object-path>
     هذا المرجع ثابت ولا ينتهي، بخلاف الروابط الموقّعة، فيبقى صالحًا في
     قاعدة البيانات. الروابط الموقّعة تُطلب عند وقت العرض فقط.

   backward compatibility:
   أي سجل لا يحمل storage_provider (أو يحمل 'supabase') يُقرأ من Supabase
   تمامًا كما كان — لذلك لا يتغيّر سلوك أي ملف قديم إطلاقًا.
------------------------------------------------------------------ */

import React from "react";
import { supabase } from "../supabaseClient";
import { sessionHeaders } from "../utils/authSession";

export const STORAGE_PROVIDER = {
  SUPABASE: "supabase",
  R2: "r2",
};

/* مزوّد الرفع الافتراضي. يبقى "supabase" حتى الإعداد اليدوي.
   لتحويل الرفع الجديد إلى R2 أضِف في .env:
     VITE_FILE_STORAGE_PROVIDER=r2
   (هذا ليس سرًا — اسم المزوّد فقط، والمفاتيح تبقى server-side) */
const WRITE_PROVIDER = (() => {
  const raw = String(
    import.meta.env.VITE_FILE_STORAGE_PROVIDER || ""
  ).toLowerCase();
  return raw === STORAGE_PROVIDER.R2 ? STORAGE_PROVIDER.R2 : STORAGE_PROVIDER.SUPABASE;
})();

/** هل الرفع الجديد يذهب إلى R2؟ */
export function isR2WriteProvider() {
  return WRITE_PROVIDER === STORAGE_PROVIDER.R2;
}

/** البادئة الثابتة التي تُخزَّن في قاعدة البيانات لملفات R2. */
export const R2_REF_PREFIX = "r2://";

const R2_FUNCTION = "file-storage";
const PRESIGN_DEFAULT_TTL = 600; // 10 دقائق
const CACHE_SAFE_TTL = 60_000; // نجدد قبل الانتهاء بهامش أمان

/* ------------------------------------------------------------------
                              R2 references
------------------------------------------------------------------ */

export function isR2Ref(value) {
  return typeof value === "string" && value.startsWith(R2_REF_PREFIX);
}

function encodeR2Path(path) {
  return String(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function decodeR2Path(path) {
  return String(path)
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

/** يبني المرجع الثابت الذي يُحفظ في قاعدة البيانات لملف R2. */
export function buildR2Ref(bucket, path) {
  return `${R2_REF_PREFIX}${bucket}/${encodeR2Path(path)}`;
}

/**
 * يحوّل أي مدخل (سجل من قاعدة البيانات أو نص) إلى شكل موحّد.
 * لا يرمي استثناءً حتى لا تنهار الصفحات بسبب قيمة قديمة.
 */
export function resolveRef(input, fallback = {}) {
  if (input && typeof input === "object") {
    const record = input;
    const candidates = [
      record.url,
      record.file_url,
      record.pdf_url,
      record.image_url,
      record.page_image_url,
      record.preview_url,
      record.source_file_url,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate) {
        return resolveRef(candidate, {
          bucket: record.bucket || fallback.bucket,
          path:
            record.file_path || record.storage_path || record.path || fallback.path,
          provider: record.storage_provider || fallback.provider,
        });
      }
    }
    const path =
      record.file_path || record.storage_path || record.path || fallback.path;
    if (path) {
      return resolveRef(null, { ...fallback, path, provider: record.storage_provider });
    }
    return null;
  }

  if (typeof input === "string" && input) {
    if (isR2Ref(input)) {
      const rest = input.slice(R2_REF_PREFIX.length);
      const slash = rest.indexOf("/");
      if (slash <= 0) return null;
      return {
        provider: STORAGE_PROVIDER.R2,
        bucket: rest.slice(0, slash),
        path: decodeR2Path(rest.slice(slash + 1)),
        url: input,
      };
    }
    if (/^https?:\/\//i.test(input)) {
      return {
        provider: STORAGE_PROVIDER.SUPABASE,
        bucket: fallback.bucket || null,
        path: fallback.path || null,
        url: input,
      };
    }
  }

  if (fallback && fallback.path) {
    return {
      provider:
        fallback.provider === STORAGE_PROVIDER.R2
          ? STORAGE_PROVIDER.R2
          : STORAGE_PROVIDER.SUPABASE,
      bucket: fallback.bucket || null,
      path: fallback.path,
      url: null,
    };
  }

  return null;
}

/** يستنتج المزوّد من قيمة مخزّنة، مع التوافق مع السجلات القديمة. */
export function providerOf(record, fallback = STORAGE_PROVIDER.SUPABASE) {
  const raw = String(
    (record && record.storage_provider) || (record && record.provider) || ""
  ).toLowerCase();
  if (raw === STORAGE_PROVIDER.R2) return STORAGE_PROVIDER.R2;
  if (raw === STORAGE_PROVIDER.SUPABASE) return STORAGE_PROVIDER.SUPABASE;
  return fallback;
}

/* ------------------------------------------------------------------
                            R2 backend (server-side)
------------------------------------------------------------------ */

let configCache = null;
let configPromise = null;

/** هل R2 مهيّأ في الخادم؟ تُستدعى مرة واحدة ثم تُخزَّن. */
export async function isR2Available() {
  if (configCache) return configCache.enabled;
  if (!configPromise) {
    configPromise = supabase.functions
      .invoke(R2_FUNCTION, { body: { action: "config" } })
      .then(({ data }) => {
        configCache = {
          enabled: Boolean(data && data.ok && data.enabled),
          bucket: (data && data.bucket) || null,
          missing: (data && data.missing) || [],
        };
        return configCache.enabled;
      })
      .catch(() => {
        configCache = { enabled: false, bucket: null, missing: [] };
        return false;
      });
  }
  return configPromise;
}

/** إعادة ضبط كاش الإعداد (تسجيل الخروج / اختبار). */
export function resetStorageConfigCache() {
  configCache = null;
  configPromise = null;
  presignCache.clear();
}

async function callBackend(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke(R2_FUNCTION, {
    headers: sessionHeaders(),
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message || "storage backend unavailable");
  if (!data || !data.ok) {
    throw new Error((data && data.error) || "storage request failed");
  }
  return data;
}

/* ------------------------------------------------------------------
                    كاش الروابط الموقّعة ( short-lived )
------------------------------------------------------------------ */

const presignCache = new Map(); // "bucket/path" -> { url, expiresAt }
const PRESIGN_CACHE_LIMIT = 300;

function cacheKeyOf(bucket, path) {
  return `${bucket}/${path}`;
}

function readCache(bucket, path) {
  const hit = presignCache.get(cacheKeyOf(bucket, path));
  if (!hit) return null;
  if (hit.expiresAt <= Date.now() + CACHE_SAFE_TTL) {
    presignCache.delete(cacheKeyOf(bucket, path));
    return null;
  }
  return hit.url;
}

function writeCache(bucket, path, url, ttlSeconds) {
  if (presignCache.size >= PRESIGN_CACHE_LIMIT) {
    const oldest = presignCache.keys().next().value;
    if (oldest !== undefined) presignCache.delete(oldest);
  }
  presignCache.set(cacheKeyOf(bucket, path), {
    url,
    expiresAt: Date.now() + Math.max(30, ttlSeconds) * 1000,
  });
}

/* ------------------------------------------------------------------
                              API العامة
------------------------------------------------------------------ */

/**
 * رفع ملف جديد.
 *   supabase → supabase.storage (سلوك مطابق تمامًا لما كان قبل التحويل)
 *   r2       → presigned PUT إلى R2 مباشرة (المفاتيح تبقى في الخادم)
 *
 * @returns {{ provider, bucket, path, key, url, size, mimeType }}
 *   url = القيمة التي يجب حفظها في عمود file_url / image_url ...
 *     مزوّد supabase → رابط عام (كما كان)
 *     مزوّد r2       → مرجع r2:// ثابت يُحلّ عند العرض
 */
export async function uploadFile(bucket, path, body, options = {}) {
  const {
    contentType = guessMimeType(path, body),
    upsert = true,
    provider = WRITE_PROVIDER,
  } = options;

  if (provider !== STORAGE_PROVIDER.R2) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, body, { contentType, upsert });
    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return {
      provider: STORAGE_PROVIDER.SUPABASE,
      bucket,
      path,
      key: path,
      url: data.publicUrl,
      size: body?.size ?? null,
      mimeType: contentType,
    };
  }

  const key = `${bucket}/${path}`;
  const ticket = await callBackend("upload_ticket", { key, contentType });

  const headers = { "content-type": contentType };
  if (!upsert) headers["if-none-match"] = "*";

  const res = await fetch(ticket.url, { method: "PUT", headers, body });

  if (!res.ok) {
    if (res.status === 412) {
      // نفس رسالة خطأ Supabase حتى تستمر معالجة الأخطاء الحالية
      const err = new Error("Storage object already exists");
      err.code = "23505";
      throw err;
    }
    throw new Error(`R2 upload failed (${res.status})`);
  }

  return {
    provider: STORAGE_PROVIDER.R2,
    bucket,
    path,
    key,
    url: buildR2Ref(bucket, path),
    size: body?.size ?? null,
    mimeType: contentType,
  };
}

/**
 * رابط جاهز للعرض (img src / a href / fetch).
 *   مزوّد supabase → يُعاد الرابط المخزَّن كما هو (بلا أي تغيير سلوكي)
 *   مزوّد r2       → رابط موقّع قصير الأجل من الخادم (يُخزَّن في كاش)
 */
export async function getFileUrl(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) return "";
  if (ref.provider !== STORAGE_PROVIDER.R2) return ref.url || "";
  if (!ref.path) return "";

  const ttl = options.ttl || PRESIGN_DEFAULT_TTL;
  const cached = readCache(ref.bucket, ref.path);
  if (cached) return cached;

  const data = await callBackend("sign", {
    key: `${ref.bucket}/${ref.path}`,
    expiresIn: ttl,
  });
  writeCache(ref.bucket, ref.path, data.url, ttl);
  return data.url;
}

/**
 * رابط موقّع صريح — عند الحاجة لفتح خارج المتصفح أو للمشاركة.
 * لمزوّد supabase يُستخدم createSignedUrl كما في Supabase.
 */
export async function getSignedFileUrl(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) return "";
  const expiresIn = options.expiresIn || PRESIGN_DEFAULT_TTL;

  if (ref.provider !== STORAGE_PROVIDER.R2) {
    if (!ref.bucket || !ref.path) return ref.url || "";
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  }

  const data = await callBackend("sign", {
    key: `${ref.bucket}/${ref.path}`,
    expiresIn,
  });
  return data.url;
}

/** تنزيل الملف كـ Blob (مطابق لـ supabase.storage.download). */
export async function downloadFile(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) throw new Error("لا يوجد مسار للملف.");

  if (ref.provider !== STORAGE_PROVIDER.R2) {
    if (!ref.bucket || !ref.path) {
      if (!ref.url) throw new Error("لا يوجد مسار للملف.");
      const res = await fetch(ref.url);
      if (!res.ok) throw new Error(`تعذر تحميل الملف (${res.status}).`);
      return res.blob();
    }
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .download(ref.path);
    if (error) throw error;
    if (!data || data.size === 0) {
      throw new Error("الملف المخزن غير موجود أو فارغ.");
    }
    return data;
  }

  const url = await getFileUrl(ref, options);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`تعذر تحميل الملف (${res.status}).`);
  return res.blob();
}

/** حذف ملف. supabase → remove()، r2 → من الخادم. */
export async function deleteFile(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) return { ok: false, skipped: "no ref" };

  if (ref.provider !== STORAGE_PROVIDER.R2) {
    if (!ref.bucket || !ref.path) return { ok: false, skipped: "no path" };
    const { error } = await supabase.storage.from(ref.bucket).remove([ref.path]);
    if (error) throw error;
    return { ok: true, provider: STORAGE_PROVIDER.SUPABASE };
  }

  await callBackend("delete", { key: `${ref.bucket}/${ref.path}` });
  presignCache.delete(cacheKeyOf(ref.bucket, ref.path));
  return { ok: true, provider: STORAGE_PROVIDER.R2 };
}

/** هل الملف موجود؟ */
export async function fileExists(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) return false;

  if (ref.provider !== STORAGE_PROVIDER.R2) {
    if (!ref.bucket || !ref.path) return false;
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .list(ref.path, { limit: 1 });
    if (error) return false;
    return Boolean(data && data.length);
  }

  const result = await callBackend("exists", { key: `${ref.bucket}/${ref.path}` });
  return Boolean(result.exists);
}

/* ------------------------------------------------------------------
                            أدوات مساعدة
------------------------------------------------------------------ */

function guessMimeType(path, body) {
  const explicit = body && body.type;
  if (explicit) return explicit;
  const ext = String(path || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  const map = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * يحافظ على سلوك downloadQueryUrl الموجود في الصفحات.
 * الروابط الموقّعة تقبل معاملات إضافية، فلا يتغيّر شيء.
 */
export function downloadQueryUrl(fileUrl, downloadName) {
  if (!fileUrl) return "";
  const separator = fileUrl.includes("?") ? "&" : "?";
  return `${fileUrl}${separator}download=${encodeURIComponent(
    downloadName || "salary.pdf"
  )}`;
}

/**
 * تنزيل ملف إلى جهاز المستخدم.
 * لملفات R2: يُجلب المحتوى ثم يُحفظ محليًا، لأن bucket خاص لا يسمح
 * للمتصفح بإضافة رأس download على نطاق آخر.
 */
export async function downloadFileToDisk(input, filename, options = {}) {
  const blob = await downloadFile(input, options);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "file";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/* ------------------------------------------------------------------
                           React helpers
------------------------------------------------------------------ */

/**
 * Resolve a stored file value into a url usable in <img src> / <a href>.
 * Supabase values pass through untouched, so existing pages behave exactly as
 * before. Only r2:// values trigger a backend round-trip.
 *
 * ملاحظة: العناصر المرئية (FileAnchor / FileDownloadLink) في
 * src/components/FileLink.jsx لأن هذا البناء لا يفعّل JSX داخل .js
 */
export function useFileUrl(value) {
  const r2Value = isR2Ref(value) ? value : null;
  const [resolved, setResolved] = React.useState("");

  React.useEffect(() => {
    if (!r2Value) return undefined;
    let alive = true;
    getFileUrl(r2Value)
      .then((url) => {
        if (alive) setResolved(url || "");
      })
      .catch(() => {
        if (alive) setResolved("");
      });
    return () => {
      alive = false;
    };
  }, [r2Value]);

  // روابط http تُعاد كما هي بلا حالة ولا إعادة رسم — سلوك قديم تمامًا
  if (!r2Value) return value || "";
  return resolved;
}

