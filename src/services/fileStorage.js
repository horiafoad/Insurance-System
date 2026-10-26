/* ------------------------------------------------------------------
   fileStorage.js — طبقة التخزين الموحّدة (Storage Abstraction Layer)

   الهدف: ألا تتعامل أي صفحة مع Supabase Storage أو R2 مباشرة.
   كل صفحة تستدعي هذه الدوال فقط، فيمكن تغيير مزوّد التخزين مستقبلًا
   من هذا الملف وحده دون تعديل عشرات الصفحات.

   المزوّدون المدعومون:
     • supabase — السلوك الحالي كما هو تمامًا (بكتات public + getPublicUrl)
     • r2       — Cloudflare R2 عبر بابت خلفي وروابط موقّعة قصيرة الأجل
                  (الخيار الاحتياطي — يعمل تلقائيًا عند تعذّر خادم asu)
     • asu      — خادم التخزين المحلي D عبر بوابة Cloudflare (Tunnel)
                  بروابط موقّعة قصيرة الأجل — نفس عقد R2 بالضبط
     • local    — تطبيق الديسكتوب فقط: الملف يُحفظ على الجهاز عبر
                  window.nativeLocalFiles (preload.cjs) بمرجع local://

   كيف يُحفظ مرجع الملف في قاعدة البيانات؟
   ------------------------------------------------------------------
   • مزوّد supabase : يُخزَّن رابط HTTP عام كما كان بالضبط (توافق كامل).
   • مزوّد r2       : يُخزَّن مرجعًا ثابتًا بلا أي سر:
                       r2://<logical-bucket>/<object-path>
   • مزوّد asu      : يُخزَّن مرجعًا ثابتًا بلا أي سر:
                       asu://<logical-bucket>/<object-path>
      المراجع الثابتة لا تنتهي، بخلاف الروابط الموقّعة، فتصلح في
      قاعدة البيانات. الروابط الموقّعة تُطلب عند وقت العرض فقط.
   • مزوّد local    : يُخزَّن مرجعًا ثابتًا:
                      local://<logical-bucket>/<object-path>
     الملف موجود فعلًا في مجلد محلي على جهاز العميل من الديسكتوب،
     والمرجع في قاعدة البيانات مجرد دليل عنه (لا يوجد أي ملف في السحابة).

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
  ASU: "asu",
  LOCAL: "local",
};

/* جسر ملفات الجهاز (نسخة الديسكتوب فقط):
   يُحقن في window.nativeLocalFiles من preload.cjs عند فتح التطبيق في Electron. */
function nativeLocalFiles() {
  return typeof window !== "undefined" && window.nativeLocalFiles
    ? window.nativeLocalFiles
    : null;
}

/** هل نعمل داخل تطبيق الديسكتوب (Electron)؟ */
export function isElectronNative() {
  return Boolean(nativeLocalFiles());
}

/* مزوّد الرفع الافتراضي:
   • داخل الديسكتوب → local (ملفات تُحفظ على الجهاز)
   • ويب/موبايل      → حسب VITE_FILE_STORAGE_PROVIDER (asu أو r2 أو supabase) */
const WRITE_PROVIDER = (() => {
  if (nativeLocalFiles()) return STORAGE_PROVIDER.LOCAL;
  const raw = String(
    import.meta.env.VITE_FILE_STORAGE_PROVIDER || ""
  ).toLowerCase();
  if (raw === STORAGE_PROVIDER.ASU) return STORAGE_PROVIDER.ASU;
  if (raw === STORAGE_PROVIDER.R2) return STORAGE_PROVIDER.R2;
  return STORAGE_PROVIDER.SUPABASE;
})();

/** هل الرفع الجديد يذهب إلى R2؟ */
export function isR2WriteProvider() {
  return WRITE_PROVIDER === STORAGE_PROVIDER.R2;
}

/** البادئة الثابتة التي تُخزَّن في قاعدة البيانات لملفات R2. */
export const R2_REF_PREFIX = "r2://";

/** البادئة الثابتة التي تُخزَّن في قاعدة البيانات لملفات خادم D (asu). */
export const ASU_REF_PREFIX = "asu://";

/**
 * عنوان بوابة خادم التخزين (Worker عام خلف Cloudflare Tunnel).
 * رابط عادي لا يحمل أي سر — الأسرار كلها في الخادم فقط.
 */
