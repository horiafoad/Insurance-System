// ==============================================================================
// جسر السكانر المحلي (scanner-bridge)
//
// يربط الاسكانر الفعلي (HP LaserJet Pro MFP M428dw) بالموقع:
//   1) اسكانري على الكمبيوتر يُضبط مرة واحدة ليحفظ المسحوحات في مجلد
//      (مثال: C:\ScanInbox) — يُسمى "Scan to computer" في برنامج HP.
//   2) شغّلي السكريبت ده على نفس الكمبيوتر:  npm run scan:watch
//   3) السكريبت بيراقب المجلد، وأي ملف (PDF/صورة) جديد يوصله يرفعه تلقائيًا
//      على Supabase في بكت "scanner-inbox" ويقيده في جدول "scanner_inbox"
//      بحالة pending، وبعدها يظهر في الموقع بانتظار استقباله بأمر تنفيذي.
//
// - يستخدم نفس مكتبة @supabase/supabase-js الموجودة في المشروع (نفس اللي بيستخدمها
//   الموقع) حتى يشتغل مع مفتاح Supabase الجديد (sb_publishable_...) بشكل موثوق.
// - بيقرا بيانات Supabase من ملف .env الموجود في جذر المشروع.
//
// إعدادات (اختيارية):
//   مجلد آخر لرصده:  SCAN_INBOX="D:\Scans" npm run scan:watch
// ==============================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");
const WATCH_FOLDER = process.env.SCAN_INBOX || "C:\\ScanInbox";
const STATE_FILE = path.join(__dirname, "state.json");
const POLL_MS = Number(process.env.SCAN_POLL_MS || 2000);
const SETTLE_MS = Number(process.env.SCAN_SETTLE_MS || 1500); // يُجنّب رفع الملف وهو لسه بيتكتب على القرص
const BUCKET = "scanner-inbox";
const TABLE = "scanner_inbox";

const ACCEPTED = /\.(pdf|jpe?g|png)$/i;

/* ------------------------- حماية مثيل واحد ------------------------- */

const LOCK_FILE = path.join(__dirname, "instance.lock");

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
      if (pid && isAlive(pid)) {
        console.error(
          "⚠️ جسر السكانر شغال بالفعل في نافذة أخرى — أغلقيه هناك أولًا أو اقرن النافذة القديمة، ثم أعد التشغيل."
        );
        process.exit(1);
      }
      fs.unlinkSync(LOCK_FILE); // قفل قديم من مثيل انتهى
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
  } catch (err) {
    console.error("تعذر حماية المثيل الوحيد:", err.message);
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    /* تجاهل */
  }
}

process.on("exit", releaseLock);
process.on("SIGINT", () => {
  releaseLock();
  process.exit(0);
});

/* ------------------------- قراءة .env ------------------------- */

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(`لم يتم العثور على ملف ${envPath} — تأكدي أن الجسر يعمل من داخل المشروع.`);
  }
  const out = {};
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  if (!out.VITE_SUPABASE_URL || !out.VITE_SUPABASE_ANON_KEY) {
    throw new Error("ملف .env لا يحتوي VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY.");
  }
  return out;
}

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

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

/* ------------------------- الرفع لـ Supabase ------------------------- */

function sanitizeKey(name) {
  const ext = path.extname(name) || ".pdf";
  const base = path.basename(name, ext);
  const ascii = base.replace(/[^\w]/g, "").slice(0, 40) || "scan";
  return `${ascii}${ext}`;
}

async function uploadScan(filePath) {
  const name = path.basename(filePath);
  const buf = fs.readFileSync(filePath);
  const mime = /\.pdf$/i.test(name)
    ? "application/pdf"
    : /\.png$/i.test(name)
      ? "image/png"
      : "image/jpeg";
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${sanitizeKey(name)}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, buf, { contentType: mime, upsert: false });
  if (upErr) {
    throw new Error(`فشل رفع الملف إلى التخزين: ${upErr.message}`);
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);
  const fileUrl = pub?.publicUrl || `${env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;

  const { error: insErr } = await supabase.from(TABLE).insert({
    file_path: key,
    file_url: fileUrl,
    file_name: name,
    file_mime: mime,
    file_size: buf.length,
    status: "pending",
    scanned_at: new Date().toISOString(),
  });
  if (insErr) {
    throw new Error(`فشل تسجيل المسحوبة في الجدول: ${insErr.message}`);
  }

  return { name, key };
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
      const result = await uploadScan(full);
      state.processed.push(sig);
      saveState(state);
      console.log(
        `[${new Date().toLocaleTimeString()}] ✅ رُفعت المسحوبة «${result.name}» → ${result.key}`
      );
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] ❌ ${f}: ${err.message}`);
    }
  }
}

/* ------------------------- التشغيل ------------------------- */

console.log("===========================================================");
console.log("  جسر السكانر المحلي → موقع إدارة الاستحقاقات");
console.log(`  مجلد الرصد: ${WATCH_FOLDER}`);
console.log(`  Supabase:   ${env.VITE_SUPABASE_URL}`);
console.log("===========================================================");

acquireLock();

console.log("  تأكدي أن برنامج HP Scan يحفظ المسحوحات في هذا المجلد، ثم");
console.log("  أي ورقة تسكنيها هتيجي تلقائيًا في الموقع عند «مسحوحات السكانر».");
console.log(`  (أوقفي الجسر بـ Ctrl+C)`);

scanOnce();
setInterval(scanOnce, POLL_MS);