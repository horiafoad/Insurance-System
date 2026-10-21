-- ============================================================================
-- الأرشيف الذكي لأعضاء هيئة التدريس — ترحيل قاعدة البيانات
-- التاريخ: 2026-10-21
--
-- الهدف:
--   سجل مركزي واحد لكل عضو في هيئة التدريس (faculty_members) مستورد من
--   ملف Excel، مع جدول وثائق (محلية على جهاز المستخدم) وجدول روابط
--   يربط العضو بالمطالبات والطلبات والقضايا والخطابات والأوامر التنفيذية
--   ومفردات المرتب والمعاملات الأخرى.
--
-- الضمانات:
--   • لا يحذف ولا يعدّل أي جدول أو عمود أو بيانات قديمة.
--   • كل الإضافات جداول جديدة فقط.
--   • idempotent: يمكن تشغيل الملف أكثر من مرة بلا أخطاء وبلا تكرار.
--   • لا يُنشئ أي bucket ولا يرفع أي ملف إلى Supabase Storage.
--     ملفات PDF الخاصة بالأرشيف تُحفظ على جهاز المستخدم (تخزين local)
--     وتُخزَّن في قاعدة البيانات مراجع ثابتة بصيغة local://<bucket>/<path>.
--
-- طريقة التشغيل:
--   Supabase Dashboard → SQL Editor → New query → الصق الملف كاملاً → Run.
--   بعد نجاح التشغيل: node scripts/import-faculty-archive.mjs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) دالة مساعدة: ضبط updated_at تلقائيًا
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.faculty_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2) السجل المركزي لأعضاء هيئة التدريس
--    member_code = «رقم الصرف» وهو المفتاح الثابت (فريد) للعضو.
--    full_name  = الاسم بالحروف العربية الأساسية (قابل للبحث والمطابقة).
--    full_name_raw = الاسم الأصلي كما ورد في ملف Excel (للمراجعة فقط).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_members (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_code          text NOT NULL,
  member_code_raw      text,
  full_name            text NOT NULL,
  full_name_raw        text,
  full_name_normalized text NOT NULL,
  job_title            text,
  grade                text,
  grade_date           date,
  salary_306           numeric(12,2),
  salary_306_raw       text,
  source_row_no        integer,
  source_file          text,
  status               text NOT NULL DEFAULT 'active',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faculty_members_member_code_key UNIQUE (member_code)
);

CREATE INDEX IF NOT EXISTS idx_faculty_members_name
  ON public.faculty_members (full_name_normalized);

CREATE INDEX IF NOT EXISTS idx_faculty_members_full_name
  ON public.faculty_members (full_name);

CREATE INDEX IF NOT EXISTS idx_faculty_members_job
  ON public.faculty_members (job_title);

-- عمود «اسم المجموعة» الموجود في ملف Excel (992 / -992 / معيدين / متفرغ / …)
ALTER TABLE public.faculty_members
  ADD COLUMN IF NOT EXISTS group_name text;

-- ----------------------------------------------------------------------------
-- 3) الأسماء البديلة (Alias)
--    تُستخدم لمطابقة الاسم الذي يظهر في المطالبات/الطلبات إذا اختلف
--    كتابته عن الاسم الرسمي (أبجدية مختلفة، لقب مضاف، اختصار…).
--    لا يُدمج عضوان بناءً على الاسم فقط — الربط بالرمز أولاً.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_member_aliases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid NOT NULL REFERENCES public.faculty_members(id) ON DELETE CASCADE,
  alias             text NOT NULL,
  alias_normalized  text NOT NULL,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faculty_member_aliases_key UNIQUE (member_id, alias_normalized)
);

CREATE INDEX IF NOT EXISTS idx_faculty_member_aliases_norm
  ON public.faculty_member_aliases (alias_normalized);

-- ----------------------------------------------------------------------------
-- 4) وثائق العضو (PDF و غيره) — مخزّنة على جهاز المستخدم
--    storage_provider = 'local' دائمًا لهذه الوثائق.
--    file_url = local://<bucket>/<path>  (مرجع ثابت، لا سرّ فيه)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_member_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid NOT NULL REFERENCES public.faculty_members(id) ON DELETE CASCADE,
  doc_type          text NOT NULL DEFAULT 'other',
  title             text,
  year              integer,
  month             integer,
  storage_provider  text NOT NULL DEFAULT 'local',
  storage_key       text,
  file_path         text,
  file_url          text,
  original_filename text,
  mime_type         text,
  size_bytes        bigint,
  notes             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faculty_member_documents_member
  ON public.faculty_member_documents (member_id);

CREATE INDEX IF NOT EXISTS idx_faculty_member_documents_type
  ON public.faculty_member_documents (doc_type);

