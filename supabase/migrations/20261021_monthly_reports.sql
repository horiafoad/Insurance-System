-- ============================================================================
-- وحدة التبليغات الشهرية — ترحيل قاعدة البيانات
-- التاريخ: 2026-10-21
--
-- الهدف:
--   إنشاء نظام شامل للتبليغات الشهرية مقسم إلى ثلاثة أقسام:
--   1. تبليغات هيئة التدريس
--   2. تبليغات الموظفين
--   3. تبليغات العقود
--
-- الميزات:
--   • أنواع تبليغات قابلة للإدارة من داخل البرنامج
--   • حقول ديناميكية قابلة للتخصيص لكل نوع
--   • تسجيل تلقائي للموظف المنشئ
--   • صلاحيات التعديل والحذف
--   • كشوف شهرية مستقلة لكل قسم
--   • الربط بالأرشيف الذكي
--   • حفظ المرفقات مع نظام التخزين الحالي
--
-- الضمانات:
--   • لا يحذف ولا يعدّل أي جدول أو عمود أو بيانات قديمة
--   • كل الإضافات جداول جديدة فقط
--   • idempotent: يمكن تشغيل الملف أكثر من مرة بلا أخطاء
--   • يحافظ على السجلات التاريخية عند تعديل الأنواع أو الحقول
--
-- طريقة التشغيل:
--   Supabase Dashboard → SQL Editor → New query → الصق الملف كاملاً → Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) دالة مساعدة: ضبط updated_at تلقائيًا
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.monthly_reports_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2) الأقسام الثلاثة
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_report_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,           -- faculty | employee | contract
  name        text NOT NULL,                   -- هيئة التدريس | الموظفين | العقود
  name_ar     text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- إدراج الأقسام الابتدائية
INSERT INTO public.monthly_report_sections (code, name, name_ar, description, sort_order)
VALUES
  ('faculty', 'Faculty', 'هيئة التدريس', 'تبليغات أعضاء هيئة التدريس', 1),
  ('employee', 'Employee', 'الموظفون', 'تبليغات الموظفين الإداريين', 2),
  ('contract', 'Contract', 'العقود', 'تبليغات العقود', 3)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3) أنواع التبليغات (مستقلة لكل قسم)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_report_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      uuid NOT NULL REFERENCES public.monthly_report_sections(id) ON DELETE CASCADE,
  name            text NOT NULL,
  name_ar         text NOT NULL,
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  
  -- إعدادات النوع
  requires_attachment   boolean NOT NULL DEFAULT false,
  requires_decision_no boolean NOT NULL DEFAULT false,
  requires_decision_date boolean NOT NULL DEFAULT false,
  requires_effective_date boolean NOT NULL DEFAULT false,
  
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT monthly_report_types_section_name UNIQUE (section_id, name)
);

CREATE INDEX IF NOT EXISTS idx_monthly_report_types_section
  ON public.monthly_report_types (section_id);
CREATE INDEX IF NOT EXISTS idx_monthly_report_types_active
  ON public.monthly_report_types (is_active);

-- ----------------------------------------------------------------------------
-- 4) تعريفات الحقول الديناميكية
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_report_field_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id         uuid NOT NULL REFERENCES public.monthly_report_types(id) ON DELETE CASCADE,
  field_label     text NOT NULL,
  field_label_ar  text NOT NULL,
  field_type      text NOT NULL,              -- text | textarea | date | number | select | boolean | file
  is_required     boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  description     text,
  hint            text,
  options         jsonb,                      -- خيارات القائمة: [{"value": "a", "label": "أ"}]
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_report_field_definitions_type
  ON public.monthly_report_field_definitions (type_id);
CREATE INDEX IF NOT EXISTS idx_monthly_report_field_definitions_active
  ON public.monthly_report_field_definitions (is_active);

