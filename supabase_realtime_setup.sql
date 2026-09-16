-- =====================================================
-- تفعيل Supabase Realtime لكل جداول النظام
-- نفّذ هذا الملف مرة واحدة فقط من:
-- Supabase Dashboard → SQL Editor
-- بعد التنفيذ، أي إدراج / تحديث / حذف في هذه الجداول
-- ينعكس فورًا عند كل المستخدمين المتصلين بدون刷新 الصفحة.
-- =====================================================

-- إنشاء النشر إن لم يكن موجودًا (مفيد عند الاستضافة الذاتية)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- إضافة الجداول إلى publication بشكل مُستقر:
-- يتجاهل الجداول غير الموجودة (لم يُشغَّل سكربت إنشائها بعد) ويستمر دون أخطاء.
DO $$
DECLARE
  t TEXT;
  full_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'tasks',
    'claims',
    'service_requests',
    'public_feedback',
    'employee_tasks',
    'performance_evaluations',
    'salary_requests',
    'welfare_requests',
    'fellowship_requests',
    'certificate_requests',
    'issues',
    'issue_details',
    'case_documents',
    'letters',
    'letter_movements',
    'letter_departments',
    'letter_senders',
    'letter_sectors',
    'letter_templates',
    'archive_qr_codes',
    'training_courses',
    'course_registrations',
    'executive_orders',
    'executive_order_persons',
    'scanner_inbox',
    'faculty_salary_archive',
    'employee_salary_archive',
    'salary_import_files',
    'faculty_salary_pages'
  ] LOOP
    full_name := format('public.%I', t);

    -- تخطي الجداول غير الموجودة في القاعدة
    IF to_regclass(full_name) IS NULL THEN
      RAISE NOTICE 'SKIP % (table does not exist)', full_name;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', full_name);
      RAISE NOTICE 'ADDED % TO supabase_realtime', full_name;
    ELSE
      RAISE NOTICE 'SKIP % (already published)', full_name;
    END IF;
  END LOOP;
END
$$;