-- ----------------------------------------------------------------------------
-- 5) روابط العضو ببقية أقسام النظام
--    link_type: claim | service_request | issue | letter | executive_order |
--               task | salary_document | other
--    ref_table: اسم الجدول المصدر (claims، service_requests، …)
--    ref_id   : المعرّف في الجدول المصدر (نص)
--    snapshot : نسخة مختصرة من بيانات السجل وقت الربط (JSON) لعرض فوري
--    matched_by: exact_code | normalized_name | alias | manual
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_member_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES public.faculty_members(id) ON DELETE CASCADE,
  link_type    text NOT NULL,
  ref_table    text NOT NULL,
  ref_id       text NOT NULL,
  ref_label    text,
  ref_date     date,
  matched_by   text NOT NULL DEFAULT 'normalized_name',
  confidence   numeric(3,2),
  snapshot     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faculty_member_links_key UNIQUE (member_id, link_type, ref_table, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_faculty_member_links_member
  ON public.faculty_member_links (member_id);

CREATE INDEX IF NOT EXISTS idx_faculty_member_links_type
  ON public.faculty_member_links (link_type);

CREATE INDEX IF NOT EXISTS idx_faculty_member_links_ref
  ON public.faculty_member_links (ref_table, ref_id);

-- ----------------------------------------------------------------------------
-- 6) محفّزات updated_at
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_faculty_members_updated_at ON public.faculty_members;
CREATE TRIGGER trg_faculty_members_updated_at
  BEFORE UPDATE ON public.faculty_members
  FOR EACH ROW EXECUTE FUNCTION public.faculty_set_updated_at();

DROP TRIGGER IF EXISTS trg_faculty_member_documents_updated_at ON public.faculty_member_documents;
CREATE TRIGGER trg_faculty_member_documents_updated_at
  BEFORE UPDATE ON public.faculty_member_documents
  FOR EACH ROW EXECUTE FUNCTION public.faculty_set_updated_at();

DROP TRIGGER IF EXISTS trg_faculty_member_links_updated_at ON public.faculty_member_links;
CREATE TRIGGER trg_faculty_member_links_updated_at
  BEFORE UPDATE ON public.faculty_member_links
  FOR EACH ROW EXECUTE FUNCTION public.faculty_set_updated_at();

-- ----------------------------------------------------------------------------
-- 7) Row Level Security
--    نفس النمط المستخدم في بقية جداول النظام (anon + authenticated).
--    التطبيق نفسه يتحقق من الصلاحيات قبل عرض لوحة الإدارة.
-- ----------------------------------------------------------------------------
ALTER TABLE public.faculty_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_member_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_member_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_member_links    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fm_select_for_app" ON public.faculty_members;
CREATE POLICY "fm_select_for_app" ON public.faculty_members
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "fm_insert_for_app" ON public.faculty_members;
CREATE POLICY "fm_insert_for_app" ON public.faculty_members
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "fm_update_for_app" ON public.faculty_members;
CREATE POLICY "fm_update_for_app" ON public.faculty_members
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fm_delete_for_app" ON public.faculty_members;
CREATE POLICY "fm_delete_for_app" ON public.faculty_members
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "fma_select_for_app" ON public.faculty_member_aliases;
CREATE POLICY "fma_select_for_app" ON public.faculty_member_aliases
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "fma_insert_for_app" ON public.faculty_member_aliases;
CREATE POLICY "fma_insert_for_app" ON public.faculty_member_aliases
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "fma_update_for_app" ON public.faculty_member_aliases;
CREATE POLICY "fma_update_for_app" ON public.faculty_member_aliases
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fma_delete_for_app" ON public.faculty_member_aliases;
CREATE POLICY "fma_delete_for_app" ON public.faculty_member_aliases
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "fmd_select_for_app" ON public.faculty_member_documents;
CREATE POLICY "fmd_select_for_app" ON public.faculty_member_documents
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "fmd_insert_for_app" ON public.faculty_member_documents;
CREATE POLICY "fmd_insert_for_app" ON public.faculty_member_documents
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "fmd_update_for_app" ON public.faculty_member_documents;
CREATE POLICY "fmd_update_for_app" ON public.faculty_member_documents
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fmd_delete_for_app" ON public.faculty_member_documents;
CREATE POLICY "fmd_delete_for_app" ON public.faculty_member_documents
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "fml_select_for_app" ON public.faculty_member_links;
CREATE POLICY "fml_select_for_app" ON public.faculty_member_links
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "fml_insert_for_app" ON public.faculty_member_links;
CREATE POLICY "fml_insert_for_app" ON public.faculty_member_links
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "fml_update_for_app" ON public.faculty_member_links;
CREATE POLICY "fml_update_for_app" ON public.faculty_member_links
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fml_delete_for_app" ON public.faculty_member_links;
CREATE POLICY "fml_delete_for_app" ON public.faculty_member_links
  FOR DELETE TO anon, authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 8) الصلاحيات (GRANT)
--    ملاحظة مهمة: بدون هذه السطور تبقى الجداول محجوبة عن المفتاح العام
--    (403/42501) حتى لو كانت السياسات موجودة — وهو ما حدث مع جداول
--    الأرشيف القديمة.
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_members          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_member_aliases    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_member_documents  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_member_links     TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9) (اختياري) إعادة قراءة مفردات المرتب القديمة للربط فقط
--    جدول faculty_salary_archive موجود مسبقًا لكنه محجوب عن المفتاح العام،
--    لذلك لا يستطيع الأرشيف الذكي إظهار مفردات المرتب المحفوظة سابقًا.
--    السطور التالية تفعّل القراءة فقط (SELECT) — بلا أي صلاحية كتابة.
--    إن أردتَ إبقاء الجدول محجوبًا كما هو: احذف هذا القسم.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'faculty_salary_archive'
  ) THEN
    EXECUTE 'GRANT SELECT ON public.faculty_salary_archive TO anon, authenticated';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 10) تحديث كاش PostgREST حتى تظهر الجداول الجديدة فورًا عبر الـREST API
--     (آمن التكرار: لا يفعل شيئًا إن كان الكاش محدَّثًا أصلًا)
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- نهاية الترحيل
-- ============================================================================
