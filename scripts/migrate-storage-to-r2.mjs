/* ------------------------------------------------------------------
   migrate-storage-to-r2.mjs — نقل ملفات Supabase Storage إلى Cloudflare R2

   لماذا هذا السكربت؟
   ------------------------------------------------------------------
   بكتات Supabase الحالية عامة، وقد امتلأت حصة التخزين عندك، فيفشل
   عرض الروابط العامة (exceed_storage_size_quota). هذا السكربت ينسخ كل
   ملف فعليًا إلى R2 ثم يحدّث رابطه في قاعدة البيانات، فيظهر الملف مجددًا
   عبر رابط موقّع قصير الأجل من دالة file-storage.

   المبادئ:
   1) لا حذف أبدًا. الملف الأصلي في Supabase يبقى حتى تتأكد بنفسك.
   2) dry-run هو الوضع الافتراضي: لا يُكتب أي شيء بدون --apply.
   3) قابل للتشغيل مجددًا (idempotent): أي صف رابطه r2:// يُتخطى.
   4) فشل صف واحد لا يوقف باقي العملية، وكل شيء مسجّل في تقرير.

   ===== الاستخدام =====
     # 1) فحص الاتصال (يكفي للتأكد من الإعداد) — ابدأ بهذا
     node scripts/migrate-storage-to-r2.mjs --check

     # 2) معاينة كاملة بلا كتابة
     node scripts/migrate-storage-to-r2.mjs

     # 3) جدول واحد فقط للتجربة
     node scripts/migrate-storage-to-r2.mjs --apply --table issues

     # 4) التنفيذ الكامل
     node scripts/migrate-storage-to-r2.mjs --apply

     خيارات إضافية:
       --table <name>     جدول واحد فقط
       --bucket <name>    بكتة واحدة فقط
       --prefix <path>    بادئة مسار داخل البكتة
       --limit <n>        أقصى عدد صفوف لكل جدول (تجربة سريعة)
       --verbose          اطبع كل سطر أثناء العمل
       --no-objects       تخطّي نسخ الكائنات غير المرتبطة بسجل

   المتطلبات:
   - VITE_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY
     (من .env أو متغيرات البيئة)
   - متغيرات R2 في بيئة التشغيل:
       R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
     يجب أن يكون الـ token من نوع "Object Read & Write" مقيّدًا على
     البكتة المستهدفة فقط. لا تُكتب هذه القيم في أي ملف ولا في Git.

   ملاحظة عن شكل الرابط بعد الترحيل:
   يصبح عمود file_url هو "r2://<bucket>/<path>". هذا ليس رابطًا يفتحه
   المتصفح مباشرة؛ طبقة fileStorage.js تطلب رابطًا موقّعًا عند العرض.
   لذلك لا تفتح r2:// من المتصفح ولا تحفظه خارج قاعدة البيانات.
------------------------------------------------------------------ */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--")
    ? args[i + 1]
    : fallback;
};

const APPLY = has("--apply");
const CHECK_ONLY = has("--check");
const SKIP_OBJECTS = has("--no-objects");
const TABLE_FILTER = argValue("--table", "");
const BUCKET_FILTER = argValue("--bucket", "");
const PREFIX_FILTER = argValue("--prefix", "");
const LIMIT = Number(argValue("--limit", 0)) || 0;
const VERBOSE = has("--verbose");

