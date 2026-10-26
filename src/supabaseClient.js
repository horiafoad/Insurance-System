import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// إعدادات المشروع العامة (Supabase)
// ---------------------------------------------------------------------------
// الرابط ومفتاح anon عامّان بطبيعتهما، ويُضمَّنان داخل حزمة التطبيق في كل
// الأحوال (المتصفح / PWA / Android / Electron). وضعهما هنا كقيمة افتراضية
// يضمن أن تعمل النسخة المنشورة حتى لو لم تُضبط متغيرات البيئة وقت البناء.
//
// يمكن تجاوز هذه القيم عبر متغيرات البيئة:
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
// ---------------------------------------------------------------------------
const FALLBACK_SUPABASE_URL = "https://epfppicdvkklzryworzu.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZnBwaWNkdmtrbHpyeXdvcnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2OTI2MTUsImV4cCI6MjEwNjI2ODYxNX0.7o8lK_j2Wxw-mfbDPw4EHu5Wir9IuWQUqHNIZJzs4DA";

// مشاريع Supabase المتوقفة/المحذوفة. أي إعداد بناء يشير إليها يُتجاهل
// تلقائيًا ويُستخدم المشروع الحالي، لأنها تُرجع 402 Payment Required
// وتسبب فشل تسجيل الدخول: "تعذر الاتصال بخدمة تسجيل الدخول".
const RETIRED_PROJECT_REFS = ["jpybzalxcezxhokzmwdx", "lchjchemghjddthwiwcu"];

const readEnv = (value) => (typeof value === "string" ? value.trim() : "");

const envUrl = readEnv(import.meta.env.VITE_SUPABASE_URL);
const envKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

const pointsToRetiredProject =
  !!envUrl && RETIRED_PROJECT_REFS.some((ref) => envUrl.includes(ref));

if (pointsToRetiredProject && typeof console !== "undefined") {
  console.warn(
    "[supabase] تم تجاهل إعداد البناء لأنه يشير إلى مشروع قديم متوقف، " +
      "وسيتم استخدام المشروع الحالي: " +
      FALLBACK_SUPABASE_URL
  );
}

const useFallback = !envUrl || pointsToRetiredProject;

export const SUPABASE_URL = useFallback ? FALLBACK_SUPABASE_URL : envUrl;

export const supabase = createClient(
  SUPABASE_URL,
  useFallback ? FALLBACK_SUPABASE_ANON_KEY : envKey || FALLBACK_SUPABASE_ANON_KEY
);
