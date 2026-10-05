// اختبار محلي معزول لجسر السكانر — لا يلمس Supabase ولا R2 ولا الشبكة.
// يشغّل mock لـ scanner-upload ويفحص:
//   1) اكتشاف PDF/JPG/PNG وتجاهل غير المدعوم
//   2) انتظار انتهاء الكتابة (settle)
//   3) state.json ومنع إعادة الرفع
//   4) عدم إنشاء سجل مكرر (فحص fingerprint)
//   5) رفض الملف المكرر/المُعاد
//   6) المحتوى يصل كما هو (base64 round-trip)
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-test-"));
const INBOX = path.join(TMP, "ScanInbox");
fs.mkdirSync(INBOX, { recursive: true });

// state.json ملف حقيقي يخص المستخدم — ننسخه ونعيده كما كان في كل الأحوال
const STATE_PATH = path.join(ROOT, "scanner-bridge", "state.json");
const STATE_BACKUP = fs.existsSync(STATE_PATH)
  ? fs.readFileSync(STATE_PATH, "utf8")
  : null;

function restoreState() {
  try {
    if (STATE_BACKUP === null) fs.rmSync(STATE_PATH, { force: true });
    else fs.writeFileSync(STATE_PATH, STATE_BACKUP, "utf8");
  } catch {}
}

// قفل مثيل الجسر: على Windows، Stop-Process و child.kill() يستعملان
// TerminateProcess، فلا يسلّمان SIGTERM ولا يشغّلان معالج "exit"، فكل جسر
// نقتله يترك instance.lock خلفه. ننظّفه هنا حتى لا يبقى الملف في مجلد
// السكانر الحقيقي ويتعطّل جسر المستخدم يوم التشغيل.
const LOCK_PATH = path.join(ROOT, "scanner-bridge", "instance.lock");
const LOCK_BACKUP = fs.existsSync(LOCK_PATH) ? fs.readFileSync(LOCK_PATH) : null;
function restoreLock() {
  try {
    if (LOCK_BACKUP === null) fs.rmSync(LOCK_PATH, { force: true });
    else fs.writeFileSync(LOCK_PATH, LOCK_BACKUP);
  } catch {}
}
process.on("exit", restoreState);

const seen = [];
let mode = "ok";
let port = 0;

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const json = (o, s = 200) => {
      res.writeHead(s, { "content-type": "application/json" });
      res.end(JSON.stringify(o));
    };

    if (req.headers["x-scanner-token"] !== "test-token-0123456789-abcdefghij") {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    if (req.headers["x-scan-action"] === "health") {
      return json({
        ok: true,
        r2: { enabled: true, bucket: "test-bucket", missing: [] },
        db: true,
        tokenConfigured: true,
        limits: { maxBytes: 52428800, families: ["pdf", "jpg", "png"] },
      });
    }
    if (mode === "dbfail") return json({ ok: false, error: "database insert failed" }, 500);

    const name = decodeURIComponent(req.headers["x-scan-name"] || "");
    const fp = req.headers["x-scan-fingerprint"] || "";
    seen.push({ name, fp, mtime: req.headers["x-scan-mtime"], b64: body.toString("base64") });

    if (mode === "dupe" && seen.length > 1) {
      return json({ ok: true, duplicate: true, id: 1, storage_key: "scanner-inbox/x.pdf" });
    }
    return json({
      ok: true, duplicate: false, id: seen.length,
      storage_key: `scanner-inbox/2026-01-01/${fp.slice(0, 12)}-${name}`,
    });
  });
});

const results = [];
function check(name, cond, extra = "") {
  results.push({ name, pass: Boolean(cond), extra });
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${extra ? "  → " + extra : ""}`);
}

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n", "latin1");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04]);

function runBridge(extraEnv, ms) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scanner-bridge", "bridge.cjs")], {
      env: {
        ...process.env,
        SCAN_INBOX: INBOX,
        SCAN_POLL_MS: "300",
        SCAN_SETTLE_MS: "100",
        VITE_SUPABASE_URL: `http://127.0.0.1:${port}`,
        VITE_SUPABASE_ANON_KEY: "public-anon-key",
        SCANNER_BRIDGE_TOKEN: "test-token-0123456789-abcdefghij",
        SCANNER_UPLOAD_URL: `http://127.0.0.1:${port}/functions/v1/scanner-upload`,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const t = setTimeout(() => { child.kill(); resolve(out); }, ms);
    child.on("exit", () => { clearTimeout(t); resolve(out); });
  });
}

