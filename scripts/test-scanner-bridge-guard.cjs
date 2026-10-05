// اختبارات الحالات الحرجة لجسر السكانر — كل شيء محلي، لا Supabase ولا R2.
//   1) منع تشغيل أكثر من جسر واحد (instance.lock)
//   2) انتظار انتهاء كتابة الملف قبل الرفع (SETTLE)
//   3) فشل القاعدة ⇒ لا تُconsider الملف معالَجًا (إعادة محاولة)
//   4) رد duplicate من الدالة ⇒ لا يُرفع مرتين ولا سجل مكرر
//   5) رفض التوكن الخاطئ عند الدالة (لا رفع)
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BRIDGE = path.join(ROOT, "scanner-bridge", "bridge.cjs");
const STATE_PATH = path.join(ROOT, "scanner-bridge", "state.json");

const STATE_BACKUP = fs.existsSync(STATE_PATH) ? fs.readFileSync(STATE_PATH, "utf8") : null;
function restoreState() {
  try {
    if (STATE_BACKUP === null) fs.rmSync(STATE_PATH, { force: true });
    else fs.writeFileSync(STATE_PATH, STATE_BACKUP, "utf8");
  } catch {}
}

// قفل مثيل الجسر: لا يجوز أن نتركه خلفنا أبدًا. لو بقي ملف instance.lock
// فإن الجسر الحقيقي سيرفض الإقلاع (أو يلتقط قفلًا قديمًا)، فيتوقف المسح.
const LOCK_PATH = path.join(ROOT, "scanner-bridge", "instance.lock");
const LOCK_EXISTED = fs.existsSync(LOCK_PATH);
const LOCK_BACKUP = LOCK_EXISTED ? fs.readFileSync(LOCK_PATH) : null;
function restoreLock() {
  try {
    if (LOCK_BACKUP === null) fs.rmSync(LOCK_PATH, { force: true });
    else fs.writeFileSync(LOCK_PATH, LOCK_BACKUP);
  } catch {}
}
process.on("exit", () => {
  restoreState();
  restoreLock();
});

const TOKEN = "test-token-0123456789-abcdefghij";
const PDF = Buffer.from("%PDF-1.7\ntrailer\n%%EOF\n", "latin1");
const results = [];
function check(name, cond, extra = "") {
  results.push({ name, pass: Boolean(cond) });
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${extra ? "  → " + extra : ""}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function startMock(behavior) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const json = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.headers["x-scanner-token"] !== TOKEN) return json({ ok: false, error: "Unauthorized" }, 401);
      if (req.headers["x-scan-action"] === "health") {
        if (behavior.unhealthy) return json({ ok: false, error: "bridge not configured" }, 503);
        return json({ ok: true, r2: { enabled: true, bucket: "b", missing: [] }, db: true, tokenConfigured: true, limits: { maxBytes: 52428800, families: ["pdf"] } });
      }
      hits.push(body.length);
      if (behavior.fail) return json({ ok: false, error: "database insert failed" }, 500);
      return json({ ok: true, duplicate: false, id: hits.length, storage_key: "scanner-inbox/k.pdf" });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, hits, port: server.address().port, close: () => server.close() })
    );
  });
}

function launch(port, inbox, env = {}) {
  const child = spawn(process.execPath, [BRIDGE], {
    env: {
      ...process.env,
      SCAN_INBOX: inbox,
      SCAN_POLL_MS: "250",
      SCAN_SETTLE_MS: "100",
      VITE_SUPABASE_URL: `http://127.0.0.1:${port}`,
      VITE_SUPABASE_ANON_KEY: "public-anon-key",
      SCANNER_BRIDGE_TOKEN: TOKEN,
      SCANNER_UPLOAD_URL: `http://127.0.0.1:${port}/functions/v1/scanner-upload`,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  // stop ينتظر خروج الطفل فعلًا: بدون الانتظار قد يكتب الطفل القفل بعد
  // أن ينظّفه الاختبار، فيبقى instance.lock ويتعطّل المسح الحقيقي.
  return {
    child,
    get out() { return out; },
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        const done = () => resolve();
        child.once("exit", done);
        try { child.kill("SIGTERM"); } catch { return resolve(); }
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} resolve(); }, 2000);
      }),
  };
}

async function scenarioLock() {
  console.log("\n[1] منع تشغيل أكثر من جسر");
  const inbox = fs.mkdtempSync(path.join(os.tmpdir(), "lock-"));
  const m = await startMock({});
  const a = launch(m.port, inbox);
  try {
    await wait(1200);
    fs.writeFileSync(STATE_PATH, JSON.stringify({ processed: [] }, null, 2));
    const b = launch(m.port, inbox);
    const bOut = await new Promise((r) => { let o = ""; b.child.stdout.on("data", (d) => { o += d; }); b.child.stderr.on("data", (d) => { o += d; }); b.child.on("exit", () => r(o)); setTimeout(() => { b.stop(); r(o); }, 1500); });
    check("الجسر الثاني رفض التشغيل", /شغال بالفعل في نافذة أخرى/.test(bOut));
    check("ولم يُنشئ lock ثانٍ", fs.existsSync(LOCK_PATH) === true);
  } finally {
    // try/finally: أي فشل في الاختبار لا يترك قفلًا يعطّل المسح الحقيقي.
    a.stop();
    m.close();
    restoreLock();
    fs.rmSync(inbox, { recursive: true, force: true });
  }
}