const ASU_GATEWAY = String(
  import.meta.env.VITE_FILE_STORAGE_GATEWAY || ""
  ).replace(/\/+$/, "");

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

/* ------------------------------------------------------------------
                         ASU (خادم D) references
------------------------------------------------------------------ */

export function isAsuRef(value) {
  return typeof value === "string" && value.startsWith(ASU_REF_PREFIX);
}

/** يبني المرجع الثابت لملف مخزَّن على خادم D (يُحفظ في قاعدة البيانات). */
export function buildAsuRef(bucket, path) {
  return `${ASU_REF_PREFIX}${bucket}/${encodeR2Path(path)}`;
}

/* ------------------------------------------------------------------
                            Local references
------------------------------------------------------------------ */

/** البادئة الثابتة التي تُخزَّن في قاعدة البيانات لملفات الديسكتوب. */
export const LOCAL_REF_PREFIX = "local://";

export function isLocalRef(value) {
  return typeof value === "string" && value.startsWith(LOCAL_REF_PREFIX);
}

/** يبني المرجع الثابت لملف محفوظ على الجهاز (relPath = bucket/path...). */
export function buildLocalRef(relPath) {
  return `${LOCAL_REF_PREFIX}${String(relPath || "")}`;
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
    if (isAsuRef(input)) {
      const rest = input.slice(ASU_REF_PREFIX.length);
      const slash = rest.indexOf("/");
      if (slash <= 0) return null;
      return {
        provider: STORAGE_PROVIDER.ASU,
        bucket: rest.slice(0, slash),
        path: decodeR2Path(rest.slice(slash + 1)),
        url: input,
      };
    }
    if (isLocalRef(input)) {
      const rest = input.slice(LOCAL_REF_PREFIX.length);
      if (!rest) return null;
      return {
        provider: STORAGE_PROVIDER.LOCAL,
        bucket: null,
        path: rest,
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
          : fallback.provider === STORAGE_PROVIDER.ASU
            ? STORAGE_PROVIDER.ASU
            : fallback.provider === STORAGE_PROVIDER.LOCAL
              ? STORAGE_PROVIDER.LOCAL
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
  if (raw === STORAGE_PROVIDER.ASU) return STORAGE_PROVIDER.ASU;
  if (raw === STORAGE_PROVIDER.LOCAL) return STORAGE_PROVIDER.LOCAL;
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
                 بوابة خادم D (asu) — عبر Cloudflare Tunnel
   كل نداء يحمل x-session-token، والخادم يتحقق من الجلسة والصلاحيات
   قبل كل عملية. لا يوجد أي سر في الواجهة.
------------------------------------------------------------------ */

/** يحوّل مسارًا نسبيًا من الخادم إلى عنوان كامل عبر البوابة. */
function asuGatewayUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${ASU_GATEWAY}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/**
 * خطأ «البوابة غير متاحة» — يُستخدم للرجوع إلى R2 عند تعذّر الخادم فقط.
 * أخطاء الصلاحيات (401/403) أو المدخلات (4xx) لا تُعتبر تعذّر اتصال.
 */
function gatewayUnavailableError(message) {
  const err = new Error(message || "storage gateway unavailable");
  err.gatewayUnavailable = true;
  return err;
}

async function callAsuBackend(action, payload = {}) {
  if (!ASU_GATEWAY) throw gatewayUnavailableError("storage gateway not configured");
  let res;
  try {
    res = await fetch(`${ASU_GATEWAY}/v1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...sessionHeaders(),
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    // فشل الشبكة/النفق تمامًا — البوابة غير متاحة
    throw gatewayUnavailableError("storage gateway unreachable");
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw gatewayUnavailableError(`storage gateway offline (${res.status})`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data || !data.ok) {
    const err = new Error((data && data.error) || `storage gateway error (${res.status})`);
    err.status = res.status;
    throw err;
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
            أدوات الملفات المحلية ( base64 / Blob / URLs )
------------------------------------------------------------------ */

const localObjectUrlCache = new Map(); // local ref -> objectURL

function fileToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is not available"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(blob);
  });
}

function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const MIME_BY_EXT = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

function contentTypeFromName(name) {
  const ext = String(name || "").split(".").pop()?.toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

/** يقرأ ملفًا محليًا ويعيد Object URL قابلًا للعرض (مُخزَّن في كاش). */
async function getLocalObjectUrl(localRef, relPath) {
  const native = nativeLocalFiles();
  if (!native) return "";
  const cached = localObjectUrlCache.get(localRef);
  if (cached) return cached;
  const file = await native.read({ relPath });
  if (!file || !file.ok) return "";
  const blob = new Blob([base64ToUint8(file.base64)], {
    type: file.contentType || contentTypeFromName(relPath),
  });
  const url = URL.createObjectURL(blob);
  if (localObjectUrlCache.size >= 120) {
    const first = localObjectUrlCache.keys().next().value;
    if (first !== undefined) localObjectUrlCache.delete(first);
  }
  localObjectUrlCache.set(localRef, url);
  return url;
}

function revokeLocalObjectUrl(localRef) {
  const cached = localObjectUrlCache.get(localRef);
  if (cached) {
    try {
      URL.revokeObjectURL(cached);
    } catch {
      /* ignore */
    }
    localObjectUrlCache.delete(localRef);
  }
}

/* ------------------------------------------------------------------
                              API العامة
------------------------------------------------------------------ */

/** رفع مباشر إلى R2 عبر دالة الحافة (تُستخدم للمسار الأساسي وكرجوع احتياطي). */
async function uploadViaR2(bucket, path, body, { contentType, upsert }) {
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

/** رفع مباشر إلى خادم D عبر البوابة (بتوكن الجلسة على كل طلب PUT). */
async function uploadViaAsu(bucket, path, body, { contentType, upsert }) {
  if (!ASU_GATEWAY) throw gatewayUnavailableError("storage gateway not configured");
  const key = `${bucket}/${path}`;
  const ticket = await callAsuBackend("upload_ticket", { key, contentType });

  const headers = {
    "content-type": contentType,
    ...sessionHeaders(),
  };
  if (!upsert) headers["if-none-match"] = "*";

  let res;
  try {
    res = await fetch(asuGatewayUrl(ticket.url), {
      method: "PUT",
      headers,
      body,
    });
  } catch {
    throw gatewayUnavailableError("storage gateway unreachable (upload)");
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw gatewayUnavailableError(`storage gateway offline (${res.status})`);
  }

  if (!res.ok) {
    if (res.status === 412) {
      const err = new Error("Storage object already exists");
      err.code = "23505";
      throw err;
    }
    const err = new Error(`ASU storage upload failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return {
    provider: STORAGE_PROVIDER.ASU,
    bucket,
    path,
    key,
    url: buildAsuRef(bucket, path),
    size: body?.size ?? null,
    mimeType: contentType,
  };
}

/**
 * رفع ملف جديد.
 *   supabase → supabase.storage (سلوك مطابق تمامًا لما كان قبل التحويل)
 *   asu      → PUT عبر بوابة خادم D بتوكن الجلسة، وعند تعذّر البوابة
 *              يسقط الرفع تلقائيًا إلى R2 (الخيار الاحتياطي)
 *   r2       → presigned PUT إلى R2 مباشرة (المفاتيح تبقى في الخادم)
 *
 * @returns {{ provider, bucket, path, key, url, size, mimeType }}
 *   url = القيمة التي يجب حفظها في عمود file_url / image_url ...
 *     مزوّد supabase → رابط عام (كما كان)
 *     مزوّد r2       → مرجع r2:// ثابت يُحلّ عند العرض
 *     مزوّد asu      → مرجع asu:// ثابت يُحلّ عند العرض
 */
export async function uploadFile(bucket, path, body, options = {}) {
  const {
    contentType = guessMimeType(path, body),
    upsert = true,
    provider = WRITE_PROVIDER,
  } = options;

  if (provider === STORAGE_PROVIDER.LOCAL) {
    const native = nativeLocalFiles();
    if (!native) {
      throw new Error("التخزين المحلي متاح فقط داخل تطبيق الديسكتوب");
    }
    const relPath = `${bucket}/${path}`;
    const base64 = await fileToBase64(body);
    const saved = await native.save({ relPath, base64, contentType });
    if (!saved || !saved.ok) {
      throw new Error((saved && saved.error) || "تعذر حفظ الملف على الجهاز");
    }
    return {
      provider: STORAGE_PROVIDER.LOCAL,
      bucket,
      path,
      key: relPath,
      url: buildLocalRef(relPath),
      size: body?.size ?? null,
      mimeType: contentType,
      dir: saved.dir,
      absPath: saved.absPath,
    };
  }

  if (provider === STORAGE_PROVIDER.ASU) {
    try {
      return await uploadViaAsu(bucket, path, body, { contentType, upsert });
    } catch (err) {
      // خادم D غير متاح (شبكة/نفق/5xx) → نرفع إلى R2 كخيار احتياطي.
      // أخطاء الصلاحيات أو المدخلات لا تسقط للرجوع الاحتياطي.
      if (err && err.gatewayUnavailable) {
        try {
          return await uploadViaR2(bucket, path, body, { contentType, upsert });
        } catch (r2err) {
          // نُظهر خطأ الرجوع الاحتياطي مع الإشارة لسبب السقوط
          r2err.cause = err;
          throw r2err;
        }
      }
      throw err;
    }
  }

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

  return uploadViaR2(bucket, path, body, { contentType, upsert });
}

/** يطلب رابطًا موقّعًا من المزوّد البعيد (r2 أو asu) ويعيد عنوانًا قابلًا للاستخدام. */
async function signRemoteRef(ref, ttlSeconds) {
  const key = `${ref.bucket}/${ref.path}`;
  if (ref.provider === STORAGE_PROVIDER.ASU) {
    const data = await callAsuBackend("sign", { key, expiresIn: ttlSeconds });
    return asuGatewayUrl(data.url);
  }
  const data = await callBackend("sign", { key, expiresIn: ttlSeconds });
  return data.url;
}

/** هل هذا مزوّد بعيد يحتاج رابطًا موقّعًا عند العرض؟ */
function isRemoteSignedRef(ref) {
  return (
    ref.provider === STORAGE_PROVIDER.R2 ||
    ref.provider === STORAGE_PROVIDER.ASU
  );
}

/**
 * رابط جاهز للعرض (img src / a href / fetch).
 *   مزوّد supabase → يُعاد الرابط المخزَّن كما هو (بلا أي تغيير سلوكي)
 *   مزوّد r2/asu    → رابط موقّع قصير الأجل من الخادم (يُخزَّن في كاش)
 */
export async function getFileUrl(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) return "";
  if (ref.provider === STORAGE_PROVIDER.LOCAL) {
    return getLocalObjectUrl(ref.url, ref.path);
  }
  if (!isRemoteSignedRef(ref)) return ref.url || "";
  if (!ref.path || !ref.bucket) return "";

  const ttl = options.ttl || PRESIGN_DEFAULT_TTL;
  const cached = readCache(ref.bucket, ref.path);
  if (cached) return cached;

  const url = await signRemoteRef(ref, ttl);
  writeCache(ref.bucket, ref.path, url, ttl);
  return url;
}

/**
 * رابط موقّع صريح — عند الحاجة لفتح خارج المتصفح أو للمشاركة.
 * لمزوّد supabase يُستخدم createSignedUrl كما في Supabase.
 */
export async function getSignedFileUrl(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) return "";
  const expiresIn = options.expiresIn || PRESIGN_DEFAULT_TTL;

  if (!isRemoteSignedRef(ref)) {
    if (!ref.bucket || !ref.path) return ref.url || "";
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  }

  return signRemoteRef(ref, expiresIn);
}

/** تنزيل الملف كـ Blob (مطابق لـ supabase.storage.download). */
export async function downloadFile(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) throw new Error("لا يوجد مسار للملف.");

  if (ref.provider === STORAGE_PROVIDER.LOCAL) {
    const native = nativeLocalFiles();
    if (!native) throw new Error("التخزين المحلي متاح فقط داخل تطبيق الديسكتوب");
    const file = await native.read({ relPath: ref.path });
    if (!file || !file.ok || !file.base64) {
      throw new Error((file && file.error) || "تعذر قراءة الملف من الجهاز");
    }
    return new Blob([base64ToUint8(file.base64)], {
      type: file.contentType || "application/octet-stream",
    });
  }

  if (!isRemoteSignedRef(ref)) {
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

/** حذف ملف. supabase → remove()، r2/asu → من الخادم بتوكن الجلسة. */
export async function deleteFile(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) return { ok: false, skipped: "no ref" };

  if (ref.provider === STORAGE_PROVIDER.LOCAL) {
    const native = nativeLocalFiles();
    if (!native) return { ok: false, skipped: "no native" };
    const res = await native.remove({ relPath: ref.path });
    revokeLocalObjectUrl(ref.url);
    return {
      ok: Boolean(res && res.ok),
      provider: STORAGE_PROVIDER.LOCAL,
    };
  }

  if (ref.provider === STORAGE_PROVIDER.ASU) {
    await callAsuBackend("delete", { key: `${ref.bucket}/${ref.path}` });
    presignCache.delete(cacheKeyOf(ref.bucket, ref.path));
    return { ok: true, provider: STORAGE_PROVIDER.ASU };
  }

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

  if (ref.provider === STORAGE_PROVIDER.LOCAL) {
    const native = nativeLocalFiles();
    if (!native) return false;
    const res = await native.exists({ relPath: ref.path });
    return Boolean(res && res.exists);
  }

  if (ref.provider === STORAGE_PROVIDER.ASU) {
    const result = await callAsuBackend("exists", {
      key: `${ref.bucket}/${ref.path}`,
    });
    return Boolean(result.exists);
  }

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
            فتح الملفات المحلية + مجلد التخزين (ديسكتوب فقط)
------------------------------------------------------------------ */

/** فتح ملف محفوظ على الجهاز عبر برنامج العارض الافتراضي (ديسكتوب فقط). */
export async function openLocalFile(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref || ref.provider !== STORAGE_PROVIDER.LOCAL || !ref.path) {
    return { ok: false, skipped: "not a local file" };
  }
  const native = nativeLocalFiles();
  if (!native) return { ok: false, skipped: "no native" };
  return native.open({ relPath: ref.path });
}

/**
 * يفتح أي ملف (محلي أو عبر مزوّد التخزين) في نافذة/تبويب جديد.
 * المحلي يُفتح بالتطبيق الأصلي، والبعيد برابط موقّع مؤقت.
 */
export async function openFile(input, options = {}) {
  const ref = resolveRef(input, options);
  if (!ref) throw new Error("لا يوجد ملف لفتحه.");

  if (ref.provider === STORAGE_PROVIDER.LOCAL) {
    const native = nativeLocalFiles();
    if (!native) {
      throw new Error(
        "هذا الملف محفوظ على جهاز آخر؛ نزّليه على جهازك ثم افتحيه منه."
      );
    }
    const result = await native.open({ relPath: ref.path });
    if (result && result.ok === false && result.error) {
      throw new Error(result.error);
    }
    return result;
  }

  const url = await getFileUrl(ref, options);
  if (!url) throw new Error("تعذر الحصول على رابط الملف.");
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return { ok: true, provider: ref.provider, url };
}

/** المسار الكامل لمجلد تخزين الملفات على الجهاز (ديسكتوب فقط). */
export async function getLocalStorageDir() {
  const native = nativeLocalFiles();
  if (!native) return "";
  const res = await native.dir({});
  return res && res.ok ? res.dir : "";
}

/* ------------------------------------------------------------------
                           React helpers
------------------------------------------------------------------ */

/**
 * Resolve a stored file value into a url usable in <img src> / <a href>.
 * Supabase values pass through untouched, so existing pages behave exactly as
 * before. Only r2:// and local:// values trigger resolution.
 *
 * ملاحظة: العناصر المرئية (FileAnchor / FileDownloadLink) في
 * src/components/FileLink.jsx لأن هذا البناء لا يفعّل JSX داخل .js
 */
export function useFileUrl(value) {
  const needsResolve =
    isR2Ref(value) || isAsuRef(value) || isLocalRef(value) ? value : null;
  const [resolved, setResolved] = React.useState("");

  React.useEffect(() => {
    if (!needsResolve) return undefined;
    let alive = true;
    getFileUrl(needsResolve)
      .then((url) => {
        if (alive) setResolved(url || "");
      })
      .catch(() => {
        if (alive) setResolved("");
      });
    return () => {
      alive = false;
    };
  }, [needsResolve]);

  // روابط http تُعاد كما هي بلا حالة ولا إعادة رسم — سلوك قديم تمامًا
  if (!needsResolve) return value || "";
  return resolved;
}

