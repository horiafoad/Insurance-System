// ==============================================================================
// جسر السكانر المحلي (scanner-bridge)
//
// يربط الاسكانر الفعلي (HP LaserJet Pro MFP M428dw) بالموقع:
//   1) اسكانري على الكمبيوتر يُضبط مرة واحدة ليحفظ المسحوحات في مجلد
//      (مثال: C:\ScanInbox) — يُسمى "Scan to computer" في برنامج HP.
//   2) شغّلي السكريبت ده على نفس الكمبيوتر:  npm run scan:watch
//   3) السكريبت بيراقب المجلد، وأي ملف (PDF/صورة) جديد يوصله يرفعه تلقائيًا
//      إلى Cloudflare R2 عبر دالة حافة "scanner-upload"، والدالة هي التي
//      تكتب سطر المسحوبة في جدول "scanner_inbox" بحالة pending، وبعدها
//      تظهر في الموقع بانتظار استقباله بأمر تنفيذي.
//
// ------------------------------------------------------------------
// لماذا لم يعد الجسر يرفع إلى Supabase Storage مباشرة؟
// ------------------------------------------------------------------
//   كان الجسر يرفع بـ supabase.storage مباشرة. الآن:
//     • الجسر لا يعرف أي مفتاح R2 إطلاقًا (ولا service_role).
//     • الجسر لا يعرف اسم بكتة R2 ولا يوقّع أي طلب.
//     • كل ما يعرفه: عنوان الدالة + توكن مشترك. الرفع إلى R2 والتسجيل
//       في قاعدة البيانات يحدثان داخل الدالة (الخادم) فقط.
//   وبذلك يمكن إيقاف Supabase Storage دون أن يتوقف المسح الضوئي.
//
// ------------------------------------------------------------------
// إعدادات
// ------------------------------------------------------------------
//   SCAN_INBOX              مجلد الرصد (نفس الاسم السابق، بلا تغيير)
//     PowerShell:  $env:SCAN_INBOX="D:\Scans"; npm run scan:watch
//   SCAN_POLL_MS            فاصل الفحص بالمللي ثانية (افتراضي 2000)
//   SCAN_SETTLE_MS          مهلة انتظار انتهاء كتابة الملف (افتراضي 1500)
//   SCANNER_BRIDGE_TOKEN    توكن الجسر (سري) — انظر أدناه
//   SCANNER_UPLOAD_URL      اختياري: عنوان الدالة لو لم يكن الافتراضي
//
//   التوكن يُقرأ من متغير البيئة process.env، وإن لم يوجد يُقرأ من .env
//   (ملف غير متتبَّع في Git، ومفتاحه ليس VITE_ فلا يصل إلى حزمة المتصفح).
//   يُنشأ في: Supabase -> Edge Functions -> Secrets -> SCANNER_BRIDGE_TOKEN
// ==============================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const WATCH_FOLDER = process.env.SCAN_INBOX || "C:\\ScanInbox";
const STATE_FILE = path.join(__dirname, "state.json");
const POLL_MS = Number(process.env.SCAN_POLL_MS || 2000);
const SETTLE_MS = Number(process.env.SCAN_SETTLE_MS || 1500); // يُجنّب رفع الملف وهو لسه بيتكتب على القرص

// نفس الامتدادات وقاعدة الرفع السابقة — لم يتغيّر سلوك الكشف
const ACCEPTED = /\.(pdf|jpe?g|png)$/i;
const MAX_BYTES = 52_428_800; // 50MB — نفس حد بكت Supabase القديمة
const FUNCTION_NAME = "scanner-upload";

/* ------------------------- حماية مثيل واحد ------------------------- */

const LOCK_FILE = path.join(__dirname, "instance.lock");

/**
 * هل هذا المثيل هو صاحب القفل فعلًا؟
 * ضروري: المثيل الذي يُرفض (لأن مثيلًا آخر شغّال) يخرج بـ process.exit،
 * ومُعالج "exit" كان يحذف القفل فيقتل حماية المثيل الواحد ويسمح
 * بجسر ثالث يعمل مع الجسر الأول. الآن لا نحذف إلا قفلنا نحن.
 */
let ownsLock = false;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === "EPERM";
  }
}

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = Number(fs.readFileSync(LOCK_FILE, "utf8"));
      if (pid === process.pid) {
        ownsLock = true; // نفس العملية أعادت التشغيل
      } else if (pid && isAlive(pid)) {
        console.error(
          "⚠️ جسر السكانر شغال بالفعل في نافذة أخرى — أغلقيه هناك أولًا أو اقرن النافذة القديمة، ثم أعد التشغيل."
        );
        process.exit(1);
      } else {
        fs.unlinkSync(LOCK_FILE); // قفل قديم من مثيل انتهى
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    ownsLock = true;
  } catch (err) {
    console.error("تعذر حماية المثيل الوحيد:", err.message);
  }
}

function releaseLock() {
  if (!ownsLock) return; // لا تملك القفل ⇒ لا تحذفه
  try {
    const pid = Number(fs.readFileSync(LOCK_FILE, "utf8"));
    if (pid === process.pid) fs.unlinkSync(LOCK_FILE);
    ownsLock = false;
  } catch {
    /* تجاهل */
  }
}

