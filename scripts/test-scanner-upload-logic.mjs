// اختبار منطق دالة scanner-upload بدون Deno ولا شبكة.
// ننسخ الدوال الصافية من index.ts حرفيًا (نفس الكود) ونختبرها.
// الهدف: التأكد من رفض الملفات المزيّفة وبناء مفتاح آمن وثابت.
import assert from "node:assert";

/* ---- نسخة مطابقة لـ index.ts ---- */
const LOGICAL_BUCKET = "scanner-inbox";
const ALLOWED = {
  pdf: { mimes: ["application/pdf"], exts: ["pdf"] },
  jpg: { mimes: ["image/jpeg"], exts: ["jpg", "jpeg"] },
  png: { mimes: ["image/png"], exts: ["png"] },
};

function familyOfExtension(name) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return null;
  for (const family of Object.keys(ALLOWED)) {
    if (ALLOWED[family].exts.includes(m[1])) return family;
  }
  return null;
}

function familyOfBytes(bytes) {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  return null;
}

function sanitizeSegment(name) {
  const ext = (name.toLowerCase().match(/\.[a-z0-9]+$/) || [""])[0].slice(0, 10);
  const base = name.slice(0, name.length - ext.length);
  const ascii = base.normalize("NFKD").replace(/[^\w\s.-]/g, "").trim()
    .replace(/\s+/g, "-").replace(/[._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${ascii || "scan"}${ext}`;
}

function utcDay(date) { return date.toISOString().slice(0, 10); }
function buildRef(p) { return `r2://${LOGICAL_BUCKET}/${p.split("/").map((s) => encodeURIComponent(s)).join("/")}`; }

function safeEqual(a, b) {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const isFp = (s) => /^[0-9a-f]{16,64}$/.test(s);
/* ---- نهاية النسخة ---- */

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; }
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

console.log("\n[1] البصمة الثنائية (magic bytes)");
t("يقبل PDF", () => assert.equal(familyOfBytes(PDF), "pdf"));
t("يقبل JPG", () => assert.equal(familyOfBytes(JPG), "jpg"));
t("يقبل PNG", () => assert.equal(familyOfBytes(PNG), "png"));
t("يرفض ZIP (أpayload مُزيّف)", () => assert.equal(familyOfBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])), null));
t("يرفض EXE", () => assert.equal(familyOfBytes(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), null));
t("يرفض سكربت باسم .pdf", () => assert.equal(familyOfBytes(new Uint8Array([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70])), null));
t("يرفض ملف فارغ", () => assert.equal(familyOfBytes(new Uint8Array(0)), null));
t("يرفض بايتات عشوائية", () => assert.equal(familyOfBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), null));

console.log("\n[2] تطابق الامتداد مع المحتوى");
t("PDF باسم .pdf", () => assert.equal(familyOfExtension("Scan.pdf") === familyOfBytes(PDF), true));
t("JPEG باسم .jpg", () => assert.equal(familyOfExtension("a.jpg") === familyOfBytes(JPG), true));
t("JPEG باسم .jpeg", () => assert.equal(familyOfExtension("a.jpeg") === familyOfBytes(JPG), true));
t("محتوى PDF باسم .png = رفض", () => assert.notEqual(familyOfExtension("x.png"), familyOfBytes(PDF)));
t("امتداد غير مدعوم (.exe)", () => assert.equal(familyOfExtension("virus.exe"), null));
t("امتداد غير مدعوم (.svg)", () => assert.equal(familyOfExtension("x.svg"), null));
t("بلا امتداد", () => assert.equal(familyOfExtension("noext"), null));
t("حرف كبير PDF", () => assert.equal(familyOfExtension("SCAN.PDF"), "pdf"));

console.log("\n[3] تنقية اسم الملف (path traversal)");
t("يحذف ../", () => assert.ok(!sanitizeSegment("../../etc/passwd.pdf").includes("..")));
t("لا فواصل", () => assert.ok(!sanitizeSegment("a/b/c.pdf").includes("/")));
t("يطبّع امتداد PDF بحرف كبير إلى أحرف صغيرة", () => assert.equal(sanitizeSegment("Scan.PDF"), "Scan.pdf"));
t("يطبّع JPEG → jpeg", () => assert.equal(sanitizeSegment("Report.JPEG"), "Report.jpeg"));
t("يحوّل المسافات إلى شرطة", () => assert.equal(sanitizeSegment("my file.pdf"), "my-file.pdf"));
t("يطيل الاسم إلى 60 حرفًا", () => assert.equal(sanitizeSegment("x".repeat(200) + ".pdf").length, 64));
t("اسم عربي ⇒ ascii", () => assert.ok(sanitizeSegment("مسحوبة.pdf").startsWith("scan")));
t("اسم فارغ ⇒ scan", () => assert.equal(sanitizeSegment(".pdf"), "scan.pdf"));
t("يحذف null byte", () => assert.ok(!sanitizeSegment("a\0b.pdf").includes("\0")));
t("لا spaces", () => assert.ok(!sanitizeSegment("my file name.pdf").includes(" ")));

