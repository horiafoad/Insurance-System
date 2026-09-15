-- ==============================================================================
-- سكريبت إضافة القطاعات (الكليات) وربط الإدارات بها
-- انسخ هذا الكود بالكامل والصقه في Supabase -> SQL Editor ثم اضغط Run
-- السكريبت آمن لإعادة التشغيل (idempotent) — لا يحذف أي بيانات موجودة.
-- ==============================================================================

-- 1. جدول القطاعات (الكليات)
CREATE TABLE IF NOT EXISTS public.letter_sectors (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. ربط كل إدارة بقطاعها (عمود جديد في جدول الإدارات)
ALTER TABLE public.letter_departments
  ADD COLUMN IF NOT EXISTS sector_id BIGINT REFERENCES public.letter_sectors(id);

-- فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_letter_departments_sector_id
  ON public.letter_departments(sector_id);

-- تعطيل RLS (نفس نمط بقية جداول النظام)
ALTER TABLE public.letter_sectors DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.letter_sectors TO anon, authenticated, postgres, service_role;
GRANT ALL ON SEQUENCE public.letter_sectors_id_seq TO anon, authenticated, postgres, service_role;

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- بعد تشغيل الجزء الأول، قم بإضافة القطاعات الخمسة (عدّل الأسماء بنفسك):
--   INSERT INTO public.letter_sectors (name) VALUES
--     ('اسم القطاع/الكلية الأول'),
--     ('اسم القطاع/الكلية الثاني'),
--     ('اسم القطاع/الكلية الثالث'),
--     ('اسم القطاع/الكلية الرابع'),
--     ('اسم القطاع/الكلية الخامس');

-- وتوزيع الإدارات تحت كل قطاع (استبدل الأسماء بإداراتك الفعلية):
--   UPDATE public.letter_departments
--   SET sector_id = (SELECT id FROM public.letter_sectors WHERE name = 'اسم القطاع الأول')
--   WHERE name IN ('الإدارة الأولى', 'الإدارة الثانية', 'الإدارة الثالثة');
--
--   UPDATE public.letter_departments
--   SET sector_id = (SELECT id FROM public.letter_sectors WHERE name = 'اسم القطاع الثاني')
--   WHERE name IN ('إدارة كذا', 'إدارة كذا');
-- ==============================================================================