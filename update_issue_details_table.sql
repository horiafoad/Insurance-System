-- تحديث جدول issue_details لإضافة حقول PDF
-- نفذ هذا الملف في Supabase SQL Editor

-- إضافة حقول جديدة للجدول
ALTER TABLE issue_details 
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS pdf_file_name VARCHAR(500),
ADD COLUMN IF NOT EXISTS pdf_uploaded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- إنشاء فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_issue_details_status ON issue_details(status);
CREATE INDEX IF NOT EXISTS idx_issue_details_pdf_uploaded ON issue_details(pdf_uploaded_at);

-- إضافة تعليق
COMMENT ON COLUMN issue_details.pdf_url IS 'رابط ملف PDF المرفق للقضية';
COMMENT ON COLUMN issue_details.pdf_file_name IS 'اسم ملف PDF المرفق';
COMMENT ON COLUMN issue_details.pdf_uploaded_at IS 'تاريخ رفع ملف PDF';
COMMENT ON COLUMN issue_details.status IS 'حالة القضية: pending, completed';
