// Edge Function: scanner-upload
// يستقبل مسحوحات السكانر من الجسر المحلي (scanner-bridge) ويرفعها إلى Cloudflare R2
// ثم يسجّل الصف في جدول scanner_inbox.
//
// لماذا دالة مخصّصة وليس file-storage؟
//   file-storage تفرض جلسة مستخدم صالحة (verifySession) ولا تُknow كيف تكتب في
//   جدول application، والجسر ليس مستخدمًا ولا يجوز أن يحمل service_role.
//   فهذه الدالة_surface محدود جدًا: يقبل PDF/JPEG/PNG فقط، مفتاح واحد فقط،
//   ولا يفعل شيئًا سوى الرفع والتسجيل.
//
// مطلوب (Supabase Dashboard -> Edge Functions -> Secrets):
//   SCANNER_BRIDGE_TOKEN   سر مشترك مع الجسر (سري، 24 حرفًا على الأقل)
//                          يُرسل في الرأس x-scanner-token
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (مضبوطة تلقائيًا في Edge)
//
// ما لا يحدث هنا أبدًا:
//   • لا يُعاد أي R2 secret إلى الجسر — الجسر يعرف العنوان والتوكن فقط.
//   • لا تُرسل مفاتيح R2 ولا service_role إلى أي عميل.
//   • لا يُحفظ رابط موقّع في قاعدة البيانات: يُحفظ مرجع ثابت r2://...
//     والروابط الموقّعة تُطلب عند العرض من file-storage (fileStorage.js).
//   • لا CORS headers ⇒ لا يستطيع المتصفح استدعاء هذه الدالة إطلاقًا.
//   • لا يوجد حذف لأي ملف قديم؛ الكتابة فقط داخل البكت المخصّص.

import { createClient } from "npm:@supabase/supabase-js@2";
import { r2Config, r2Put, r2Delete } from "../_shared/r2.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BRIDGE_TOKEN = Deno.env.get("SCANNER_BRIDGE_TOKEN") || "";

/* --------------------- ثوابت مقصودة ومقيّدة --------------------- */

// البكت المنطقية الوحيدة المسموح الكتابة فيها. مطابقة لـ LOGICAL_BUCKETS في
// file-storage/index.ts حتى يقرأ ملفStorage.js نفس المرجع.
const LOGICAL_BUCKET = "scanner-inbox";
const TABLE = "scanner_inbox";

// نفس حد create_scanner_inbox.sql (file_size_limit = 52428800)
const MAX_BYTES = 52_428_800; // 50MB
const MIN_BYTES = 1;
const MAX_NAME = 200;
const MIN_TOKEN_LEN = 24;

// مدى مقبول لـ mtime. لازم محدود: new Date(x).toISOString() يرمي RangeError
// خارج مدى Date، ولو حدث ذلك بعد نجاح الرفع لتركنا كائنًا يتيمًا في R2.
const MTIME_MIN_MS = Date.UTC(2000, 0, 1);
const MTIME_MAX_MS = Date.UTC(2100, 0, 1);

const ALLOWED = {
  pdf: { mimes: ["application/pdf"], exts: ["pdf"] },
  jpg: { mimes: ["image/jpeg"], exts: ["jpg", "jpeg"] },
  png: { mimes: ["image/png"], exts: ["png"] },
} as const;

type Family = keyof typeof ALLOWED;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/* ------------------------------ helpers ------------------------------ */

function json(body: Record<string, unknown>, status = 200): Response {
  // لا Access-Control-Allow-Origin عمدًا: المتصفح لا يستطيع قراءة الرد.
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** مقارنة ثابتة الزمن حتى لا يُكشف التوكن عبر قياس فارق التوقيت. */
function safeEqual(a: string, b: string): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function familyOfExtension(name: string): Family | null {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return null;
  const ext = m[1];
  for (const family of Object.keys(ALLOWED) as Family[]) {
    if ((ALLOWED[family].exts as readonly string[]).includes(ext)) return family;
  }
  return null;
}

/**
 * فحص البصمة الثنائية (magic bytes) — لا نثق في content-type ولا في الامتداد
 * وحدهما، لأن أي عميل يملك التوكن يستطيع إرسال بايتات عشوائية.
 */
function familyOfBytes(bytes: Uint8Array): Family | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
      bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a &&
      bytes[7] === 0x0a) {
    return "png";
  }
  return null;
}

/**
 * اسم آمن لمقطع واحد من المسار: بدون فواصل، بدون ".."، بطول محدود.
 * الترميز العكسي "%" يمنع أي ترميز مسارات عند فك التشفير لاحقًا.
 */