/* ------------------------------------------------------------------
   الجداول → البكتة المنطقية وعمود الرابط.
   مكتشفة من ملفات *.sql في جذر المشروع، لا مخمَّنة.
   altCols = أعمدة إضافية تحتفظ بروابط ملفات يجب ترحيلها أيضًا.
   مهم: أي عمود مذكور هنا يجب أن يكون موجودًا فعلًا؛ غير الموجود يُتجاهل
   تلقائيًا (row[c] → undefined) لكن إدراجه خطأ تشغيلي.
------------------------------------------------------------------ */
const TABLE_MAP = [
  { table: "issues", bucket: "issues-files", urlCol: "file_url" },
  { table: "issue_details", bucket: "issues-files", urlCol: "pdf_url" },
  { table: "case_documents", bucket: "issues-files", urlCol: "file_url" },
  { table: "letters", bucket: "letter-images", urlCol: "image_url" },
  {
    table: "faculty_salary_archive",
    bucket: "faculty-salary-archive",
    urlCol: "file_url",
    pathCol: "file_path",
    // معاينات الصفحات: بدونها تبقى الصور معطّلة بعد الترحيل
    altCols: ["preview_url", "preview_urls"],
  },
  {
    table: "employee_salary_archive",
    bucket: "employee-salary-archive",
    urlCol: "file_url",
    pathCol: "file_path",
    altCols: ["preview_url", "preview_urls"],
  },
  { table: "faculty_salary_imports", bucket: "faculty-salary-archive", urlCol: "file_url", pathCol: "storage_path" },
  { table: "employee_salary_imports", bucket: "employee-salary-archive", urlCol: "file_url", pathCol: "storage_path" },
  { table: "salary_import_files", bucket: "faculty-salaries", urlCol: "file_url" },
  { table: "executive_order_persons", bucket: "executive-orders", urlCol: "file_url", pathCol: "file_path" },
  { table: "scanner_inbox", bucket: "scanner-inbox", urlCol: "file_url", pathCol: "file_path" },
  { table: "faculty_salary_pages", bucket: "faculty-salaries", urlCol: "page_image_url" },
];

const kb = (bytes) => Math.round(bytes / 1024);
const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const reportPath = path.resolve(
  process.cwd(),
  `.storage-r2-migration-report-${stamp}.json`
);

let report = [];
const saveReport = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

/* ----------------------------- البيئة ----------------------------- */
function readEnvFile() {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .map((line) => {
          const idx = line.indexOf("=");
          if (idx === -1) return [line.trim(), ""];
          return [
            line.slice(0, idx).trim(),
            line.slice(idx + 1).trim().replace(/^["']|["']$/g, ""),
          ];
        })
    );
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile();

/**
 * القيم السرّية تُقرأ من process.env حصرًا — لا تُقرأ أبدًا من .env ولا من
 * أي ملف، حتى لا تُكتب في مستودع كان .env متتبَّعًا فيه سابقًا.
 */
const secretEnvOf = (name) => process.env[name] || "";

/**
 * القيم غير السرّية (رابط المشروع فقط) يُسمح لها أن تأتي من .env
 * لأنه ليس سرًّا ولا يُستخدم في المتصفح.
 */
const publicEnvOf = (name) => process.env[name] || fileEnv[name] || "";

/** أي سر وُجد داخل .env نُنبّه عنه بدل أن نستخدمه بصمت. */
function warnIfSecretsInEnvFile() {
  const secretNames = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ];
  const found = secretNames.filter((n) => fileEnv[n]);
  if (found.length) {
    console.warn(
      "⚠ تحذير: " +
        found.join(", ") +
        " موجود في ملف .env — سيُتجاهل عمدًا.\n" +
        "  انقله إلى environment variables الطرفية فقط، واحذفه من .env."
    );
  }
}

let supabase = null;

async function initSupabase() {
  const url = publicEnvOf("VITE_SUPABASE_URL");
  const serviceKey = secretEnvOf("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("ينقص: VITE_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ------------------------------------------------------------------
   طبقة R2: توقيع SigV4 بـ node:crypto (بدون أي حزمة خارجية).
   منطق التوقيع مطابق لـ supabase/functions/_shared/r2.ts حتى تتصرف
   الواجهة والسكربت بنفس الطريقة تمامًا.
------------------------------------------------------------------ */
const R2_REGION = "auto";

let R2 = null;

function initR2() {
  const accountId = secretEnvOf("R2_ACCOUNT_ID");
  const accessKeyId = secretEnvOf("R2_ACCESS_KEY_ID");
  const secretAccessKey = secretEnvOf("R2_SECRET_ACCESS_KEY");
  const bucket = secretEnvOf("R2_BUCKET_NAME");

  const missing = [];
  if (!accountId) missing.push("R2_ACCOUNT_ID");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("R2_BUCKET_NAME");
  if (missing.length) {
    console.error("ينقص متغيرات R2: " + missing.join(", "));
    process.exit(1);
  }

  R2 = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    host: `${accountId}.r2.cloudflarestorage.com`,
  };
}

/** ترميز RFC3986 — S3 تتطلب تهريب !'()* أيضًا. */
function uriEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function encodeKeyPath(key) {
  return key
    .split("/")
    .map((segment) => uriEncode(segment))
    .join("/");
}

function sha256Hex(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? Buffer.from(value, "utf8") : value)
    .digest("hex");
}

function hmac(key, message) {
  return crypto.createHmac("sha256", key).update(message, "utf8").digest();
}

function amzDate(date) {
  const amz = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz, stamp: amz.slice(0, 8) };
}

