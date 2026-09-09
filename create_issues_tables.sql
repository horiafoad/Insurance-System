-- إنشاء جدول القضايا
CREATE TABLE IF NOT EXISTS issues (
  id BIGSERIAL PRIMARY KEY,
  case_number VARCHAR(100) UNIQUE,
  case_title VARCHAR(500) NOT NULL,
  case_description TEXT,
  case_type VARCHAR(50) DEFAULT 'individual', -- 'individual' or 'bulk'
  file_type VARCHAR(20) NOT NULL, -- 'excel' or 'pdf'
  file_url TEXT,
  file_name VARCHAR(500),
  file_size BIGINT,
  uploaded_by VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'in_progress'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- إنشاء جدول تفاصيل القضايا (من Excel)
CREATE TABLE IF NOT EXISTS issue_details (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT REFERENCES issues(id) ON DELETE CASCADE,
  row_number INTEGER,
  data JSONB NOT NULL,
  pdf_url TEXT,
  pdf_file_name VARCHAR(500),
  pdf_uploaded_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- إنشاء فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_case_number ON issues(case_number);
CREATE INDEX IF NOT EXISTS idx_issues_type ON issues(case_type);
CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_details_issue_id ON issue_details(issue_id);

-- إنشاء دالة لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- إضافة التريجر لتحديث updated_at
CREATE TRIGGER update_issues_updated_at 
  BEFORE UPDATE ON issues 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- تفعيل Row Level Security (RLS)
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_details ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول للقضايا
CREATE POLICY "يمكن للجميع قراءة القضايا" ON issues
  FOR SELECT USING (true);

CREATE POLICY "يمكن للمستخدمين المصادقين إضافة قضايا" ON issues
  FOR INSERT WITH CHECK (true);

CREATE POLICY "يمكن للمستخدمين المصادقين تحديث القضايا" ON issues
  FOR UPDATE USING (true);

CREATE POLICY "يمكن للمستخدمين المصادقين حذف القضايا" ON issues
  FOR DELETE USING (true);

-- سياسات الوصول لتفاصيل القضايا
CREATE POLICY "يمكن للجميع قراءة تفاصيل القضايا" ON issue_details
  FOR SELECT USING (true);

CREATE POLICY "يمكن للمستخدمين المصادقين إضافة تفاصيل القضايا" ON issue_details
  FOR INSERT WITH CHECK (true);

CREATE POLICY "يمكن للمستخدمين المصادقين حذف تفاصيل القضايا" ON issue_details
  FOR DELETE USING (true);

-- إضافة تعليقات للجداول
COMMENT ON TABLE issues IS 'جدول القضايا الرئيسي';
COMMENT ON TABLE issue_details IS 'جدول تفاصيل القضايا المستوردة من Excel';
COMMENT ON COLUMN issues.case_number IS 'رقم القضية الفريد';
COMMENT ON COLUMN issues.case_type IS 'نوع القضية: فردية أو جماعية';
COMMENT ON COLUMN issues.file_type IS 'نوع الملف: Excel أو PDF';
COMMENT ON COLUMN issues.status IS 'حالة القضية: معلقة، موافقة، مرفوضة، قيد المعالجة';
