-- ==============================================================================
-- سكريبت الهيكل التنظيمي: القطاعات الخمسة الثابتة + ربط الموظفين بالقطاع/الإدارة
-- انسخ هذا الكود بالكامل والصقه في Supabase -> SQL Editor ثم اضغط Run
-- السكريبت آمن لإعادة التشغيل (idempotent) — لا يحذف أي بيانات موجودة.
-- ==============================================================================

-- 1. ترتيب عرض القطاعات (عمود جديد لا يُمسّ أسماء القطاعات الموجودة)
ALTER TABLE public.letter_sectors
  ADD COLUMN IF NOT EXISTS sort_order SMALLINT DEFAULT 0;

-- 2. القطاعات الخمسة الثابتة فقط (بترتيبها المطلوب كما طلبت)
INSERT INTO public.letter_sectors (name, sort_order, is_active) VALUES
  ('عميد الكلية', 1, TRUE),
  ('قطاع أمين الكلية', 2, TRUE),
  ('قطاع خدمة المجتمع وشؤون البيئة', 3, TRUE),
  ('قطاع شؤون التعليم والطلاب', 4, TRUE),
  ('قطاع شؤون الدراسات العليا', 5, TRUE)
ON CONFLICT (name) DO UPDATE
  SET sort_order = EXCLUDED.sort_order,
      is_active = TRUE;

-- 3. ربط الموظف (مستخدم النظام) بقطاعه وإدارته
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS sector_id BIGINT REFERENCES public.letter_sectors(id);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES public.letter_departments(id);

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_users_sector_id ON public.users(sector_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON public.users(department_id);

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';