-- =============================================================================
-- add_scanner_r2_columns.sql
--
-- لماذا هذا الملف منفصل عن add_r2_storage_columns.sql؟
--   الجسر الجديد (scanner-bridge) صار يرفع إلى Cloudflare R2 عبر دالة حافة
--   scanner-upload، فصار جدول scanner_inbox يحتاج:
--     1) storage_provider / storage_key  ← يعتمد على add_r2_storage_columns.sql
--        (نفس الأعمدة المستخدمة في باقي جداول المشروع)
--     2) source_fingerprint  ← عمود جديد خاص بالمسحوبات لمنع التكرار
--
--   أُفردت في ملف منفصل لأن (2) تغيير خاص بجدول واحد فقط، ولأن
--   add_r2_storage_columns.sql يُطبَّق على 12 جدولًا ويُنفَّذ قبل هذا الملف.
--
-- التشغيل: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- ⚠️ آمن تمامًا:
--   • كل العمليات ADD COLUMN IF NOT EXISTS — لا يُحذف شيء ولا يُعدَّل صف موجود
--   • الصفوف القديمة (file_url روابط http) تبقى كما هي وتُقرأ من Supabase
--   • unique index جزئي على العمود الجديد فقط، فالصفوف القديمة NULL لا تتأثر
--   • إعادة التشغيل آمنة (idempotent)
-- =============================================================================

-- 1) التأكد من وجود جدول scanner_inbox (لا ننشئه هنا — أنشأه create_scanner_inbox.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scanner_inbox'
  ) THEN
    RAISE EXCEPTION 'جدول public.scanner_inbox غير موجود — نفّذ create_scanner_inbox.sql أولًا.';
  END IF;
END $$;

-- 2) أعمدة مزوّد التخزين — مطابقة لما يضيفه add_r2_storage_columns.sql
--    (مكرّرة هنا بـ IF NOT EXISTS حتى يعمل هذا الملف وحده)
ALTER TABLE public.scanner_inbox
  ADD COLUMN IF NOT EXISTS storage_provider text;
ALTER TABLE public.scanner_inbox
  ADD COLUMN IF NOT EXISTS storage_key text;

-- الصفوف القديمة supabase دائمًا؛ لا نعتمد على NULL لأنه قد يعني "غير معروف"
UPDATE public.scanner_inbox
   SET storage_provider = 'supabase'
 WHERE storage_provider IS NULL;

-- قيد القيم المسموحة — فقط 'supabase' أو 'r2'
ALTER TABLE public.scanner_inbox
  DROP CONSTRAINT IF EXISTS chk_scanner_inbox_storage_provider;
ALTER TABLE public.scanner_inbox
  ADD CONSTRAINT chk_scanner_inbox_storage_provider
  CHECK (storage_provider IS NULL OR storage_provider IN ('supabase', 'r2'));

-- 3) بصمة الملف لمنع التكرار
--    دالة scanner-upload ترفع نفس البصمة مرة واحدة فقط، وتستخدمها في
--    object key الحتمي، فإعادة محاولة الجسر لا تنتج ملفًا مكررًا ولا صفًا مكررًا.
--    يُسمح بـ NULL حتى لا تتأثر الصفوف القديمة ولا تفشل بتفريدة NULL.
ALTER TABLE public.scanner_inbox
  ADD COLUMN IF NOT EXISTS source_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scanner_inbox_fingerprint
  ON public.scanner_inbox (source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

-- 4) فهرس مساعد للجرد: آخر المسحوبات لكل بكت منطقي
CREATE INDEX IF NOT EXISTS idx_scanner_inbox_storage_key
  ON public.scanner_inbox (storage_key)
  WHERE storage_key IS NOT NULL;

-- 5) تحقّق: يعرض ما تمّت إضافته
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'scanner_inbox'
   AND column_name IN ('storage_provider', 'storage_key', 'source_fingerprint')
 ORDER BY column_name;

-- تحديث كاش PostgREST حتى تعيد الواجهة تحميل المخطط
NOTIFY pgrst, 'reload schema';
