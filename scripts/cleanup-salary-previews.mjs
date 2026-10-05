/* ------------------------------------------------------------------
   حذف صور المعاينة المخزَّنة (مجلد previews) من بكتات أرشيف المفردات.

   الصور كانت نسخة مكرّرة من صفحات الـPDF وهي التي ملأت حصة التخزين.
   بعد حذفها يعرض النظام الصفحات بالرسم من الـPDF عند الطلب.

   التشغيل (عرض تقرير بدون حذف):
     node scripts/cleanup-salary-previews.mjs
   التنفيذ الفعلي:
     node scripts/cleanup-salary-previews.mjs --apply
   مع تفريغ أعمدة المعاينة في جداول الأرشيف:
     node scripts/cleanup-salary-previews.mjs --apply --clear-db
   شاملًا المعاينات التي لا يوجد لها PDF في نفس المجلد (الأيتام):
     node scripts/cleanup-salary-previews.mjs --apply --force

   يحتاج مفتاح service role لتجاوز RLS:
     $env:SUPABASE_SERVICE_ROLE_KEY = "..."
   (أو ضَعه في ملف .env بنفس الاسم)
------------------------------------------------------------------ */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const CLEAR_DB = process.argv.includes("--clear-db");
const FORCE = process.argv.includes("--force");
const PAGE_LIMIT = 1000;

const TARGETS = [
  { bucket: "faculty-salary-archive", table: "faculty_salary_archive" },
  { bucket: "employee-salary-archive", table: "employee_salary_archive" },
];

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

const fileEnv = readEnvFile();
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("ينقص: VITE_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isPreview = (name) => name.includes("/previews/");
const folderOf = (name) => name.slice(0, name.lastIndexOf("/"));

/* Storage list لا يدعم wildcards، فنمر على البكت على دفعات ونفلتر هنا */
async function listAll(bucket) {
  const objects = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list("", {
      limit: PAGE_LIMIT,
      offset,
    });
    if (error) throw new Error(`${bucket}: ${error.message}`);

    objects.push(...(data || []).filter((entry) => entry.id).map((entry) => entry.name));

    if (!data || data.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return objects;
}

async function removeInBatches(bucket, paths) {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 50) {
    const batch = paths.slice(i, i + 50);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) {
      console.error(`  فشل حذف الدفعة ${i / 50 + 1}: ${error.message}`);
      continue;
    }
    removed += batch.length;
    process.stdout.write(`\r  تم الحذف: ${removed}/${paths.length}`);
  }
  process.stdout.write("\n");
  return removed;
}

async function clearDbPreviews(table) {
  const { error } = await supabase
    .from(table)
    .update({ preview_url: null, preview_urls: [] })
    .not("preview_url", "is", null);

  if (error) {
    console.error(`  تعذر تفريغ أعمدة المعاينة في ${table}: ${error.message}`);
    return;
  }
  console.log(`  تم تفريغ preview_url / preview_urls في ${table}`);
}

const run = async () => {
  console.log(
    APPLY
      ? "وضع التنفيذ — سيتم الحذف فعليًا."
      : "وضع التقرير (لن يُحذف شيء). أضف --apply للتنفيذ."
  );

  for (const target of TARGETS) {
    console.log(`\n=== ${target.bucket} ===`);
    const objects = await listAll(target.bucket);

    const pdfFolders = new Set(
      objects.filter((name) => name.toLowerCase().endsWith(".pdf")).map(folderOf)
    );
    const previews = objects.filter(isPreview);
    const orphans = previews.filter((name) => !pdfFolders.has(folderOf(name)));
    const removable = FORCE ? previews : previews.filter((name) => !orphans.includes(name));

    console.log(`إجمالي كائنات البكت: ${objects.length}`);
    console.log(`صور المعاينة: ${previews.length} ملف`);
    if (orphans.length > 0) {
      console.log(
        `  منها ${orphans.length} بلا PDF أصلي في نفس المجلد — تُترك كما هي إلا مع --force.`
      );
    }

    if (removable.length === 0) {
      console.log("لا يوجد ما يُحذف.");
    } else if (APPLY) {
      await removeInBatches(target.bucket, removable);
    } else {
      console.log(`  سيُحذف: ${removable.length} ملف`);
    }

    if (APPLY && CLEAR_DB) {
      await clearDbPreviews(target.table);
    }
  }

  if (!APPLY) {
    console.log("\nلم يتم الحذف. أعد التشغيل مع --apply لتنفيذه.");
  } else {
    console.log("\nتم الانتهاء. تحقّق من المساحة من Storage → Usage في لوحة Supabase.");
  }
};

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
