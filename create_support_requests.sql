-- ==============================================================================
-- جدول طلبات الدعم الفني (زر 🛠️ الدعم الفني في شريط الأزرار العلوية)
-- نفّذ من Supabase Dashboard -> SQL Editor ثم اضغط Run.
-- السكريبت آمن لإعادة التشغيل (idempotent) — لا يحذف أي بيانات موجودة.
-- ==============================================================================

-- 1. جدول طلبات الدعم الفني
CREATE TABLE IF NOT EXISTS public.support_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  employee_name VARCHAR(150),
  department_name VARCHAR(150),
  description TEXT NOT NULL,
  screenshot_url TEXT,
  status VARCHAR(30) DEFAULT 'جديدة'
    CHECK (status IN ('جديدة', 'جاري المعالجة', 'تم الحل')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_support_requests_user_created
  ON public.support_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_requests_status
  ON public.support_requests(status);

-- 3. الأمان: نفس نمط بقية جداول النظام (RLS معطّل — الدخول مخصص للمشروع)
ALTER TABLE public.support_requests DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.support_requests TO anon, authenticated, postgres, service_role;

-- 4. إضافة الجدول إلى Realtime حتى يُحدَّث Badge وقائمة طلباتي السابقة فورًا
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