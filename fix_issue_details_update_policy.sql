-- ============================================================================
-- إصلاح حفظ تعديلات تفاصيل القضايا (الصافي / الإجمالي / شهر تغير الأساسي ...)
-- تنفيذ في Supabase SQL Editor
--
-- السبب: جدول issue_details كان ينقصه سياسة UPDATE للـ RLS،
-- فكانت أي محاولة تحديث للبيانات (data JSONB) تُمنع بصمت أثناء
-- حفظ التعديلات من صفحة إدارة القضايا.
-- ============================================================================

DROP POLICY IF EXISTS "يمكن للمستخدمين المصادقين تحديث تفاصيل القضايا" ON issue_details;

CREATE POLICY "يمكن للمستخدمين المصادقين تحديث تفاصيل القضايا" ON issue_details
  FOR UPDATE USING (true) WITH CHECK (true);

-- تحديث سياسة الإدراج لتشمل WITH CHECK (أمان أسهل للإنشاء من تطبيق Electron)
DROP POLICY IF EXISTS "يمكن للمستخدمين المصادقين إضافة تفاصيل القضايا" ON issue_details;

CREATE POLICY "يمكن للمستخدمين المصادقين إضافة تفاصيل القضايا" ON issue_details
  FOR INSERT WITH CHECK (true);

NOTIFY pgrst, 'reload schema';