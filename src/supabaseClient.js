import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// إعدادات المشروع العامة (Supabase)
// ---------------------------------------------------------------------------
// الرابط ومفتاح anon عامّان بطبيعتهما، ويُضمَّنان داخل حزمة التطبيق في كل
// الأحوال (المتصفح / PWA / Android / Electron). وضعهما هنا كقيمة افتراضية
// يضمن أن تعمل النسخة المنشورة حتى لو لم تُضبط متغيرات البيئة وقت البناء
// (كما كان يحدث في نشر GitHub Pages / Cloudflare Pages).
//
// يمكن دائمًا تجاوز هذه القيم عبر متغيرات البيئة:
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
// ---------------------------------------------------------------------------
const FALLBACK_SUPABASE_URL = "https://epfppicdvkklzryworzu.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZnBwaWNkdmtrbHpyeXdvcnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2OTI2MTUsImV4cCI6MjEwNjI2ODYxNX0.7o8lK_j2Wxw-mfbDPw4EHu5Wir9IuWQUqHNIZJzs4DA";

const readEnv = (value) => (typeof value === "string" ? value.trim() : "");

const supabaseUrl =
  readEnv(import.meta.env.VITE_SUPABASE_URL) || FALLBACK_SUPABASE_URL;

const supabasePublishableKey =
  readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  FALLBACK_SUPABASE_ANON_KEY;

export const SUPABASE_URL = supabaseUrl;

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);
