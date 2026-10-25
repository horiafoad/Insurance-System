-- ============================================================================
-- ترحيل شامل لنظام تبليغات هيئة التدريس
-- التاريخ: 2026-10-25
--
-- هذا الملف يجمع جميع الترحيلات المطلوبة بالترتيب الصحيح
-- تشغّل هذا الملف مرة واحدة في Supabase SQL Editor
--
-- الترتيب:
--   1. إضافة عمود دور تبليغات هيئة التدريس لجدول المستخدمين
--   2. تعيين الأدوار للمستخدمين (horia = creator, hanaa = input_reviewer, gehad = final_reviewer)
--   3. إنشاء جدول التبليغات مع سير العمل الصلاحيات
--
-- الأدوار:
--   • creator          - منشئ التبليغ (horia)
--   • input_reviewer   - مدخل البيرول (hanaa)
--   • final_reviewer   - مراجع البيرول (gehad)
--
-- طريقة التشغيل:
--   Supabase Dashboard → SQL Editor → New query → الصق الملف كاملاً → Run.
-- ============================================================================

-- ============================================================================
-- 1) إضافة عمود دور تبليغات هيئة التدريس
-- ============================================================================

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS faculty_notification_role text;

ALTER TABLE public.users
ADD CONSTRAINT users_faculty_notification_role_check
  CHECK (faculty_notification_role IN ('creator', 'input_reviewer', 'final_reviewer') OR faculty_notification_role IS NULL);

-- ============================================================================
-- 2) تعيين الأدوار للمستخدمين
-- ============================================================================

-- تعيين منشئ التبليغ
UPDATE public.users
SET faculty_notification_role = 'creator'
WHERE username = 'horia';

-- تعيين مدخل البيرول
UPDATE public.users
SET faculty_notification_role = 'input_reviewer'
WHERE username = 'hanaa';

-- تعيين مراجع البيرول
UPDATE public.users
SET faculty_notification_role = 'final_reviewer'
WHERE username = 'gehad';

-- ============================================================================
-- 3) جدول التبليغات
-- ============================================================================

-- دالة مساعدة: ضبط updated_at تلقائيًا
CREATE OR REPLACE FUNCTION public.faculty_notifications_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- جدول التبليغات
CREATE TABLE IF NOT EXISTS public.faculty_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- الربط بعضو هيئة التدريس
  faculty_member_id   uuid REFERENCES public.faculty_members(id) ON DELETE SET NULL,
  
  -- نوع التبليغ
  notification_type  text NOT NULL, -- salary_payment | salary_stop | payment_method_change | study_leave_with_salary | deduction | promotion
  
  -- شهر البيرول (مهم: يُختار مرة واحدة لجميع التبليغات في الجلسة)
  payroll_month       integer NOT NULL CHECK (payroll_month BETWEEN 1 AND 12),
  payroll_year        integer NOT NULL,
  
  -- بيانات التبليغ (JSONB مرن لأنواع مختلفة)
  notification_data   jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- الحقول المشتركة
  decision_number     text,
  decision_date       date,
  effective_date      date,
  notes               text,
  
  -- مرفق PDF
  pdf_url             text,
  pdf_file_name       text,
  pdf_storage_provider text,
  pdf_storage_key     text,
  pdf_uploaded_at     timestamptz,
  pdf_uploaded_by     text,
  
  -- سير العمل الصلاحيات
  workflow_status     text NOT NULL DEFAULT 'new', -- new | awaiting_input | input_completed | awaiting_review | review_completed | returned_for_correction
  input_by            text,
  input_at            timestamptz,
  reviewed_by         text,
  reviewed_at         timestamptz,
  return_reason       text,
  return_reason_detail text,
  
  -- هوية المنشئ
  created_by_id       text,
  created_by_name     text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_by_id       text,
  updated_by_name     text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT faculty_notifications_type_check
    CHECK (notification_type IN ('salary_payment', 'salary_stop', 'payment_method_change', 'study_leave_with_salary', 'deduction', 'promotion'))
);

-- الفهارس
CREATE INDEX IF NOT EXISTS idx_faculty_notifications_member
  ON public.faculty_notifications (faculty_member_id);

CREATE INDEX IF NOT EXISTS idx_faculty_notifications_type
  ON public.faculty_notifications (notification_type);

CREATE INDEX IF NOT EXISTS idx_faculty_notifications_payroll
  ON public.faculty_notifications (payroll_year, payroll_month);

CREATE INDEX IF NOT EXISTS idx_faculty_notifications_status
  ON public.faculty_notifications (workflow_status);

CREATE INDEX IF NOT EXISTS idx_faculty_notifications_created_by
  ON public.faculty_notifications (created_by_id);

CREATE INDEX IF NOT EXISTS idx_faculty_notifications_input_by
  ON public.faculty_notifications (input_by);

CREATE INDEX IF NOT EXISTS idx_faculty_notifications_reviewed_by
  ON public.faculty_notifications (reviewed_by);

-- محفّز updated_at
DROP TRIGGER IF EXISTS trg_faculty_notifications_updated_at ON public.faculty_notifications;
CREATE TRIGGER trg_faculty_notifications_updated_at
  BEFORE UPDATE ON public.faculty_notifications
  FOR EACH ROW EXECUTE FUNCTION public.faculty_notifications_set_updated_at();

-- Row Level Security
ALTER TABLE public.faculty_notifications ENABLE ROW LEVEL SECURITY;

-- سياسات القراءة
DROP POLICY IF EXISTS "fn_select_for_app" ON public.faculty_notifications;
CREATE POLICY "fn_select_for_app" ON public.faculty_notifications
  FOR SELECT TO anon, authenticated USING (true);

-- سياسات الإدراج
DROP POLICY IF EXISTS "fn_insert_for_app" ON public.faculty_notifications;
CREATE POLICY "fn_insert_for_app" ON public.faculty_notifications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- سياسات التحديث
DROP POLICY IF EXISTS "fn_update_for_app" ON public.faculty_notifications;
CREATE POLICY "fn_update_for_app" ON public.faculty_notifications
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- سياسات الحذف
DROP POLICY IF EXISTS "fn_delete_for_app" ON public.faculty_notifications;
CREATE POLICY "fn_delete_for_app" ON public.faculty_notifications
  FOR DELETE TO anon, authenticated USING (true);

-- الصلاحيات
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_notifications TO anon, authenticated;

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- نهاية الترحيل الشامل
-- ============================================================================