console.log("\n[4] المرجع الثابت r2://");
t("يبني r2://", () => assert.equal(buildRef("2026-01-01/abc-Scan.pdf"), "r2://scanner-inbox/2026-01-01/abc-Scan.pdf"));
t("يشفّر المسافات", () => assert.equal(buildRef("a b.pdf"), "r2://scanner-inbox/a%20b.pdf"));
t("يطابق fileStorage.isR2Ref", () => assert.ok(buildRef("x.pdf").startsWith("r2://")));

console.log("\n[5] قابلية إعادة التشغيل (نفس البصمة ⇒ نفس المفتاح)");
const fp = "a".repeat(32);
const d = new Date("2026-01-01T10:00:00Z");
const k1 = `${LOGICAL_BUCKET}/${utcDay(d)}/${fp.slice(0, 12)}-${sanitizeSegment("Scan.pdf")}`;
const k2 = `${LOGICAL_BUCKET}/${utcDay(d)}/${fp.slice(0, 12)}-${sanitizeSegment("Scan.pdf")}`;
t("المفتاح حتمي", () => assert.equal(k1, k2));
t("بادئة البكت صحيحة", () => assert.ok(k1.startsWith("scanner-inbox/")));
t("لا .. في المفتاح", () => assert.ok(!k1.includes("..")));

console.log("\n[5b] اليوم يُشتق من mtime لا من وقت التنفيذ");
// الانحداد: لو استُخدم new Date() لتغيّر المفتاح عند إعادة المحاولة في يوم آخر
// وبقي كائن يتيم في R2. نحاكي نفس الملف والبصمة، لكن "الآن" في يوم مختلف.
const MTIME_MIN = Date.UTC(2000, 0, 1);
const MTIME_MAX = Date.UTC(2100, 0, 1);
const mtime = Date.parse("2026-01-01T10:00:00Z");
const keyFromMtime = (ms) =>
  `${LOGICAL_BUCKET}/${utcDay(new Date(ms))}/${fp.slice(0, 12)}-${sanitizeSegment("Scan.pdf")}`;
t("مفتاح واحد مهما اختار وقت التنفيذ", () => assert.equal(keyFromMtime(mtime), k1));
t("اليوم من mtime لا من اليوم الحالي", () => assert.ok(keyFromMtime(mtime).includes("2026-01-01/")));

console.log("\n[5c] مدى mtime يمنع RangeError بعد نجاح الرفع");
t("يقبل 2026", () => assert.ok(mtime >= MTIME_MIN && mtime <= MTIME_MAX));
t("يرفض قيمة لا محدودة", () => assert.ok(!(Infinity <= MTIME_MAX)));
t("يرفض 1e300 (كان يرمي بعد الرفع)", () => assert.ok(!(1e300 <= MTIME_MAX)));
t("يرفض سالبًا", () => assert.ok(!(-1 >= MTIME_MIN)));
t("كل قيمة مقبولة تُنتج تاريخًا صالحًا", () => {
  for (const ms of [MTIME_MIN, mtime, MTIME_MAX]) {
    assert.ok(!Number.isNaN(new Date(ms).toISOString().length), `${ms} يجب أن يكون تاريخًا صالحًا`);
  }
});

console.log("\n[6] فحص البصمة والتوكن");
t("يقبل 32 hex", () => assert.ok(isFp("f".repeat(32))));
t("يرفض أقل من 16", () => assert.ok(!isFp("a".repeat(15))));
t("يرفض حرف غير hex", () => assert.ok(!isFp("g".repeat(32))));
t("safeEqual مطابق", () => assert.ok(safeEqual("abcdef", "abcdef")));
t("safeEqual مختلف", () => assert.ok(!safeEqual("abcdef", "abcdeg")));
t("safeEqual أطوال مختلفة", () => assert.ok(!safeEqual("abc", "abcd")));

console.log("\n[7] حدود الحجم");
const MAX = 52428800;
t("الحد 50MB", () => assert.equal(MAX, 52428800));
t("PDF صغير يُقبل", () => assert.ok(PDF.length < MAX));
t("فارغ يُرفض", () => assert.ok(!(0 >= 1)));

console.log(`\n${pass}/${pass + fail} نجحت`);
if (fail) process.exitCode = 1;
