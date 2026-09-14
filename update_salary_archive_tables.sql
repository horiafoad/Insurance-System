-- ============================================================================
-- تحديث جداول أرشيف مفردات المرتب لدعم الاستيراد المتقدم من PDF
-- ============================================================================

-- ---------------------------------------------------------------
-- 1) تحديث جدول الموظفين - إضافة حقول جديدة لدعم PDF الكبير
-- ---------------------------------------------------------------

-- إضافة حقول لربط بالملف الأصلي
ALTER TABLE public.employee_salary_archive
  ADD COLUMN IF NOT EXISTS source_file_id TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS page_start INTEGER,
  ADD COLUMN IF NOT EXISTS page_end INTEGER,
  ADD COLUMN IF NOT EXISTS pages_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'verified' CHECK (status IN ('verified', 'needs_review', 'imported')),
  ADD COLUMN IF NOT EXISTS import_notes TEXT;

-- تحديث الوصف
COMMENT ON COLUMN public.employee_salary_archive.source_file_id IS 'معرف الملف الأصلي الذي تم استيراد المفردة منه';
COMMENT ON COLUMN public.employee_salary_archive.original_filename IS 'اسم الملف الأصلي';
COMMENT ON COLUMN public.employee_salary_archive.page_start IS 'رقم الصفحة الأولى في الملف الأصلي';
COMMENT ON COLUMN public.employee_salary_archive.page_end IS 'رقم الصفحة الأخيرة في الملف الأصلي';
COMMENT ON COLUMN public.employee_salary_archive.pages_count IS 'عدد صفحات المفردة';
COMMENT ON COLUMN public.employee_salary_archive.status IS 'حالة التحقق: verified, needs_review, imported';

-- ---------------------------------------------------------------
-- 2) تحديث جدول هيئة التدريس بنفس الحقول
-- ---------------------------------------------------------------

ALTER TABLE public.faculty_salary_archive
  ADD COLUMN IF NOT EXISTS source_file_id TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS page_start INTEGER,
  ADD COLUMN IF NOT EXISTS page_end INTEGER,
  ADD COLUMN IF NOT EXISTS pages_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'verified' CHECK (status IN ('verified', 'needs_review', 'imported')),
  ADD COLUMN IF NOT EXISTS import_notes TEXT;

-- تحديث الوصف
COMMENT ON COLUMN public.faculty_salary_archive.source_file_id IS 'معرف الملف الأصلي الذي تم استيراد المفردة منه';
COMMENT ON COLUMN public.faculty_salary_archive.original_filename IS 'اسم الملف الأصلي';
COMMENT ON COLUMN public.faculty_salary_archive.page_start IS 'رقم الصفحة الأولى في الملف الأصلي';
COMMENT ON COLUMN public.faculty_salary_archive.page_end IS 'رقم الصفحة الأخيرة في الملف الأصلي';
COMMENT ON COLUMN public.faculty_salary_archive.pages_count IS 'عدد صفحات المفردة';
COMMENT ON COLUMN public.faculty_salary_archive.status IS 'حالة التحقق: verified, needs_review, imported';

-- ---------------------------------------------------------------
-- 2.5) إزالة السياسات القديمة إذا وجدت ثم إعادة إنشائها فورًا
-- (يجب عدم ترك الجداول بلا سياسة INSERT وإلا يفشل الاستيراد
--  بـ new row violates row-level security policy)
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "esa_select_for_app" ON public.employee_salary_archive;
DROP POLICY IF EXISTS "esa_insert_for_app" ON public.employee_salary_archive;
DROP POLICY IF EXISTS "esa_update_for_app" ON public.employee_salary_archive;
DROP POLICY IF EXISTS "esa_delete_for_app" ON public.employee_salary_archive;

DROP POLICY IF EXISTS "fsa_select_for_app" ON public.faculty_salary_archive;
DROP POLICY IF EXISTS "fsa_insert_for_app" ON public.faculty_salary_archive;
DROP POLICY IF EXISTS "fsa_update_for_app" ON public.faculty_salary_archive;
DROP POLICY IF EXISTS "fsa_delete_for_app" ON public.faculty_salary_archive;

ALTER TABLE public.faculty_salary_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsa_select_for_app" ON public.faculty_salary_archive
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fsa_insert_for_app" ON public.faculty_salary_archive
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "fsa_update_for_app" ON public.faculty_salary_archive
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fsa_delete_for_app" ON public.faculty_salary_archive
  FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "esa_select_for_app" ON public.employee_salary_archive
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "esa_insert_for_app" ON public.employee_salary_archive
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "esa_update_for_app" ON public.employee_salary_archive
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "esa_delete_for_app" ON public.employee_salary_archive
  FOR DELETE TO anon, authenticated USING (true);