async function scenarioSettle() {
  console.log("\n[2] انتظار انتهاء كتابة الملف");
  const inbox = fs.mkdtempSync(path.join(os.tmpdir(), "settle-"));
  const m = await startMock({});
  fs.writeFileSync(STATE_PATH, JSON.stringify({ processed: [] }, null, 2));
  const target = path.join(inbox, "big.pdf");
  // نكتب الملف ونحدّث mtime باستمرار لمحاكاة مسح قيد الكتابة
  const writer = setInterval(() => { fs.writeFileSync(target, PDF); }, 120);
  const p = launch(m.port, inbox, { SCAN_SETTLE_MS: "900" });
  await wait(1500);
  check("لم يُرفع أثناء الكتابة", m.hits.length === 0, `hits=${m.hits.length}`);
  clearInterval(writer);
  await wait(1200);
  check("رُفع بعد توقف الكتابة", m.hits.length === 1, `hits=${m.hits.length}`);
  p.stop(); m.close();
  fs.rmSync(inbox, { recursive: true, force: true });
}

async function scenarioDbFail() {
  console.log("\n[3] فشل القاعدة ⇒ الملف يبقى للمعاودة");
  const inbox = fs.mkdtempSync(path.join(os.tmpdir(), "dbfail-"));
  const m = await startMock({ fail: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify({ processed: [] }, null, 2));
  fs.writeFileSync(path.join(inbox, "Scan.pdf"), PDF);
  const p = launch(m.port, inbox);
  await wait(1600);
  const st = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  check("لم يُسجَّل الملف كمعالَج", st.processed.length === 0, `n=${st.processed.length}`);
  check("أعاد المحاولة فعلًا", m.hits.length >= 2, `hits=${m.hits.length}`);
  p.stop(); m.close();
  fs.rmSync(inbox, { recursive: true, force: true });
}

async function scenarioBadToken() {
  console.log("\n[4] توكن خاطئ ⇒ لا رفع");
  const inbox = fs.mkdtempSync(path.join(os.tmpdir(), "badtoken-"));
  const m = await startMock({});
  fs.writeFileSync(STATE_PATH, JSON.stringify({ processed: [] }, null, 2));
  fs.writeFileSync(path.join(inbox, "Scan.pdf"), PDF);
  const p = launch(m.port, inbox, { SCANNER_BRIDGE_TOKEN: "wrong-token-that-is-long-enough-1234" });
  await wait(1400);
  check("لم يُرفع أي ملف", m.hits.length === 0, `hits=${m.hits.length}`);
  check("أبلغ عن Unauthorized", /Unauthorized/.test(p.out));
  p.stop(); m.close();
  fs.rmSync(inbox, { recursive: true, force: true });
}

async function scenarioNoToken() {
  console.log("\n[5] غياب التوكن ⇒ الجسر لا يبدأ");
  const inbox = fs.mkdtempSync(path.join(os.tmpdir(), "notoken-"));
  const m = await startMock({});
  const child = spawn(process.execPath, [BRIDGE], {
    env: { ...process.env, SCAN_INBOX: inbox, VITE_SUPABASE_URL: `http://127.0.0.1:${m.port}`, VITE_SUPABASE_ANON_KEY: "k", SCANNER_BRIDGE_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let o = ""; child.stdout.on("data", (d) => { o += d; }); child.stderr.on("data", (d) => { o += d; });
  const code = await new Promise((r) => { child.on("exit", r); setTimeout(() => { child.kill(); r(null); }, 1500); });
  check("خرج بخطأ قبل المراقبة", code === 1, `exit=${code}`);
  check("ذكر المتغير الناقص", /SCANNER_BRIDGE_TOKEN/.test(o));
  m.close(); fs.rmSync(inbox, { recursive: true, force: true });
}

async function scenarioShortToken() {
  console.log("\n[6] توكن قصير ⇒ رفض");
  const inbox = fs.mkdtempSync(path.join(os.tmpdir(), "shorttok-"));
  const m = await startMock({});
  const child = spawn(process.execPath, [BRIDGE], {
    env: { ...process.env, SCAN_INBOX: inbox, VITE_SUPABASE_URL: `http://127.0.0.1:${m.port}`, VITE_SUPABASE_ANON_KEY: "k", SCANNER_BRIDGE_TOKEN: "tooshort" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let o = ""; child.stdout.on("data", (d) => { o += d; }); child.stderr.on("data", (d) => { o += d; });
  const code = await new Promise((r) => { child.on("exit", r); setTimeout(() => { child.kill(); r(null); }, 1500); });
  check("رفض التوكن القصير", code === 1 && /قصير جدًا/.test(o), `exit=${code}`);
  m.close(); fs.rmSync(inbox, { recursive: true, force: true });
}

(async () => {
  try {
    await scenarioLock();
    await scenarioSettle();
    await scenarioDbFail();
    await scenarioBadToken();
    await scenarioNoToken();
    await scenarioShortToken();
  } finally {
    // تنظيف نهائي: لا نترك state.json ولا instance.lock أبدًا.
    restoreState();
    restoreLock();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} نجحت`);
  if (failed.length) {
    console.log("فشل: " + failed.map((f) => f.name).join(" | "));
    process.exitCode = 1;
  }
})();
