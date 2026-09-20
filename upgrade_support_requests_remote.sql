-- ==============================================================================
-- ترقية جدول طلبات الدعم الفني لدعم الدعم عن بُعد عبر MeshCentral
-- ----------------------------------------------
-- يُبنى على الجدول الموجود في create_support_requests.sql (لا يحذف أي بيانات).
-- السكريبت آمن لإعادة التشغيل (idempotent) — نفّذه من Supabase -> SQL Editor.
--
-- يضيف:
--   * department_id      : رابط بالإدارة الحالية بدل العمود department_name النصي.
--   * mesh_device_id     : معرف الجهاز في MeshCentral.
--   * device_name        : اسم الجهاز (يظهر في لوحة الإدارة وMeshCentral).
--   * assigned_admin_*   : مسؤول الدعم الذي بدأ الجلسة.
--   * started_at/ended_at: أوقات بدء ونهاية جلسة الدعم.
--   * resolution_notes   : ملاحظات الحل.
--   * حالات جديدة: 'جاري الدعم' و'مغلقة' (مع الإبقاء على القيم القديمة المتوافقة).
-- ==============================================================================

-- 1. أعمدة جديدة (IF NOT EXISTS = بدون أثر على البيانات الموجودة)
ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES public.letter_departments(id);

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS mesh_device_id TEXT;

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS device_name VARCHAR(200);

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS assigned_admin_name VARCHAR(150);

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- 2. تحديث قيد حالات الطلب:
--    الحفاظ على الحالة القديمة 'جاري المعالجة' سارية (توجد بيانات بها),
--    وإضافة 'جاري الدعم' و'مغلقة' المطلوبتين.
ALTER TABLE public.support_requests DROP CONSTRAINT IF EXISTS support_requests_status_check;

ALTER TABLE public.support_requests
  ADD CONSTRAINT support_requests_status_check
  CHECK (status IN ('جديدة', 'جاري المعالجة', 'جاري الدعم', 'تم الحل', 'مغلقة'));

-- 3. فهارس للبحث السريع حسب الحالة والمسؤول
CREATE INDEX IF NOT EXISTS idx_support_requests_assigned_admin
  ON public.support_requests(assigned_admin_id, created_at DESC);

-- 4. الأمان: الاستمرار على نفس نمط باقي جداول النظام (RLS معطّل — الدخول مخصص للمشروع)
ALTER TABLE public.support_requests DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.support_requests TO anon, authenticated, postgres, service_role;

-- 5. التأكد من وجود الجدول في Realtime (للتحديث الفوري عند مسؤول الدعم والموظف)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.support_requests') IS NULL THEN
    RAISE NOTICE 'SKIP support_requests (table does not exist)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'support_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_requests;
    RAISE NOTICE 'ADDED support_requests TO supabase_realtime';
  ELSE
    RAISE NOTICE 'SKIP support_requests (already published)';
  END IF;
END
$$;

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';