/* ------------------------------------------------------------------
   ضغط ملفات PDF الممسوحة ضوئيًا محليًا أو داخل بكتات Supabase Storage.

   المشكلة: أرشيف المفردات والأوامر التنفيذية يحتوي صورًا بدقة 300dpi
   بدل تدرّج رمادي بدقة 150dpi، وهذا ما ملأ حصة التخزين.
   الحل: إعادة ترميز الصور داخل كل PDF دون تغيير عدد الصفحات أو أبعاد
   العرض، مع ضغط بنية الملف.

   المرحلتان:
   1) Ghostscript : أخذ عيّنة للصور على DPI المطلوب (هو من يعرف مقاس
      العرض الفعلي داخل الصفحة) وتحويلها لتدرّج رمادي.
   2) sharp       : إعادة ترميز JPEG بجودة محددة (Ghostscript لا يوفّر
      تحكمًا في جودة JPEG).

   القياس على مسح ضوئي A4 بدقة 300dpi: 668KB -> 84KB عند 120dpi/جودة 45
   (-> 84-120KB بشكل عام، أي 5-8 أضعاف).

   ===== وضع التجربة المحلي (لا يحتاج Supabase) =====
     node scripts/compress-storage.mjs --local "C:\path\pdfs" --out "C:\path\out"

   ===== وضع Supabase =====
     npm run compress:storage                     تقرير بدون تعديل
     npm run compress:storage -- --apply          تنفيذ فعلي
     npm run compress:storage -- --apply --limit 20
     npm run compress:storage -- --apply --bucket executive-orders --dpi 120 --quality 45

   المتطلبات: مفتاح service role في $env:SUPABASE_SERVICE_ROLE_KEY أو .env،
   وGhostscript مثبت (يُبحث تلقائيًا)، وsharp وpdf-lib من dependencies.

   الأمان: الرفع يتم أولًا تحت مسار مؤقت، ثم التأكد من الحجم، ثم حذف
   الأصل، ثم نقل المؤقت إلى مكانه. السجل المحلي يجعل السكربت قابلًا
   للاستئناف بعد أي انقطاع.
------------------------------------------------------------------ */
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { execFile } from "child_process";
import { createRequire } from "module";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const APPLY = has("--apply");
const LOCAL_DIR = argValue("--local", "");
const OUT_DIR = argValue("--out", "");
const QUALITY = Number(argValue("--quality", 50));
const TARGET_DPI = Number(argValue("--dpi", 150));
const MIN_KB = Number(argValue("--min-kb", 60));
const LIMIT = Number(argValue("--limit", 0));
const CONCURRENCY = Number(argValue("--concurrency", 2));
const BUCKET_FILTER = argValue("--bucket", "");
const PREFIX_FILTER = argValue("--prefix", "");
const SKIP_SMALL = !has("--all");

const PAGE_LIMIT = 1000;
const STAGE_DIR = "__compress_tmp__";
const DEFAULTS = [
  "faculty-salary-archive",
  "employee-salary-archive",
  "executive-orders",
  "issues-files",
  "case-pdfs",
  "faculty-salaries",
];

const reportPath = path.resolve(process.cwd(), `.storage-compress-report-${new Date().toISOString().slice(0, 10)}.json`);
const donePath = path.resolve(process.cwd(), ".storage-compress-done.json");
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "storage-compress-"));

const kb = (bytes) => Math.round(bytes / 1024);
const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

let report = [];
const saveReport = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

/* --------------------------Ghostscript-------------------------- */
function findGhostscript() {
  if (process.env.GS_PATH && fs.existsSync(process.env.GS_PATH)) return process.env.GS_PATH;

  const roots = [
    "C:\\Program Files\\gs",
    "C:\\Program Files (x86)\\gs",
    path.join(os.homedir(), "AppData", "Local", "Programs", "gs"),
  ];
  const candidates = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      candidates.push(
        path.join(root, dir, "bin", "gswin64c.exe"),
        path.join(root, dir, "bin", "gswin32c.exe")
      );
    }
  }
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const GS = findGhostscript();
if (!GS) {
  console.error("لم يُعثر على Ghostscript. ثبّته أو حدّد المسار في GS_PATH.");
  process.exit(1);
}