-- ----------------------------------------------------------------------------
-- 5) سجلات التبليغات
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id          uuid NOT NULL REFERENCES public.monthly_report_sections(id) ON DELETE CASCADE,
  type_id             uuid NOT NULL REFERENCES public.monthly_report_types(id) ON DELETE CASCADE,
  
  -- الشخص أو العقد المرتبط
  faculty_member_id   uuid REFERENCES public.faculty_members(id) ON DELETE SET NULL,
  employee_id         text,                      -- معرف الموظف (سيتحدد حسب البنية الحالية)
  contract_id         uuid,                      -- معرف العقد (سيُضاف لاحقًا حسب الحاجة)
  
  -- بيانات التبليغ
  report_month        integer NOT NULL,          -- الشهر (1-12)
  report_year         integer NOT NULL,          -- السنة
  decision_number     text,
  decision_date       date,
  effective_date      date,
  status              text NOT NULL DEFAULT 'draft', -- draft | submitted | approved | archived
  
  -- هوية المنشئ والمعدّل
  created_by_id       text,                      -- معرف المستخدم من جدول users
  created_by_name     text NOT NULL,             -- اسم الموظف وقت الإنشاء (تاريخي)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_by_id       text,
  updated_by_name     text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  
  notes               text
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_section
  ON public.monthly_reports (section_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_type
  ON public.monthly_reports (type_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_month_year
  ON public.monthly_reports (report_year, report_month);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_faculty
  ON public.monthly_reports (faculty_member_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_employee
  ON public.monthly_reports (employee_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_created_by
  ON public.monthly_reports (created_by_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_status
  ON public.monthly_reports (status);

-- ----------------------------------------------------------------------------
-- 6) قيم الحقول المخصصة
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_report_field_values (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.monthly_reports(id) ON DELETE CASCADE,
  field_id        uuid NOT NULL REFERENCES public.monthly_report_field_definitions(id) ON DELETE CASCADE,
  field_value     text,
  field_value_number numeric,
  field_value_date date,
  field_value_boolean boolean,
  field_value_json jsonb,
  
  -- حفظ نسخة من تعريف الحقل وقت التسجيل (للحفاظ على التاريخ)
  field_snapshot  jsonb,
  
  created_at      timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT monthly_report_field_values_report_field UNIQUE (report_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_report_field_values_report
  ON public.monthly_report_field_values (report_id);
CREATE INDEX IF NOT EXISTS idx_monthly_report_field_values_field
  ON public.monthly_report_field_values (field_id);

-- ----------------------------------------------------------------------------
-- 7) المرفقات
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_report_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES public.monthly_reports(id) ON DELETE CASCADE,
  
  storage_provider  text NOT NULL DEFAULT 'local',
  storage_key       text,
  file_path         text,
  file_url          text,
  original_filename text NOT NULL,
  mime_type         text,
  size_bytes        bigint,
  
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_report_attachments_report
  ON public.monthly_report_attachments (report_id);

-- ----------------------------------------------------------------------------
-- 8) محفّزات updated_at
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_monthly_report_sections_updated_at ON public.monthly_report_sections;
CREATE TRIGGER trg_monthly_report_sections_updated_at
  BEFORE UPDATE ON public.monthly_report_sections
  FOR EACH ROW EXECUTE FUNCTION public.monthly_reports_set_updated_at();

DROP TRIGGER IF EXISTS trg_monthly_report_types_updated_at ON public.monthly_report_types;
CREATE TRIGGER trg_monthly_report_types_updated_at
  BEFORE UPDATE ON public.monthly_report_types
  FOR EACH ROW EXECUTE FUNCTION public.monthly_reports_set_updated_at();

DROP TRIGGER IF EXISTS trg_monthly_report_field_definitions_updated_at ON public.monthly_report_field_definitions;
CREATE TRIGGER trg_monthly_report_field_definitions_updated_at
  BEFORE UPDATE ON public.monthly_report_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.monthly_reports_set_updated_at();

DROP TRIGGER IF EXISTS trg_monthly_reports_updated_at ON public.monthly_reports;
CREATE TRIGGER trg_monthly_reports_updated_at
  BEFORE UPDATE ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.monthly_reports_set_updated_at();

-- ----------------------------------------------------------------------------
-- 9) Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.monthly_report_sections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_report_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_report_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_report_field_values      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_report_attachments       ENABLE ROW LEVEL SECURITY;

-- سياسات القراءة
DROP POLICY IF EXISTS "mrs_select_for_app" ON public.monthly_report_sections;
CREATE POLICY "mrs_select_for_app" ON public.monthly_report_sections
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mrt_select_for_app" ON public.monthly_report_types;
CREATE POLICY "mrt_select_for_app" ON public.monthly_report_types
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mrfd_select_for_app" ON public.monthly_report_field_definitions;
CREATE POLICY "mrfd_select_for_app" ON public.monthly_report_field_definitions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mr_select_for_app" ON public.monthly_reports;
CREATE POLICY "mr_select_for_app" ON public.monthly_reports
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mrfv_select_for_app" ON public.monthly_report_field_values;
CREATE POLICY "mrfv_select_for_app" ON public.monthly_report_field_values
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mra_select_for_app" ON public.monthly_report_attachments;
CREATE POLICY "mra_select_for_app" ON public.monthly_report_attachments
  FOR SELECT TO anon, authenticated USING (true);

-- سياسات الإدراج
DROP POLICY IF EXISTS "mrs_insert_for_app" ON public.monthly_report_sections;
CREATE POLICY "mrs_insert_for_app" ON public.monthly_report_sections
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "mrt_insert_for_app" ON public.monthly_report_types;
CREATE POLICY "mrt_insert_for_app" ON public.monthly_report_types
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "mrfd_insert_for_app" ON public.monthly_report_field_definitions;
CREATE POLICY "mrfd_insert_for_app" ON public.monthly_report_field_definitions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "mr_insert_for_app" ON public.monthly_reports;
CREATE POLICY "mr_insert_for_app" ON public.monthly_reports
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "mrfv_insert_for_app" ON public.monthly_report_field_values;
CREATE POLICY "mrfv_insert_for_app" ON public.monthly_report_field_values
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "mra_insert_for_app" ON public.monthly_report_attachments;
CREATE POLICY "mra_insert_for_app" ON public.monthly_report_attachments
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- سياسات التحديث
DROP POLICY IF EXISTS "mrs_update_for_app" ON public.monthly_report_sections;
CREATE POLICY "mrs_update_for_app" ON public.monthly_report_sections
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mrt_update_for_app" ON public.monthly_report_types;
CREATE POLICY "mrt_update_for_app" ON public.monthly_report_types
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mrfd_update_for_app" ON public.monthly_report_field_definitions;
CREATE POLICY "mrfd_update_for_app" ON public.monthly_report_field_definitions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mr_update_for_app" ON public.monthly_reports;
CREATE POLICY "mr_update_for_app" ON public.monthly_reports
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mrfv_update_for_app" ON public.monthly_report_field_values;
CREATE POLICY "mrfv_update_for_app" ON public.monthly_report_field_values
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mra_update_for_app" ON public.monthly_report_attachments;
CREATE POLICY "mra_update_for_app" ON public.monthly_report_attachments
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- سياسات الحذف
DROP POLICY IF EXISTS "mrs_delete_for_app" ON public.monthly_report_sections;
CREATE POLICY "mrs_delete_for_app" ON public.monthly_report_sections
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mrt_delete_for_app" ON public.monthly_report_types;
CREATE POLICY "mrt_delete_for_app" ON public.monthly_report_types
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mrfd_delete_for_app" ON public.monthly_report_field_definitions;
CREATE POLICY "mrfd_delete_for_app" ON public.monthly_report_field_definitions
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mr_delete_for_app" ON public.monthly_reports;
CREATE POLICY "mr_delete_for_app" ON public.monthly_reports
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mrfv_delete_for_app" ON public.monthly_report_field_values;
CREATE POLICY "mrfv_delete_for_app" ON public.monthly_report_field_values
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "mra_delete_for_app" ON public.monthly_report_attachments;
CREATE POLICY "mra_delete_for_app" ON public.monthly_report_attachments
  FOR DELETE TO anon, authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 10) الصلاحيات (GRANT)
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_report_sections           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_report_types               TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_report_field_definitions   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_reports                    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_report_field_values        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_report_attachments         TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 11) تحديث كاش PostgREST
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- نهاية الترحيل
-- ============================================================================
