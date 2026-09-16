-- ============================================================================
-- Case Documents + Payment Status columns
-- Run in Supabase SQL Editor
-- ============================================================================

-- 1) جدول الملفات الإضافية لكل قضية
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

-- 2) أعمدة جديدة في جدول القضايا
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT NULL
    CHECK (payment_status IS NULL OR payment_status IN (
      'تم الصرف','تم التنفيذ','في انتظار الصرف','جاري التنفيذ','مرفوضة'
    )),
  ADD COLUMN IF NOT EXISTS payment_date DATE DEFAULT NULL;

COMMENT ON COLUMN issues.payment_status IS 'حالة الصرف';
COMMENT ON COLUMN issues.payment_date IS 'تاريخ الصرف';

-- 3) RLS
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