process.on("exit", releaseLock);

// SIGTERM مضافة عمدًا: بدون معالجها ينتهي Node دون تنفيذ "exit"،
// فيبقى instance.lock ويعدّه process.kill(pid, 0) قفلًا حيًا، فيرفض
// الجسر التالي الإقلاع حتى لو كان المجلد نظيفًا فعلًا.
const shutdown = () => {
  releaseLock();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);

/* ------------------------- قراءة .env ------------------------- */

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  const out = {};
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

const fileEnv = loadEnv();

/**
 * متغير البيئة الحقيقي له الأولوية على .env.
 * ملاحظة أمنية: لا يوجد هنا أي مفتاح R2 ولا service_role — الجسر لا يحتاجهما
 * ولا يملكهما. VITE_SUPABASE_ANON_KEY ليس سرًّا (هو منشور في حزمة المتصفح
 * أصلًا) ويُستخدم فقط لتمرير طلب الجسر عبر بوابة Supabase؛ والصلاحية الفعلية
 * على الرفع هي SCANNER_BRIDGE_TOKEN.
 */
const envOf = (name) => process.env[name] || fileEnv[name] || "";

const SUPABASE_URL = envOf("VITE_SUPABASE_URL").replace(/\/+$/, "");
const ANON_KEY = envOf("VITE_SUPABASE_ANON_KEY");
const BRIDGE_TOKEN = envOf("SCANNER_BRIDGE_TOKEN");
const UPLOAD_URL =
  envOf("SCANNER_UPLOAD_URL") || `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`;

/**
 * بوابة Supabase تتحقق من apikey/Authorization قبل أن reaches الدالة.
 * لذلك نرسل المفتاح العام (غير السري) لتمرير البوابة، والصلاحية الحقيقية
 * على العملية يوفّرها x-scanner-token داخل الدالة.
 * لا حاجة لأي deploy بـ --no-verify-jwt.
 */
function gatewayHeaders() {
  return {
    apikey: ANON_KEY,
    authorization: `Bearer ${ANON_KEY}`,
  };
}

function assertConfigured() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
  if (!ANON_KEY) missing.push("VITE_SUPABASE_ANON_KEY");
  if (!BRIDGE_TOKEN) missing.push("SCANNER_BRIDGE_TOKEN");
  if (missing.length) {
    console.error(
      `\n⛔ ينقص: ${missing.join(", ")}\n` +
        "   VITE_SUPABASE_URL وVITE_SUPABASE_ANON_KEY موجودان في .env كما كان دائمًا.\n" +
        "   SCANNER_BRIDGE_TOKEN: اضبطه كـ Edge secret في Supabase، ثم ضع نفس\n" +
        "   القيمة في متغير بيئة PowerShell أو في .env.\n"
    );
    process.exit(1);
  }
  if (BRIDGE_TOKEN.length < 24) {
    console.error(
      "\n⛔ SCANNER_BRIDGE_TOKEN قصير جدًا (أقل من 24 حرفًا) — يجب أن يكون سرًا قويًا.\n"
    );
    process.exit(1);
  }
}

/* ------------------------- حالة المعالجة ------------------------- */

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { processed: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function fileSig(p) {
  const st = fs.statSync(p);
  return `${p}|${st.size}|${st.mtimeMs}`;
}

function fileSettled(p) {
  return Date.now() - fs.statSync(p).mtimeMs >= SETTLE_MS;
}

/* ------------------------- الرفع عبر دالة الحافة ------------------------- */

/**
 * بصمة ثابتة للملف: الاسم + الحجم + وقت آخر تعديل.
 * نفس الملف في نفس اللحظة ⇒ نفس البصمة ⇒ الدالة تتعرّف عليه كـ "نفس الملف"
 * فلا ترفع مرتين ولا تُنشئ صفًا مكررًا. أما مسحوبة جديدة بنفس الاسم في
 * وقت مختلف، فيختلف mtime فتبصمة مختلفة وتُعتبر مسحوبة جديدة.
 */
function fingerprintFor(name, size, mtimeMs) {
  return crypto
    .createHash("sha256")
    .update(`${name}|${size}|${Math.trunc(mtimeMs)}`)
    .digest("hex")
    .slice(0, 32);
}

/** فحص الإعداد عند بدء التشغيل — رسالة واضحة بدل فشل عند أول مسحوبة. */
async function checkFunction() {
  try {
    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        ...gatewayHeaders(),
        "x-scanner-token": BRIDGE_TOKEN,
        "x-scan-action": "health",
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.error(`\n⛔ دالة ${FUNCTION_NAME} لا تستجيب (HTTP ${res.status}): ${data.error || ""}`);
      console.error(`   تأكدي من نشر الدالة وضبط SCANNER_BRIDGE_TOKEN كـ Edge secret.`);
      return false;
    }
    const r2 = data.r2 || {};
    if (!r2.enabled) {
      console.error(`\n⛔ R2 غير مهيّأ داخل الدالة. ناقص: ${(r2.missing || []).join(", ")}`);
      return false;
    }
    if (!data.db) {
      console.error("\n⛔ الدالة لا تستطيع الوصول لقاعدة البيانات.");
      return false;
    }
    console.log(`  الدالة: ${FUNCTION_NAME} ✔  البكت: ${r2.bucket}  الحد: ${Math.round((data.limits?.maxBytes || 0) / 1048576)}MB`);
    return true;
  } catch (err) {
    console.error(`\n⛔ تعذر الوصول إلى ${UPLOAD_URL}\n   ${err.message}`);
    console.error("   تأكدي من الاتصال بالإنترنت ومن رابط المشروع.");
    return false;
  }
}