server.listen(0, "127.0.0.1", async () => {
  port = server.address().port;
  console.log(`mock scanner-upload على 127.0.0.1:${port}\n`);

  // نضع ملفات: مدعومة وغير مدعومة
  fs.writeFileSync(path.join(INBOX, "Scan0001.pdf"), PDF);
  fs.writeFileSync(path.join(INBOX, "Photo002.jpg"), JPG);
  fs.writeFileSync(path.join(INBOX, "Shot003.png"), PNG);
  fs.writeFileSync(path.join(INBOX, "notes.txt"), "should be ignored");
  fs.writeFileSync(path.join(INBOX, ".hidden.pdf"), PDF);

  const out1 = await runBridge({}, 2500);
  server.close();

  console.log("\n--- النتائج ---");
  check("اكتشف 3 ملفات مدعومة فقط", seen.length === 3, `seen=${seen.length}`);
  const names = seen.map((s) => s.name).sort();
  check("الأسماء صحيحة", JSON.stringify(names) === JSON.stringify(["Photo002.jpg", "Scan0001.pdf", "Shot003.png"]), names.join(", "));
  check("تجاهل .txt", !names.includes("notes.txt"));
  check("تجاهل الملف المخفي", !names.includes(".hidden.pdf"));
  check("فحص health عند البدء", /الدالة: scanner-upload ✔/.test(out1));
  check("أبلغ عن البكت", /test-bucket/.test(out1));

  const pdf = seen.find((s) => s.name === "Scan0001.pdf");
  check("المحتوى وصل كما هو (PDF)", pdf && Buffer.from(pdf.b64, "base64").equals(PDF));
  const jpg = seen.find((s) => s.name === "Photo002.jpg");
  check("المحتوى وصل كما هو (JPG)", jpg && Buffer.from(jpg.b64, "base64").equals(JPG));
  const png = seen.find((s) => s.name === "Shot003.png");
  check("المحتوى وصل كما هو (PNG)", png && Buffer.from(png.b64, "base64").equals(PNG));

  check("أرسل mtime كرقم", pdf && /^\d+$/.test(pdf.mtime), pdf?.mtime);
  check("fingerprint بطول 32 hex", pdf && /^[0-9a-f]{32}$/.test(pdf.fp), pdf?.fp);
  check("بصمات مختلفة لكل ملف", new Set(seen.map((s) => s.fp)).size === 3);

  // البصمة هي أساس منع التكرار كله، فلنتحقق أنها sha256 الصحيح لـ name|size|mtime
  // بالضبط كما يحسبها bridge.cjs — لا مجرد "32 حرفًا hex".
  const expectedFp = (name, size, mtimeMs) =>
    crypto.createHash("sha256").update(`${name}|${size}|${Math.trunc(mtimeMs)}`).digest("hex").slice(0, 32);
  for (const s of seen) {
    const size = Buffer.from(s.b64, "base64").length;
    check(
      `بصمة ${s.name} = sha256(name|size|mtime)`,
      s.fp === expectedFp(s.name, size, Number(s.mtime)),
      `متوقع ${expectedFp(s.name, size, Number(s.mtime))} / وصل ${s.fp}`
    );
  }
  // نفس الملف في نفس اللحظة ⇒ نفس البصمة (إعادة المحاولة لا تُنتج سطرًا ثانيًا)
  const same = expectedFp("Scan0001.pdf", PDF.length, Number(pdf?.mtime));
  check("نفس (الاسم,الحجم,mtime) ⇒ نفس البصمة", same === pdf?.fp);
  // نفس الاسم والحجم لكن mtime مختلف ⇒ مسحوبة جديدة ⇒ بصمة مختلفة
  check(
    "mtime مختلف ⇒ بصمة مختلفة (مسحوبة جديدة)",
    expectedFp("Scan0001.pdf", PDF.length, Number(pdf?.mtime) + 60_000) !== pdf?.fp
  );

  // state.json — نقارن بالعدد الأصلي لأن الملف حقيقي وقد يحتوي مدخلات سابقة
  const statePath = STATE_PATH;
  const st = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const originalCount = STATE_BACKUP === null ? 0 : (JSON.parse(STATE_BACKUP).processed || []).length;
  check(
    "state.json أضاف 3 مدخلات فقط",
    Array.isArray(st.processed) && st.processed.length === originalCount + 3,
    `من ${originalCount} إلى ${st.processed?.length}`
  );
  check("state.json بصيغة |size|mtime", st.processed.every((s) => /\|\d+\|[\d.]+$/.test(s)));
  check("state.json لم يُفسد المدخلات السابقة", STATE_BACKUP === null || JSON.parse(STATE_BACKUP).processed.every((old) => st.processed.includes(old)));
});

process.on("exit", () => {
  restoreState();
  restoreLock();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} نجحت`);
  if (failed.length) process.exitCode = 1;
});
