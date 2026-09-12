-- =============================================================================
-- نظام قوالب الخطابات + الترقيم التلقائي المتسلسل
-- آمن وقابل لإعادة التشغيل (Idempotent) - لا يحذف أي بيانات موجودة
-- شغّله مرة واحدة في Supabase SQL Editor
-- =============================================================================

-- 1) جدول القوالب (Template): النص الثابت + الحقول المتغيرة + التصنيف
CREATE TABLE IF NOT EXISTS public.letter_templates (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  letter_type VARCHAR(100) NOT NULL DEFAULT '',
  department_name VARCHAR(150) NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  fixed_text TEXT NOT NULL DEFAULT '',
  variable_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_route JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2) جدول العدّاد: صف وحيد (id = 1) يضمن الترقيم المتسلسل الفريد
CREATE TABLE IF NOT EXISTS public.letter_number_counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_number BIGINT NOT NULL DEFAULT 0
);

INSERT INTO public.letter_number_counter (id, last_number)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- 3) زرع العدّاد من أعلى رقم موجود في الخطابات الحالية (من دون حذف أي شيء)
WITH existing AS (
  SELECT MAX((regexp_match(letter_number, '([0-9]+)'))[1]::BIGINT) AS max_num
  FROM public.letters
  WHERE letter_number ~ '[0-9]'
)
UPDATE public.letter_number_counter c
SET last_number = COALESCE((SELECT max_num FROM existing), 0)
WHERE c.id = 1
  AND last_number < COALESCE((SELECT max_num FROM existing), 0);

-- 4) دالة إرجاع الرقم التالي: تستدعى وقت الحفظ لضمان عدم التكرار حتى بعد الحذف
CREATE OR REPLACE FUNCTION public.get_next_letter_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  next_num BIGINT;
  next_code TEXT;
BEGIN
  UPDATE public.letter_number_counter
     SET last_number = last_number + 1
   WHERE id = 1
   RETURNING last_number INTO next_num;

  IF next_num IS NULL THEN
    RAISE EXCEPTION 'letter_number_counter row missing';
  END IF;

  next_code := 'خطاب ' || LPAD(next_num::TEXT, 4, '0');
  RETURN next_code;
END;
$$;

-- 5) أعمدة جديدة في الخطابات لربط القالب وحفظ (Snapshot) بياناته عند الإنشاء
ALTER TABLE public.letters
  ADD COLUMN IF NOT EXISTS template_id BIGINT REFERENCES public.letter_templates(id),
  ADD COLUMN IF NOT EXISTS template_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS letter_title TEXT,
  ADD COLUMN IF NOT EXISTS variable_data JSONB,
  ADD COLUMN IF NOT EXISTS final_text TEXT;

-- 5ب) المسار الافتراضي للقالب (قابل للتعديل عند إنشاء الخطاب)
ALTER TABLE public.letter_templates
  ADD COLUMN IF NOT EXISTS default_route JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 6) فهارس لتسريع البحث والتصفية
CREATE INDEX IF NOT EXISTS idx_letters_template_id ON public.letters(template_id);
CREATE INDEX IF NOT EXISTS idx_letters_letter_type ON public.letters(letter_type);

-- 7) أذونات الوصول (على نفس نهج الجداول الحالية: بدون RLS)
ALTER TABLE public.letter_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.letter_number_counter DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.letter_templates TO anon, authenticated, postgres, service_role;
GRANT ALL ON TABLE public.letter_number_counter TO anon, authenticated, postgres, service_role;
GRANT ALL ON SEQUENCE public.letter_templates_id_seq TO anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_letter_number() TO anon, authenticated, postgres, service_role;

-- 8) إعادة تحميل مخطط Supabase ليظهر للنظام فورًا
NOTIFY pgrst, 'reload schema';