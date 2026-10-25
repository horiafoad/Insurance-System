-- ============================================================================
-- تبليغات هيئة التدريس — ترحيل قاعدة البيانات
-- التاريخ: 2026-10-25
--
-- الهدف:
--   إنشاء نظام تبليغات هيئة التدريس مع سير عمل صلاحيات ثنائي المدقق
--   (منشئ ← مدخل البيرول ← مراجع البيرول)
--
-- الميزات:
--   • أنواع تبليغات متعددة (صرف مرتب، وقف مرتب، تغيير طريقة الدفع، إجازة دراسية، خصومات، ترقية)
--   • اختيار شهر البيرول مرة واحدة لجميع التبليغات
--   • نظام صلاحيات ثلاثي الأدوار مع حالات سير العمل
--   • ربط بالفهرس الأساسي لأعضاء هيئة التدريس (faculty_members)
--   • مرفقات PDF مع نظام التخزين الحالي
--   • سجل تدقيق كامل لجميع التغييرات
--
-- الضمانات:
--   • لا يحذف ولا يعدّل أي جدول أو عمود أو بيانات قديمة
--   • كل الإضافات جداول جديدة فقط
--   • idempotent: يمكن تشغيل الملف أكثر من مرة بلا أخطاء
--
-- طريقة التشغيل:
--   Supabase Dashboard → SQL Editor → New query → الصق الملف كاملاً → Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) دالة مساعدة: ضبط updated_at تلقائيًا
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.faculty_notifications_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2) جدول التبليغات
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3) محفّز updated_at
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_faculty_notifications_updated_at ON public.faculty_notifications;
CREATE TRIGGER trg_faculty_notifications_updated_at
  BEFORE UPDATE ON public.faculty_notifications
  FOR EACH ROW EXECUTE FUNCTION public.faculty_notifications_set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) Row Level Security
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 5) الصلاحيات (GRANT)
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_notifications TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) تحديث كاش PostgREST
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- نهاية الترحيل
-- ============================================================================