const sharp = require("sharp");
const { PDFName, PDFDict, PDFNumber, PDFRawStream, PDFDocument } = require("pdf-lib");

/* ----------------------المرحلة 1: Ghostscript---------------------- */
async function runGhostscript(input, output) {
  const gsArgs = [
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.7",
    "-dPDFSETTINGS=/prepress",
    "-dGrayDevice",
    "-dDownsampleColorImages=true",
    "-dDownsampleGrayImages=true",
    `-dColorImageResolution=${TARGET_DPI}`,
    `-dGrayImageResolution=${TARGET_DPI}`,
    "-dMonoImageResolution=300",
    "-dDetectDuplicateImages=true",
    "-dCompressFonts=true",
    "-dSubsetFonts=true",
    `-sOutputFile=${output}`,
    input,
  ];
  await execFileAsync(GS, gsArgs, { maxBuffer: 1024 * 1024 * 8, windowsHide: true });
  if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
    throw new Error("Ghostscript لم يُنتج ملفًا صالحًا");
  }
  return fs.statSync(output).size;
}

/* --------------المرحلة 2: إعادة ترميز الصور بـ sharp-------------- */
function inflateExact(bytes, expected) {
  try {
    const out = zlib.inflateSync(bytes);
    return out.length === expected ? out : null;
  } catch {
    return null;
  }
}

/* يستبدل محتوى صور PDF داخل الملف بمصفوفة JPEG أصغر، دون إضافة كائنات
   جديدة (وإلا تضخّم الملف) ودون تغيير أبعاد العرض في الصفحة. */
