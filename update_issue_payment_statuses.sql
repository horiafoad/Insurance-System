-- ============================================================================
-- توحيد حالات الصرف (payment_status) إلى 4 حالات فقط
-- تنفيذ في Supabase SQL Editor
--
-- هذا الملف مكتفي ذاتيًا:
--   - ينشئ جدول case_documents إن لم يكن موجودًا (لو لم يُنفَّذ create_case_documents.sql)
--   - يضيف عمودي payment_status / payment_date إن لم يكونا موجودين
--   - يوحّد القيم القديمة للحالة الموحدة
--   - يستبدل قيد CHECK القديم بالنطاق الجديد (4 حالات)
--
-- الحالات الجديدة:
--   'جاري التنفيذ' ، 'تم التنفيذ وفي انتظار الصرف' ، 'تم الصرف' ، 'مرفوضة'
-- 'تم التنفيذ' و 'في انتظار الصرف' أصبحتا حالة واحدة موحدة.
-- ============================================================================

-- 1) جدول الملفات المرفقة لكل قضية (إن لم يكن موجودًا)
CREATE TABLE IF NOT EXISTS case_documents (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  doc_type TEXT NOT NULL DEFAULT 'additional_pdf' CHECK (doc_type IN ('main_pdf', 'additional_pdf')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_documents_case_id ON case_documents(case_id);

-- 2) أعمدة حالة الصرف في جدول القضايا (إن لم تكن موجودة)
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT NULL;

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS payment_date DATE DEFAULT NULL;

-- 3) توحيد القيم القديمة للبيانات الحالية (الحفاظ على البيانات ودمج الحالتين)
UPDATE issues
SET payment_status = 'تم التنفيذ وفي انتظار الصرف'
WHERE payment_status IN ('تم التنفيذ', 'في انتظار الصرف');

-- 4) إزالة القيد القديم (5 حالات) وإعادة إنشائه بالنطاق الجديد (4 حالات)
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_payment_status_check;

ALTER TABLE issues
  ADD CONSTRAINT issues_payment_status_check
  CHECK (
    payment_status IS NULL OR payment_status IN (
      'جاري التنفيذ','تم التنفيذ وفي انتظار الصرف','تم الصرف','مرفوضة'
    )
  );

COMMENT ON COLUMN issues.payment_status IS
  'حالة الصرف: جاري التنفيذ، تم التنفيذ وفي انتظار الصرف، تم الصرف، مرفوضة';

-- 5) سياسات الوصول لجدول الملفات (آمنة لإعادة التنفيذ)
ALTER TABLE case_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cd_select" ON case_documents;
CREATE POLICY "cd_select" ON case_documents
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "cd_insert" ON case_documents;
CREATE POLICY "cd_insert" ON case_documents
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "cd_update" ON case_documents;
CREATE POLICY "cd_update" ON case_documents
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "cd_delete" ON case_documents;
CREATE POLICY "cd_delete" ON case_documents
  FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';