-- ---------------------------------------------------------------
-- 3) إنشاء جدول لتتبع ملفات الاستيراد
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.salary_import_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  original_filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  total_pages INTEGER NOT NULL,
  total_slips INTEGER NOT NULL,
  verified_slips INTEGER DEFAULT 0,
  needs_review_slips INTEGER DEFAULT 0,
  import_type VARCHAR(20) NOT NULL CHECK (import_type IN ('employee', 'faculty')),
  uploaded_by TEXT,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  notes TEXT
);

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_salary_import_files_type ON public.salary_import_files(import_type);
CREATE INDEX IF NOT EXISTS idx_salary_import_files_status ON public.salary_import_files(status);
CREATE INDEX IF NOT EXISTS idx_salary_import_files_date ON public.salary_import_files(upload_date DESC);

-- ---------------------------------------------------------------
-- 4) تحديث جداول الاستيراد المؤقتة
-- ---------------------------------------------------------------

-- تحديث جدول استيراد الموظفين
ALTER TABLE public.employee_salary_imports
  ADD COLUMN IF NOT EXISTS source_file_id UUID REFERENCES public.salary_import_files(id),
  ADD COLUMN IF NOT EXISTS page_start INTEGER,
  ADD COLUMN IF NOT EXISTS page_end INTEGER,
  ADD COLUMN IF NOT EXISTS pages_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS duplicate_check BOOLEAN DEFAULT false;

-- تحديث جدول استيراد هيئة التدريس (إذا كان موجوداً)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'faculty_salary_imports') THEN
    ALTER TABLE public.faculty_salary_imports
      ADD COLUMN IF NOT EXISTS source_file_id UUID REFERENCES public.salary_import_files(id),
      ADD COLUMN IF NOT EXISTS page_start INTEGER,
      ADD COLUMN IF NOT EXISTS page_end INTEGER,
      ADD COLUMN IF NOT EXISTS pages_count INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS duplicate_check BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 5) إضافة فهارس للأداء المحسّن
-- ---------------------------------------------------------------

-- فهارس للبحث برقم العامل (String exact match)
CREATE INDEX IF NOT EXISTS idx_esa_computer_number_exact 
  ON public.employee_salary_archive(computer_number);

CREATE INDEX IF NOT EXISTS idx_fsa_computer_number_exact 
  ON public.faculty_salary_archive(computer_number);

-- فهارس للبحث المركب (رجل العامل + السنة + الشهر)
CREATE INDEX IF NOT EXISTS idx_esa_composite 
  ON public.employee_salary_archive(computer_number, year, month);

CREATE INDEX IF NOT EXISTS idx_fsa_composite 
  ON public.faculty_salary_archive(computer_number, year, month);

-- ---------------------------------------------------------------
-- 6) تحديث سياسات RLS (إذا كانت مفعلة)
-- ---------------------------------------------------------------

-- التأكد من أن الجداول الجديدة لها سياسات صحيحة
ALTER TABLE public.salary_import_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read import files" ON public.salary_import_files;
CREATE POLICY "Allow authenticated users to read import files"
  ON public.salary_import_files FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert import files" ON public.salary_import_files;
CREATE POLICY "Allow authenticated users to insert import files"
  ON public.salary_import_files FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update import files" ON public.salary_import_files;
CREATE POLICY "Allow authenticated users to update import files"
  ON public.salary_import_files FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 7) تحديث كاش PostgREST
-- ---------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------
-- 8) إضافة تعليقات توضيحية
-- ---------------------------------------------------------------

COMMENT ON TABLE public.salary_import_files IS 'جدول تتبع ملفات PDF المستوردة لأرشيف مفردات المرتب';
COMMENT ON COLUMN public.salary_import_files.total_slips IS 'إجمالي عدد المفردات المكتشفة في الملف';
COMMENT ON COLUMN public.salary_import_files.verified_slips IS 'عدد المفردات التي تم التحقق منها بنجاح';
COMMENT ON COLUMN public.salary_import_files.needs_review_slips IS 'عدد المفردات التي تحتاج مراجعة يدوية';
COMMENT ON COLUMN public.salary_import_files.import_type IS 'نوع الاستيراد: employee أو faculty';