/** يبني طلبًا موقّعًا (SigV4) لعملية واحدة على R2. */
function signRequest({ method, key, body = null, contentType = null }) {
  const { amz, stamp: dateStamp } = amzDate(new Date());
  const payloadHash = sha256Hex(body ?? Buffer.alloc(0));
  const canonicalUri = `/${R2.bucket}/${encodeKeyPath(key)}`;
  const scope = `${dateStamp}/${R2_REGION}/s3/aws4_request`;

  const headers = {
    host: R2.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  };
  if (contentType) headers["content-type"] = contentType;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders =
    signedHeaderNames.map((n) => `${n}:${String(headers[n]).trim()}`).join("\n") + "\n";
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + R2.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, R2_REGION);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  const query = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${uriEncode(`${R2.accessKeyId}/${scope}`)}`,
    `X-Amz-Date=${amz}`,
    `X-Amz-Expires=900`,
    `X-Amz-SignedHeaders=${uriEncode(signedHeaders)}`,
    `X-Amz-Signature=${signature}`,
  ].join("&");

  return {
    url: `https://${R2.host}${canonicalUri}?${query}`,
    headers,
  };
}

async function putObject(key, buffer, contentType) {
  const req = signRequest({ method: "PUT", key, body: buffer, contentType });
  const res = await fetch(req.url, {
    method: "PUT",
    headers: req.headers,
    body: buffer,
  });
  if (!res.ok) {
    // لا نطبع الرابط الموقّع أبدًا لأنه سر مؤقت
    throw new Error(`R2 PUT فشل (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}

async function getObject(key) {
  const req = signRequest({ method: "GET", key });
  const res = await fetch(req.url, { method: "GET", headers: req.headers });
  if (!res.ok) {
    throw new Error(`R2 GET فشل (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function deleteObject(key) {
  const req = signRequest({ method: "DELETE", key });
  const res = await fetch(req.url, { method: "DELETE", headers: req.headers });
  // 204 = حُذف، 404 = غير موجود أصلًا — كلاهما يعني أن الملف غير موجود
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE فشل (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return res.status;
}

/* ------------------ تنسيق أخطاء مفهوم بدل [object Object] ----------------- */
function describeError(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  const parts = [];
  if (err.message) parts.push(err.message);
  if (err.code) parts.push(`[code: ${err.code}]`);
  if (err.details) parts.push(`[details: ${err.details}]`);
  if (err.hint) parts.push(`[hint: ${err.hint}]`);
  if (parts.length) return parts.join(" ");
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * يميّز سبب فشل الوصول إلى الجدول حتى لا نُخرج رسالة مضلّلة
 * (مثل "نفّذ SQL" بسبب خطأ مصادقة أو خدمة مقيّدة).
 */
function classifyDbError(err) {
  const text = describeError(err);
  if (!text) return "خطأ غير معروف";
  if (/restricted|exceed_storage_size_quota|spend caps/i.test(text)) {
    return "خدمة Supabase مقيّدة (تجاوز حصة التخزين) — راجع اشتراك المشروع";
  }
  if (/Invalid API key|JWT|invalid.*key/i.test(text)) {
    return "مفتاح API غير صالح — تحقّق من SUPABASE_SERVICE_ROLE_KEY";
  }
  if (/row-level security|permission denied/i.test(text)) {
    return "صلاحية غير كافية — يلزم مفتاح service_role";
  }
  if (/\b42703\b|column .* does not exist/i.test(text)) {
    return "العمود غير موجود — نفّذ add_r2_storage_columns.sql";
  }
  if (/\b42P01\b|relation .* does not exist/i.test(text)) {
    return "الجدول غير موجود";
  }
  if (/Failed to fetch|fetch failed|ENOTFOUND|ETIMEDOUT/i.test(text)) {
    return "تعذّر الاتصال بالشبكة — تحقّق من VITE_SUPABASE_URL";
  }
  return text;
}

/* ------------------------- مساعدات المراجع ------------------------- */

function parseSupabasePublicUrl(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/\/storage\/v1\/object\/public\/([^?#]+?)(?:\?|#|$)/);
  if (!m) return null;
  let rest;
  try {
    rest = decodeURIComponent(m[1]);
  } catch {
    rest = m[1];
  }
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

const isMigrated = (v) => typeof v === "string" && v.startsWith("r2://");
const isHttp = (v) => typeof v === "string" && /^https?:\/\//i.test(v);

const objectKeyFor = (bucket, objectPath) => `${bucket}/${String(objectPath).replace(/^\/+/, "")}`;

function r2RefFor(bucket, objectPath) {
  const encoded = String(objectPath)
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `r2://${bucket}/${encoded}`;
}

/* --------------------------- Supabase I/O -------------------------- */
async function downloadFromSupabase(bucket, objectPath) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) throw error;
  if (!data || data.size === 0) throw new Error("الملف غير موجود أو فارغ");
  return data;
}

async function listObjects(bucket, prefix) {
  const out = [];
  let offset = 0;
  for (let page = 0; page < 1000; page += 1) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix || "", { limit: 1000, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }
  return out;
}

/* ------------------------------- الفحص ------------------------------ */

// مسار ملف الاختبار المؤقت. لا علاقة له بملفات المستخدمين، ويُحذف فورًا.
const TEST_KEY = "_system_test/r2-connectivity-test.txt";
const TEST_CONTENT = Buffer.from(
  `r2 connectivity test\n${new Date().toISOString()}\n`,
  "utf8"
);

async function runCheck() {
  console.log("=== فحص الاتصال (storage:check) ===");
  console.log("لن يُكتب شيء في قاعدة البيانات ولن تُلمس ملفات المستخدمين.\n");

  const problems = [];

  warnIfSecretsInEnvFile();

  /* --- 0) المتغيرات الناقصة: نبلغ عن كلها دفعة واحدة --- */
  const required = {
    VITE_SUPABASE_URL: publicEnvOf("VITE_SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: secretEnvOf("SUPABASE_SERVICE_ROLE_KEY"),
    R2_ACCOUNT_ID: secretEnvOf("R2_ACCOUNT_ID"),
    R2_ACCESS_KEY_ID: secretEnvOf("R2_ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: secretEnvOf("R2_SECRET_ACCESS_KEY"),
    R2_BUCKET_NAME: secretEnvOf("R2_BUCKET_NAME"),
  };
  const missing = Object.keys(required).filter((k) => !required[k]);
  console.log("[0] متغيرات البيئة");
  for (const name of Object.keys(required)) {
    const value = required[name];
    console.log(`    ${value ? "✓" : "✗"} ${name}${value ? " (مضبوط)" : " — ناقص"}`);
  }
  if (missing.length) {
    console.log(
      "\n⛔ ينقص: " + missing.join(", ") + "\n" +
        "   اضبطها في environment variables الطرفية ثم أعد تشغيل storage:check.\n" +
        "   لا تضع أي secret داخل ملفات المشروع أو Git."
    );
    process.exit(1);
  }
  console.log("");

  await initSupabase();

  /* --- 1) Supabase Storage --- */
  console.log("[1] Supabase Storage");
  let supabaseBlocked = "";
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) {
    supabaseBlocked = classifyDbError(bErr);
    console.error(`    ✗ فشل الاتصال: ${supabaseBlocked}`);
    problems.push("Supabase Storage غير متاح — " + supabaseBlocked);
  } else {
    console.log(`    ✓ ${buckets.length} بكتة`);
    for (const b of buckets) {
      console.log(`      - ${b.name} (${b.public ? "public" : "private"})`);
    }
  }
  console.log("");

  /* --- 2) جداول وأعمدة الروابط --- */
  console.log("[2] جداول التخزين وأعمدة الروابط");
  if (supabaseBlocked) {
    console.log(`    ⏭ متخطّى — ${supabaseBlocked}`);
  } else {
    for (const spec of TABLE_MAP) {
      const { error } = await supabase.from(spec.table).select(spec.urlCol).limit(1);
      console.log(
        error
          ? `    ✗ ${spec.table}.${spec.urlCol} — ${classifyDbError(error)}`
          : `    ✓ ${spec.table}.${spec.urlCol}`
      );
    }
  }
  console.log("");

  /* --- 3) أعمدة R2 (مطلوبة قبل الترحيل) --- */
  console.log("[3] أعمدة R2 المطلوبة (storage_provider / storage_key)");
  if (supabaseBlocked) {
    console.log(`    ⏭ متخطّى — ${supabaseBlocked}`);
  } else {
    for (const spec of TABLE_MAP) {
      const { error } = await supabase
        .from(spec.table)
        .select("storage_provider, storage_key")
        .limit(1);
      console.log(
        error
          ? `    ✗ ${spec.table} — ${classifyDbError(error)}`
          : `    ✓ ${spec.table}`
      );
    }
  }
  console.log("");

  /* --- 4) اختبار اتصال R2 الحقيقي: رفع + قراءة + حذف --- */
  console.log("[4] اختبار اتصال R2 (رفع → قراءة → حذف)");
  initR2();
  const fullKey = `${R2.bucket}/${TEST_KEY}`;
  console.log(`    المسار: ${fullKey}`);

  let uploaded = false;
  try {
    await putObject(TEST_KEY, TEST_CONTENT, "text/plain; charset=utf-8");
    uploaded = true;
    console.log("    ✓ 1/3 الرفع");
  } catch (err) {
    console.error(`    ✗ 1/3 الرفع فشل: ${describeError(err)}`);
    console.error("      تحقّق من: اسم البكتة، صلاحية Read & Write للـ token،");
    console.error("      وأن الحساب (account id) يطابق الـ token.");
  }

  if (uploaded) {
    try {
      const readBack = await getObject(TEST_KEY);
      const same = readBack.equals(TEST_CONTENT);
      console.log(
        same
          ? `    ✓ 2/3 القراءة — ${readBack.length} بايت والمحتوى مطابق`
          : `    ✗ 2/3 القراءة — المحتوى مختلف (${readBack.length} بايت)`
      );
      if (!same) problems.push("محتوى الملف المقروء لا يطابق المكتوب");
    } catch (err) {
      console.error(`    ✗ 2/3 القراءة فشلت: ${describeError(err)}`);
      problems.push("لا يمكن قراءة الملف بعد رفعه — تحقّق من صلاحية Read");
    }

    try {
      const status = await deleteObject(TEST_KEY);
      console.log(`    ✓ 3/3 الحذف (HTTP ${status})`);
    } catch (err) {
      console.error(`    ✗ 3/3 الحذف فشل: ${describeError(err)}`);
      problems.push("تعذّر حذف ملف الاختبار — احذفه يدويًا من لوحة Cloudflare");
    }

    // تأكيد أن الملف لم يعد موجودًا
    try {
      await getObject(TEST_KEY);
      console.error("    ⚠ الملف ما زال موجودًا بعد الحذف");
      problems.push("ملف الاختبار لم يُحذف");
    } catch {
      console.log("    ✓ تأكدنا أن ملف الاختبار لم يعد موجودًا");
    }
  } else {
    console.log("    - تخطّي القراءة والحذف لأن الرفع فشل");
  }

  console.log("\n=== الخلاصة ===");
  if (problems.length) {
    console.log("مشاكل تحتاج معالجة:\n" + problems.map((p) => "  ✗ " + p).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("  ✓ الاتصال بـ Supabase و R2 سليم.");
  }
  console.log("\nلم تُنفَّذ أي عملية ترحيل ولم تُلمس أي بيانات.");
  if (problems.length) {
    console.log("عالج المشاكل أعلاه ثم أعد تشغيل storage:check.");
  } else {
    console.log(
      "الخطوة التالية الآمنة: npm run storage:migrate   (معاينة بلا كتابة — لا --apply)"
    );
  }
}

/* ----------------------------- الترحيل ----------------------------- */
function quotaExit(message) {
  console.error("  ⛔ " + message);
  console.error("     ارفع حصة Supabase مؤقتًا ثم أعد تشغيل السكربت.");
  process.exit(2);
}

async function migrateTable(spec) {
  const { table, bucket, urlCol, pathCol, altCols = [] } = spec;
  console.log(`\n── ${table}  →  ${bucket} ──`);

  let query = supabase.from(table).select("*");
  if (LIMIT) query = query.limit(LIMIT);
  const { data: rows, error } = await query;
  if (error) {
    const reason = classifyDbError(error);
    console.error(`  ✗ تعذّرت القراءة: ${reason}`);
    report.push({ table, ok: false, error: reason });
    saveReport();
    if (/مقيّدة|quota|حصة/i.test(reason)) quotaExit(reason);
    return;
  }

  let scanned = 0;
  let moved = 0;
  let skipped = 0;
  let failed = 0;
  let bytes = 0;
  const problemsFound = [];
  const rowErrors = [];

  for (const row of rows || []) {
    // نجمع كل روابط الملفات في الصف: أعمدة نصية + أعمدة مصفوفة (text[]).
    // مثال: file_url + preview_url + preview_urls[] لنفس السجل.
    const candidates = [];
    for (const col of [urlCol, pathCol, ...(altCols || [])]) {
      if (!col) continue;
      const raw = row[col];
      if (typeof raw === "string" && raw) {
        candidates.push({ col, index: null, value: raw });
      } else if (Array.isArray(raw)) {
        raw.forEach((v, i) => {
          if (typeof v === "string" && v) candidates.push({ col, index: i, value: v });
        });
      }
    }
    if (candidates.length === 0) continue;
    scanned += 1;

    let rowFailed = 0;

    for (const cand of candidates) {
      if (isMigrated(cand.value)) {
        skipped += 1;
        continue;
      }
      if (!isHttp(cand.value)) {
        skipped += 1;
        continue;
      }

      const parsed = parseSupabasePublicUrl(cand.value);
      if (!parsed) {
        failed += 1;
        rowFailed += 1;
        report.push({
          table,
          rowId: row.id,
          column: cand.col,
          ok: false,
          error: "unrecognized url",
          value: cand.value,
        });
        continue;
      }

      if (BUCKET_FILTER && BUCKET_FILTER !== (parsed.bucket || bucket)) {
        skipped += 1;
        continue;
      }
      if (PREFIX_FILTER && !parsed.path.startsWith(PREFIX_FILTER)) {
        skipped += 1;
        continue;
      }

      const srcBucket = parsed.bucket || bucket;
      const objectPath = parsed.path;
      const key = objectKeyFor(srcBucket, objectPath);

      try {
        const blob = await downloadFromSupabase(srcBucket, objectPath);
        const buffer = Buffer.from(await blob.arrayBuffer());

        if (APPLY) {
          await putObject(key, buffer, blob.type || "application/octet-stream");

          const r2Ref = r2RefFor(srcBucket, objectPath);
          const patch = { storage_provider: "r2", storage_key: key };
          if (cand.index === null) {
            patch[cand.col] = r2Ref;
          } else {
            // العمود مصفوفة: ننسخها ونعدّل العنصر المرحَّل فقط
            const copy = Array.isArray(row[cand.col]) ? [...row[cand.col]] : [];
            copy[cand.index] = r2Ref;
            patch[cand.col] = copy;
          }

          const { error: upErr } = await supabase.from(table).update(patch).eq("id", row.id);
          if (upErr) throw new Error("تحديث قاعدة البيانات: " + describeError(upErr));

          // سجل التدقيق اختياري: إن لم يكن الجدول موجودًا فلا نُفشل الترحيل.
          // أسماء الأعمدة مطابقة تمامًا لـ add_r2_storage_columns.sql
          const { error: logErr } = await supabase.from("storage_migration_log").insert({
            supabase_bucket: srcBucket,
            object_path: objectPath,
            r2_key: key,
            size_bytes: buffer.length,
            mime_type: blob.type || null,
            status: "db_updated",
            rows_updated: 1,
            table_name: table,
            row_id: String(row.id),
          });
          if (logErr) {
            problemsFound.push(
              `سجل التدقيق لم يُكتب لـ ${table}#${row.id}: ${classifyDbError(logErr)}`
            );
          }
        }

        moved += 1;
        bytes += buffer.length;
        report.push({ table, rowId: row.id, column: cand.col, ok: true, key, bytes: buffer.length });
        saveReport();
        if (VERBOSE) console.log(`  ✓ ${table}#${row.id}.${cand.col}  ${kb(buffer.length)}KB  ${key}`);
      } catch (err) {
        const message = err?.message || String(err);
        if (/exceed_storage_size_quota/i.test(message)) {
          quotaExit(`حصة تخزين Supabase ممتلئة أثناء تنزيل ${key}.`);
        }
        failed += 1;
        rowFailed += 1;
        report.push({ table, rowId: row.id, column: cand.col, ok: false, error: message });
        saveReport();
        console.error(`  ✗ ${table}#${row.id}.${cand.col}: ${message}`);
      }
    }

    if (rowFailed) rowErrors.push({ table, rowId: row.id, failed: rowFailed });
  }

  console.log(
    `  فُحص ${scanned} صف · نُقل ${moved} ملف · تجاهُل ${skipped} · فشل ${failed}` +
      (bytes ? ` · ${mb(bytes)}MB` : "")
  );
  if (problemsFound.length) {
    console.log("  ⚠ تنبيهات:");
    for (const p of problemsFound) console.log("    - " + p);
  }
  if (rowErrors.length) {
    console.log(
      `  ⚠ صفوف تحتاج مراجعة يدوية (فشل جزئي): ${rowErrors.length}` +
        " — راجع التقرير قبل إعادة التشغيل"
    );
  }
}

async function migrateOrphanObjects() {
  const buckets = [...new Set(TABLE_MAP.map((t) => t.bucket))].filter(
    (b) => !BUCKET_FILTER || BUCKET_FILTER === b
  );

  console.log("\n══ نسخ الكائنات غير المرتبطة بصف في جدول ══");
  console.log("   (أرشفة احتياطية: لو حُذف صف يومًا لن تضيع الملفات)");

  for (const bucket of buckets) {
    let objects;
    try {
      objects = await listObjects(bucket, PREFIX_FILTER);
    } catch (err) {
      console.error(`\n  ${bucket}: تعذّر العرض — ${err.message}`);
      continue;
    }

    const files = objects.filter((o) => o.id == null);
    if (!files.length) {
      console.log(`\n  ${bucket}: لا يوجد`);
      continue;
    }

    let copied = 0;
    let failed = 0;
    let bytes = 0;

    console.log(`\n  ${bucket}: ${files.length} كائن`);
    for (const file of files) {
      const key = objectKeyFor(bucket, file.name);
      try {
        const blob = await downloadFromSupabase(bucket, file.name);
        const buffer = Buffer.from(await blob.arrayBuffer());
        if (APPLY) {
          await putObject(key, buffer, file.metadata?.mimetype || blob.type || "application/octet-stream");
        }
        copied += 1;
        bytes += buffer.length;
        if (VERBOSE) console.log(`    ✓ ${kb(buffer.length)}KB  ${key}`);
      } catch (err) {
        const message = err?.message || String(err);
        if (/exceed_storage_size_quota/i.test(message)) {
          quotaExit(`حصة Supabase ممتلئة أثناء ${key}.`);
        }
        failed += 1;
        report.push({ bucket, key, ok: false, error: message });
        console.error(`    ✗ ${key}: ${message}`);
      }
    }
    saveReport();
    console.log(`    نُسخ ${copied} · فشل ${failed}` + (bytes ? ` · ${mb(bytes)}MB` : ""));
  }
}

/* -------------------------------- تشغيل ------------------------------- */
async function main() {
  // في وضع الفحص نبدأ من runCheck لأنها تتحقق من المتغيرات أولًا وتُبلغ
  // عن كل الناقص دفعة واحدة بدل الخروج عند أول متغير.
  if (CHECK_ONLY) {
    await runCheck();
    return;
  }

  console.log(
    APPLY
      ? "⚙️  وضع التنفيذ — سيُكتب في R2 وفي قاعدة البيانات"
      : "🔍 وضع المعاينة — لن يُكتب أي شيء (أضف --apply للتنفيذ)"
  );

  await initSupabase();
  initR2();

  const specs = TABLE_FILTER
    ? TABLE_MAP.filter((t) => t.table === TABLE_FILTER)
    : TABLE_MAP;
  if (TABLE_FILTER && specs.length === 0) {
    console.error(`جدول غير معروف: ${TABLE_FILTER}`);
    process.exit(1);
  }

  console.log(
    `الجداول: ${specs.length} · البكتات: ${new Set(specs.map((s) => s.bucket)).size}` +
      (LIMIT ? ` · حد ${LIMIT} صف/جدول` : "")
  );

  for (const spec of specs) {
    await migrateTable(spec);
  }

  if (!SKIP_OBJECTS) {
    await migrateOrphanObjects();
  }

  const okCount = report.filter((r) => r.ok).length;
  const failCount = report.filter((r) => !r.ok).length;
  const totalBytes = report.reduce((sum, r) => sum + (r.bytes || 0), 0);

  console.log("\n════ الخلاصة ════");
  console.log(`نجح ${okCount} · فشل ${failCount}` + (totalBytes ? ` · ${mb(totalBytes)}MB` : ""));
  console.log(`التقرير: ${reportPath}`);

  if (!APPLY) {
    console.log("\nلم يُكتب أي شيء. أعِد التشغيل مع --apply عند الرضا.");
  } else {
    console.log(
      "\nالملفات الأصلية في Supabase لم تُحذف.\n" +
        "الخطوة التالية: تأكّد من العرض ثم احذف بكتات Supabase يدويًا."
    );
  }
}

main().catch((err) => {
  console.error("فشل غير متوقع:", err);
  process.exit(1);
});