function sanitizeSegment(name: string): string {
  const ext = (name.toLowerCase().match(/\.[a-z0-9]+$/) || [""])[0].slice(0, 10);
  const base = name.slice(0, name.length - ext.length);
  const ascii = base
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${ascii || "scan"}${ext}`;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** يبني المرجع الثابت نفسه الذي يستخدمه fileStorage.js وسكربت الترحيل. */
function buildRef(path: string): string {
  const encoded = path.split("/").map((s) => encodeURIComponent(s)).join("/");
  return `r2://${LOGICAL_BUCKET}/${encoded}`;
}

/* ------------------------------ handlers ------------------------------ */

/** فحص سريع بدون رفع — للتأكد من نشر الدالة وضبط الأسرار. */
async function handleHealth() {
  const cfg = r2Config();
  return {
    ok: true,
    r2: { enabled: cfg.enabled, bucket: cfg.bucket || null, missing: cfg.missing },
    db: Boolean(supabase),
    tokenConfigured: BRIDGE_TOKEN.length >= MIN_TOKEN_LEN,
    limits: { maxBytes: MAX_BYTES, families: Object.keys(ALLOWED) },
  };
}

async function handleUpload(req: Request) {
  /* --- 1) بيانات وصفية من الجسر --- */
  const rawName = req.headers.get("x-scan-name") || "";
  let fileName = "";
  try {
    fileName = decodeURIComponent(rawName);
  } catch {
    fileName = rawName;
  }
  fileName = fileName.trim();

  const fingerprint = (req.headers.get("x-scan-fingerprint") || "").toLowerCase().trim();
  const scannedAtRaw = req.headers.get("x-scan-mtime") || "";
  const scannedAtMs = Number(scannedAtRaw);

  if (!fileName) return json({ ok: false, error: "missing file name" }, 400);
  if (fileName.length > MAX_NAME) return json({ ok: false, error: "file name too long" }, 400);
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    return json({ ok: false, error: "invalid file name" }, 400);
  }
  if (!/^[0-9a-f]{16,64}$/.test(fingerprint)) {
    return json({ ok: false, error: "invalid fingerprint" }, 400);
  }
  if (!Number.isFinite(scannedAtMs) || scannedAtMs < MTIME_MIN_MS || scannedAtMs > MTIME_MAX_MS) {
    return json({ ok: false, error: "invalid mtime" }, 400);
  }

  const family = familyOfExtension(fileName);
  if (!family) {
    return json({ ok: false, error: "unsupported extension" }, 415);
  }

  /* --- 2) الحجم: تفحص مبكرًا قبل قراءة الجسم --- */
  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return json({ ok: false, error: "file too large" }, 413);
  }

  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length < MIN_BYTES) return json({ ok: false, error: "empty file" }, 400);
  if (buf.length > MAX_BYTES) return json({ ok: false, error: "file too large" }, 413);

  const sniffed = familyOfBytes(buf);
  if (!sniffed) {
    return json({ ok: false, error: "unsupported file content" }, 415);
  }
  if (sniffed !== family) {
    return json({ ok: false, error: "content does not match extension" }, 415);
  }
  const mime = ALLOWED[family].mimes[0];

  if (!supabase) return json({ ok: false, error: "database not configured" }, 503);

  /* --- 3) تكرار: نفس البصمة ⇒ نفس الملف، فلا نرفع ولا نinsert مرة أخرى --- */
  const { data: existing, error: findErr } = await supabase
    .from(TABLE)
    .select("id, file_path, file_url, storage_provider, storage_key, status, scanned_at")
    .eq("source_fingerprint", fingerprint)
    .limit(1)
    .maybeSingle();

  if (findErr) {
    // 42703 = العمود غير موجود ⇒ لم يُنفّذ add_scanner_r2_columns.sql بعد.
    // نتوقف قبل الرفع: الرفع ثم الفشل ثم الحذف جولة كاملة بلا فائدة.
    if (findErr.code === "42703" || /source_fingerprint/i.test(findErr.message)) {
      console.error("scanner_inbox.source_fingerprint missing:", findErr.message);
      return json({ ok: false, error: "database schema not migrated" }, 503);
    }
    // خطأ عابر (شبكة مثلًا): نكمل، والفهرس الفريد يبقى الحارس الأخير.
    console.error("fingerprint lookup failed:", findErr.message);
  } else if (existing) {
    return json({
      ok: true,
      duplicate: true,
      id: existing.id,
      file_path: existing.file_path,
      file_url: existing.file_url,
      storage_provider: existing.storage_provider,
      storage_key: existing.storage_key,
    });
  }

  /* --- 4) مفتاح كائن حتمي مشتق من البصمة وتاريخ الملف --- */
  // حتمي = إعادة المحاولة بعد فشل القاعدة تكتب نفس المفتاح بالضبط، فلا تتكرر
  // الملفات. لذلك اليوم يُشتق من mtime الملف لا من وقت التنفيذ: لو استُخدم
  // new Date() لتغيّر المفتاح عند إعادة المحاولة في يوم آخر فبقي كائن يتيم.
  const scannedDate = new Date(scannedAtMs);
  const objectPath = `${utcDay(scannedDate)}/${fingerprint.slice(0, 12)}-${sanitizeSegment(fileName)}`;
  const r2Key = `${LOGICAL_BUCKET}/${objectPath}`;

  /* --- 5) الرفع إلى R2 أولًا: لا سجل قاعدة بيانات قبل نجاحه --- */
  try {
    await r2Put(r2Key, buf, mime);
  } catch (err) {
    console.error("r2 put failed:", err?.message ?? err);
    return json({ ok: false, error: "storage upload failed" }, 502);
  }

  /* --- 6) تسجيل الصف بعد نجاح الرفع فقط --- */
  const scannedAt = scannedDate.toISOString();
  const row = {
    file_path: objectPath,
    file_url: buildRef(objectPath),
    file_name: fileName,
    file_mime: mime,
    file_size: buf.length,
    status: "pending",
    scanned_at: scannedAt,
    storage_provider: "r2",
    storage_key: r2Key,
    source_fingerprint: fingerprint,
  };

  const { data: inserted, error: insErr } = await supabase
    .from(TABLE)
    .insert(row)
    .select("id, file_path, file_url, storage_provider, storage_key")
    .single();

  if (insErr) {
    // 23505 = سباق على البصمة مع جسر آخر. بما أن المفتاح مشتق من mtime والبصمة
    // معًا، فكلا الجسرين يرفعان نفس المفتاح ⇒ لا كائن يتيم ولا حاجة لحذف.
    if (insErr.code === "23505") {
      const { data: winner } = await supabase
        .from(TABLE)
        .select("id, file_path, file_url, storage_provider, storage_key")
        .eq("source_fingerprint", fingerprint)
        .limit(1)
        .maybeSingle();
      if (winner) {
        // حارس إضافي: لو اختلف المفتاح (بصمة قديمة منترحيل سابق) فكائننا يتيم.
        if (winner.storage_key && winner.storage_key !== r2Key) {
          await r2Delete(r2Key).catch((e) =>
            console.error("orphan cleanup failed for", r2Key, e?.message ?? e)
          );
        }
        return json({ ok: true, duplicate: true, ...winner });
      }
    }
    // فشل آخر بعد نجاح الرفع: نحاول إزالة الكائن حتى لا يترك ملفات يتيمة.
    // المفتاح حتمي، فإعادة المحاولة ستعيد رفع نفس المفتاح بلا تكرار.
    try {
      await r2Delete(r2Key);
    } catch (cleanupErr) {
      console.error("orphan cleanup failed for", r2Key, cleanupErr?.message ?? cleanupErr);
    }
    console.error("db insert failed:", insErr.message);
    if (insErr.code === "42703" || /source_fingerprint|storage_provider|storage_key/i.test(insErr.message)) {
      return json({ ok: false, error: "database schema not migrated" }, 503);
    }
    return json({ ok: false, error: "database insert failed" }, 500);
  }

  return json({
    ok: true,
    duplicate: false,
    id: inserted?.id ?? null,
    file_path: objectPath,
    file_url: row.file_url,
    storage_provider: "r2",
    storage_key: r2Key,
    bytes: buf.length,
  });
}

/* ---------------------------------------------------------------- serve */

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  // 1) المصادقة قبل أي قراءة للجسم: لا ن buffering لطلبات غير مصرّح بها.
  if (BRIDGE_TOKEN.length < MIN_TOKEN_LEN) {
    console.error("SCANNER_BRIDGE_TOKEN is not configured or too short");
    return json({ ok: false, error: "bridge not configured" }, 503);
  }
  const provided = req.headers.get("x-scanner-token") || "";
  if (!safeEqual(provided, BRIDGE_TOKEN)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  // 2) فحص الإعداد بلا رفع
  if (req.headers.get("x-scan-action") === "health") {
    return json(await handleHealth());
  }

  const cfg = r2Config();
  if (!cfg.enabled) {
    return json({ ok: false, error: "R2 not configured", missing: cfg.missing }, 503);
  }

  try {
    return json(await handleUpload(req));
  } catch (err) {
    // لا نعيد نص الخطأ: قد يحتوي على تفاصيل حسّاسة أو روابط موقّعة.
    console.error("scanner-upload failed:", err?.message ?? err);
    return json({ ok: false, error: "upload failed" }, 500);
  }
});