async function reencodeImages(input, output) {
  const doc = await PDFDocument.load(fs.readFileSync(input), { updateMetadata: false });
  const ctx = doc.context;
  let replaced = 0;
  let skipped = 0;

  for (const page of doc.getPages()) {
    let res = null;
    try {
      res = page.node.Resources();
    } catch {
      res = null;
    }
    if (!res) continue;

    const xobjDict = res.lookup(PDFName.of("XObject"), PDFDict);
    if (!xobjDict) continue;

    for (const [key, ref] of xobjDict.entries()) {
      const stream = ctx.lookup(ref);
      if (!stream || !stream.dict) { skipped += 1; continue; }
      if (String(stream.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
      if (stream.dict.get(PDFName.of("ImageMask"))) { skipped += 1; continue; }

      const w = Number(stream.dict.get(PDFName.of("Width")) || 0);
      const h = Number(stream.dict.get(PDFName.of("Height")) || 0);
      if (!w || !h) { skipped += 1; continue; }

      const filter = String(stream.dict.get(PDFName.of("Filter")) || "");
      const colorSpace = String(stream.dict.get(PDFName.of("ColorSpace")) || "");
      const raw = Buffer.from(stream.getContents());

      let source = null;
      let pipeline = null;

      if (filter === "/DCTDecode") {
        source = raw;
      } else if (filter === "/FlateDecode" || filter === "") {
        const channels = colorSpace.includes("DeviceRGB") ? 3 : 1;
        const plain = inflateExact(raw, w * h * channels);
        if (!plain) { skipped += 1; continue; }
        source = plain;
        pipeline = sharp(source, { raw: { width: w, height: h, channels } });
      }

      if (!source) { skipped += 1; continue; }
      if (!pipeline) pipeline = sharp(source, { failOn: "none" });

      try {
        const buf = await pipeline.greyscale().jpeg({ quality: QUALITY, mozjpeg: false }).toBuffer();
        if (buf.length >= raw.length) { skipped += 1; continue; }

        const meta = await sharp(buf).metadata();
        const dict = stream.dict;
        dict.set(PDFName.of("Width"), PDFNumber.of(meta.width));
        dict.set(PDFName.of("Height"), PDFNumber.of(meta.height));
        /* ملاحظة: تُمرَّر الأسماء بلا "/" — تمريرها بالشرطة يجعل pdf-lib
           يكتبها مشفّرة (#2F) فيصبح اسمًا غير صالح ولا يعرضه أي قارئ. */
        dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
        dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
        dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
        dict.delete(PDFName.of("DecodeParms"));
        dict.delete(PDFName.of("SMask"));
        ctx.assign(ref, PDFRawStream.of(dict, new Uint8Array(buf)));
        replaced += 1;
      } catch {
        skipped += 1;
      }
    }
  }

  fs.writeFileSync(output, await doc.save({ useObjectStreams: true }));
  return { replaced, skipped };
}

/* -------------------------المهمة الأساسية------------------------- */
async function compressFile(srcPath, outPath) {
  const viaGs = `${srcPath}.gs.pdf`;
  const final = `${srcPath}.final.pdf`;
  const before = fs.statSync(srcPath).size;

  try {
    const gsSize = await runGhostscript(srcPath, viaGs);
    let candidate = viaGs;
    let method = "ghostscript";

    if (gsSize < before) {
      try {
        const { replaced } = await reencodeImages(viaGs, final);
        if (replaced > 0 && fs.statSync(final).size < gsSize) {
          candidate = final;
          method = `ghostscript+sharp (${replaced} صورة)`;
        }
      } catch {
        /* نكتفي بنتيجة Ghostscript */
      }
    }

    const after = fs.statSync(candidate).size;
    if (after >= before) {
      return { before, after, saved: 0, ratio: 1, method, useful: false, buffer: null };
    }

    const buffer = fs.readFileSync(candidate);
    if (outPath) fs.writeFileSync(outPath, buffer);

    return {
      before,
      after,
      saved: before - after,
      ratio: Number((before / after).toFixed(2)),
      method,
      useful: true,
      buffer,
    };
  } finally {
    for (const f of [viaGs, final]) {
      if (fs.existsSync(f)) fs.rmSync(f, { force: true });
    }
  }
}

/* ======================= الوضع المحلي ======================= */
async function runLocal() {
  const inputDir = path.resolve(LOCAL_DIR);
  const outputDir = OUT_DIR ? path.resolve(OUT_DIR) : path.join(inputDir, "compressed");
  fs.mkdirSync(outputDir, { recursive: true });

  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.toLowerCase().endsWith(".pdf") ? [full] : [];
    });

  let files = walk(inputDir).map((f) => ({ path: f, size: fs.statSync(f).size }));
  if (SKIP_SMALL) files = files.filter((f) => f.size >= MIN_KB * 1024);
  if (LIMIT) files = files.slice(0, LIMIT);

  console.log(`Ghostscript: ${GS}`);
  console.log(`وضع محلي: ${files.length} ملف من ${inputDir}`);
  console.log(`الإعدادات: ${TARGET_DPI}dpi، جودة ${QUALITY}، تخطي أقل من ${MIN_KB}KB`);
  console.log(`المخرجات: ${outputDir}\n`);

  for (const [i, file] of files.entries()) {
    const outPath = path.join(outputDir, path.basename(file.path));
    try {
      const res = await compressFile(file.path, outPath);
      report.push({ name: file.path, ...res });
      console.log(
        `[${i + 1}/${files.length}] ${kb(file.size)}KB -> ${kb(res.after)}KB ` +
          `(${res.ratio}:1) ${res.useful ? "✓" : "— بلا فائدة"}  ${path.basename(file.path)}`
      );
    } catch (err) {
      report.push({ name: file.path, error: err.message });
      console.log(`[${i + 1}/${files.length}] خطأ: ${err.message}  ${path.basename(file.path)}`);
    }
  }

  const useful = report.filter((r) => r.useful);
  const totalBefore = useful.reduce((s, r) => s + r.before, 0);
  const totalAfter = useful.reduce((s, r) => s + r.after, 0);
  console.log(
    `\nالنتيجة: ${useful.length}/${report.length} ملف — ` +
      `${mb(totalBefore)}MB -> ${mb(totalAfter)}MB (توفير ${mb(totalBefore - totalAfter)}MB، ` +
      `${totalAfter ? (totalBefore / totalAfter).toFixed(2) : 0}:1)`
  );
  console.log(`التقرير: ${reportPath}`);
  fs.rmSync(workDir, { recursive: true, force: true });
}