async function uploadScan(filePath, stat) {
  const name = path.basename(filePath);
  const buf = fs.readFileSync(filePath);

  if (buf.length < 1) throw new Error("الملف فارغ.");
  if (buf.length > MAX_BYTES) {
    throw new Error(`الملف أكبر من الحد المسموح (${Math.round(MAX_BYTES / 1048576)}MB).`);
  }

  // الدالة هي من يتحقق من النوع والحجم فعليًا؛ هنا تحقق مبكر لرسالة أوضح.
  if (!ACCEPTED.test(name)) throw new Error("نوع ملف غير مدعوم.");

  const fingerprint = fingerprintFor(name, buf.length, stat.mtimeMs);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      ...gatewayHeaders(),
      "x-scanner-token": BRIDGE_TOKEN,
      "x-scan-name": encodeURIComponent(name),
      "x-scan-fingerprint": fingerprint,
      "x-scan-mtime": String(Math.trunc(stat.mtimeMs)),
      "content-type": "application/octet-stream",
    },
    body: buf,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }

  return {
    name,
    id: data.id ?? null,
    duplicate: Boolean(data.duplicate),
    key: data.storage_key || data.file_path,
  };
}

/* ------------------------- دورة الرصد ------------------------- */

function ensureFolder() {
  if (!fs.existsSync(WATCH_FOLDER)) {
    fs.mkdirSync(WATCH_FOLDER, { recursive: true });
    console.log(`[جسر السكانر] أنشأ مجلد الرصد: ${WATCH_FOLDER}`);
  }
}

async function scanOnce() {
  ensureFolder();
  const state = loadState();
  let files;
  try {
    files = fs.readdirSync(WATCH_FOLDER);
  } catch (err) {
    console.error("[جسر السكانر] تعذر قراءة المجلد:", err.message);
    return;
  }

  for (const f of files) {
    if (f.startsWith(".") || !ACCEPTED.test(f)) continue;
    const full = path.join(WATCH_FOLDER, f);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const sig = fileSig(full);
    if (state.processed.includes(sig)) continue;
    if (!fileSettled(full)) continue; // لسه بيتكتب على القرص؟

    try {
      const result = await uploadScan(full, stat);
      state.processed.push(sig);
      saveState(state);
      const tag = result.duplicate ? "↺ موجودة مسبقًا" : "✅";
      const id = result.id ? ` (سطر #${result.id})` : "";
      console.log(
        `[${new Date().toLocaleTimeString()}] ${tag} «${result.name}» → R2: ${result.key}${id}`
      );
    } catch (err) {
      // لا نُسجّل الملف كمعالَج، فيُعاد المحاولة في الدورة التالية.
      // 401 تعني غالبًا أن التوكن غير مطابق ⇒ نُفصّح ذلك لأن إعادة المحاولة
      // لن تنجح قبل تصحيح الإعداد.
      if (err.httpStatus === 401 || err.httpStatus === 503) {
        console.error(
          `[${new Date().toLocaleTimeString()}] ❌ ${f}: ${err.message} — توقفي الجسر وصحّحي الإعداد،` +
            " لن تنجح المحاولة التالية قبل ذلك."
        );
      } else {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ ${f}: ${err.message}`);
      }
    }
  }
}

/* ------------------------- التشغيل ------------------------- */

console.log("===========================================================");
console.log("  جسر السكانر المحلي → موقع إدارة الاستحقاقات");
console.log(`  مجلد الرصد: ${WATCH_FOLDER}`);
console.log(`  المشروع:    ${SUPABASE_URL || "(غير مضبوط)"}`);
console.log(`  الرفع:       Cloudflare R2 عبر دالة ${FUNCTION_NAME}`);
console.log("===========================================================");

assertConfigured();
acquireLock();

console.log("  تأكدي أن برنامج HP Scan يحفظ المسحوحات في هذا المجلد، ثم");
console.log("  أي ورقة تسكنيها هتيجي تلقائيًا في الموقع عند «مسحوحات السكانر».");
console.log(`  (أوقفي الجسر بـ Ctrl+C)`);

checkFunction().then((ok) => {
  scanOnce();
  setInterval(scanOnce, POLL_MS);
  if (!ok) {
    console.error("\n⚠️ سيبقى الجسر يعمل للمراقبة، لكن كل محاولة رفع ستُحفظ كـ«معلّقة» حتى يُصحَّح الإعداد.\n");
  }
});
