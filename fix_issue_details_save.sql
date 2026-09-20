-- ============================================================================
-- إصلاح حفظ تعديلات القضايا نهائيًا
-- تنفيذ في Supabase SQL Editor
-- ============================================================================
-- السبب الجذري: تطبيق سطح المكتب المثبَّت (النُسخ القديمة) يُدخل عمود status
-- عند إضافة صف جديد في جدول issue_details، وهذا العمود غير موجود في قاعدة
-- البيانات، فكانت كل عملية حفظ تفشل بصمت (خطأ PGRST204) وتُعرض رسالة نجاح
-- دون حفظ أي شيء — لذلك "مش بيتحفظ التعديلات".
--
-- الحل هنا مكوَّن من 3 خطوات قابلة للإعادة التنفيذ بأمان (Idempotent):
--   1) إضافة عمود status إذا كان ناقصًا (يوفّر التوافق مع كل النُسخ).
--   2) التأكد من وجود فهرس الحالة.
--   3) التأكد من وجود سياسات RLS للقراءة/الإضافة/التحديث/الحذف
--      على جدولي issues و issue_details.
-- ============================================================================

-- 1) عمود status في تفاصيل القضايا
ALTER TABLE issue_details
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

COMMENT ON COLUMN issue_details.status IS
  'حالة القضية: pending, completed';

-- 2) فهرس البحث حسب الحالة
CREATE INDEX IF NOT EXISTS idx_issue_details_status ON issue_details(status);

-- 3) سياسات RLS — تفاصيل القضايا
ALTER TABLE issue_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "issue_details_select" ON issue_details;
CREATE POLICY "issue_details_select" ON issue_details
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "issue_details_insert" ON issue_details;
CREATE POLICY "issue_details_insert" ON issue_details
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "issue_details_update" ON issue_details;
CREATE POLICY "issue_details_update" ON issue_details
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "issue_details_delete" ON issue_details;
CREATE POLICY "issue_details_delete" ON issue_details
  FOR DELETE USING (true);

-- 4) سياسات RLS — القضايا
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "issues_select" ON issues;
CREATE POLICY "issues_select" ON issues
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "issues_insert" ON issues;
CREATE POLICY "issues_insert" ON issues
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "issues_update" ON issues;
CREATE POLICY "issues_update" ON issues
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "issues_delete" ON issues;
CREATE POLICY "issues_delete" ON issues
  FOR DELETE USING (true);

-- إعادة تحميل مخطط PostgREST حتى تظهر التغييرات فورًا
NOTIFY pgrst, 'reload schema';