/* ======================= وضع Supabase ======================= */
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
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
        })
    );
  } catch {
    return {};
  }
}

let supabase = null;

async function initSupabase() {
  const fileEnv = readEnvFile();
  const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("ينقص: VITE_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const done = fs.existsSync(donePath) ? JSON.parse(fs.readFileSync(donePath, "utf8")) : {};
let pendingWrites = 0;
const flushDone = () => {
  if (pendingWrites > 0) {
    fs.writeFileSync(donePath, JSON.stringify(done));
    pendingWrites = 0;
  }
};
/* الكتابة على القرص كل ملف تبطّئ السكربت على 18 ألف ملف، فتجميعها */
const isDone = (bucket, key) => Boolean(done[`${bucket}/${key}`]);
const markDone = (bucket, key, info) => {
  done[`${bucket}/${key}`] = info;
  pendingWrites += 1;
  if (pendingWrites >= 50) flushDone();
};

async function listBucket(bucket) {
  const objects = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list("", { limit: PAGE_LIMIT, offset });
    if (error) throw new Error(`${bucket}: ${error.message}`);
    objects.push(
      ...(data || []).filter((o) => o.id).map((o) => ({ name: o.name, size: Number(o.metadata?.size || 0) }))
    );
    if (!data || data.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }
  return objects;
}

async function downloadTo(bucket, key, dest) {
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error) throw error;
  if (!data || data.size === 0) throw new Error("الملف فارغ أو غير موجود");
  fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
  return fs.statSync(dest).size;
}

async function processObject(bucket, object) {
  const key = object.name;
  const base = path.join(workDir, "f");
  const entry = { bucket, key, applied: false };

  try {
    const before = await downloadTo(bucket, key, `${base}.pdf`);
    const res = await compressFile(`${base}.pdf`, null);

    Object.assign(entry, {
      before,
      after: res.after,
      saved: res.saved,
      ratio: res.ratio,
      method: res.method,
    });

    if (!res.useful) {
      entry.skipped = "الضغط لم يحسّن الحجم";
      markDone(bucket, key, { after: res.after, skipped: entry.skipped });
      report.push(entry);
      return entry;
    }

    if (APPLY) {
      const staged = `${STAGE_DIR}/${key}`;
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(staged, res.buffer, { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error(`رفع الملف المؤقت فشل: ${upErr.message}`);

      const { error: delErr } = await supabase.storage.from(bucket).remove([key]);
      if (delErr) throw new Error(`حذف الأصل فشل: ${delErr.message} — النسخة في ${workDir}`);

      let { error: mvErr } = await supabase.storage.from(bucket).move(staged, key);
      if (mvErr) {
        ({ error: mvErr } = await supabase.storage.from(bucket).move(staged, key));
        if (mvErr) throw new Error(`نقل الملف المؤقت فشل: ${mvErr.message} — الملف في ${workDir}`);
      }

      entry.applied = true;
      markDone(bucket, key, { after: res.after, method: res.method });
    } else {
      markDone(bucket, key, { after: res.after, method: res.method, preview: true });
    }

    report.push(entry);
    return entry;
  } catch (err) {
    report.push({ ...entry, error: err.message });
    return { ...entry, error: err.message };
  } finally {
    for (const suffix of [".pdf", ".gs.pdf", ".final.pdf"]) {
      const f = `${base}${suffix}`;
      if (fs.existsSync(f)) fs.rmSync(f, { force: true });
    }
  }
}

async function pool(items, worker, size) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(size, queue.length)) }, async () => {
      for (;;) {
        const item = queue.shift();
        if (!item) return;
        await worker(item);
        const savedMb = report.reduce((sum, r) => sum + (r.saved || 0), 0) / (1024 * 1024);
        process.stdout.write(`\r  ${report.length}/${items.length} — توفير ${savedMb.toFixed(1)}MB   `);
      }
    })
  );
  process.stdout.write("\n");
}

async function runSupabase() {
  await initSupabase();

  console.log(
    APPLY
      ? `وضع التنفيذ — ${TARGET_DPI}dpi جودة ${QUALITY}${SKIP_SMALL ? ` (تخطي أقل من ${MIN_KB}KB)` : ""}`
      : "وضع التقرير (لن يُعدَّل شيء). أضف --apply للتنفيذ."
  );
  console.log(`Ghostscript: ${GS}\n`);

  for (const bucket of BUCKET_FILTER ? [BUCKET_FILTER] : DEFAULTS) {
    let objects;
    try {
      objects = await listBucket(bucket);
    } catch (err) {
      console.log(`=== ${bucket} ===\n  غير متاح: ${err.message}`);
      continue;
    }

    let targets = objects.filter((o) => o.name.toLowerCase().endsWith(".pdf"));
    if (PREFIX_FILTER) targets = targets.filter((o) => o.name.startsWith(PREFIX_FILTER));
    if (SKIP_SMALL) targets = targets.filter((o) => o.size >= MIN_KB * 1024);
    targets = targets.filter((o) => !isDone(bucket, o.name));
    if (LIMIT) targets = targets.slice(0, LIMIT);

    const bucketMb = objects.reduce((sum, o) => sum + o.size, 0);
    console.log(`=== ${bucket} ===`);
    console.log(`كائنات: ${objects.length} (${mb(bucketMb)}MB) — مرشحة: ${targets.length}`);
    if (targets.length === 0) continue;

    const beforeCount = report.length;
    await pool(
      targets,
      async (o) => {
        const res = await processObject(bucket, o);
        if (res.error) console.log(`\n  خطأ في ${o.name}: ${res.error}`);
      },
      CONCURRENCY
    );

    const slice = report.slice(beforeCount);
    console.log(
      `  ${slice.filter((r) => r.applied).length} مُطبَّق، ` +
        `${slice.filter((r) => r.skipped).length} بلا فائدة، ` +
        `${slice.filter((r) => r.error).length} خطأ — توفير ${mb(slice.reduce((s, r) => s + (r.saved || 0), 0))}MB`
    );
  }

  saveReport();
  flushDone();

  const totalSaved = report.reduce((sum, r) => sum + (r.saved || 0), 0);
  console.log(`\nالإجمالي: ${report.length} ملف، توفير ${mb(totalSaved)}MB`);
  console.log(`التقرير: ${reportPath}`);
  console.log(
    APPLY
      ? "\nراجع Storage → Usage في لوحة Supabase. لإعادة استئناف المتبقي شغّل نفس الأمر (يتخطى المُعالَج)."
      : "\nلم يُعدَّل شيء. أعد التشغيل مع --apply. في وضع التقرير تُحسب الملفات كمعالَجة لتفادي تكرار الجرد."
  );
  fs.rmSync(workDir, { recursive: true, force: true });
}

const run = async () => {
  if (LOCAL_DIR) await runLocal();
  else await runSupabase();
};

run().catch((err) => {
  console.error(err.message || err);
  fs.rmSync(workDir, { recursive: true, force: true });
  process.exit(1);
});
