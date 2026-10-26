-- ============================================================================
-- ترحيل آمن لنظام متابعة طلبات الخدمة (service_requests)
-- التاريخ: 2026-10-18
--
-- لا يحذف ولا يغيّر أي بيانات قديمة. كل الإضافات أعمدة جديدة (additive)
-- أو دوال/محفّزات جديدة. يمكن تشغيله مرة واحدة فقط وهو idempotent.
--
-- طريقة التشغيل: Supabase Dashboard → SQL Editor → الصق الملف كاملاً → Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) الأعمدة الجديدة
-- ----------------------------------------------------------------------------
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS directed_to text,                 -- «موجّه إلى» (مفردات المرتب + الإفادات)
  ADD COLUMN IF NOT EXISTS requested_details text,           -- «المطلوب» (الرعاية + الزمالة)
  ADD COLUMN IF NOT EXISTS applicant_notes text,             -- «ملاحظات» مقدم الطلب (اختياري)
  ADD COLUMN IF NOT EXISTS arrival_at timestamptz,            -- تاريخ/وقت الوصول الفعلي
  ADD COLUMN IF NOT EXISTS internal_stage integer NOT NULL DEFAULT 0, -- 0=لا شيء 1=طباعة 2=توقيع مدير القسم 3=توقيع أمين الكلية
  ADD COLUMN IF NOT EXISTS internal_stage_updated_at timestamptz,     -- وقت آخر تحديث للمرحلة الداخلية
  ADD COLUMN IF NOT EXISTS internal_stage_updated_by text;            -- اسم الموظف الذي حدّث المرحلة

-- حدود صحيحة للمرحلة الداخلية (لا تلمس السجلات القديمة)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_requests_internal_stage_check'
  ) THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_internal_stage_check
      CHECK (internal_stage BETWEEN 0 AND 3);
  END IF;
END $$;

-- تعبئة وقت الوصول للطلبات القديمة من وقت إنشائها (لا تغيير في المعنى،
-- القيم تُسجَّل مرة واحدة فقط ولا تُعدَّل لاحقًا)
UPDATE public.service_requests
SET arrival_at = created_at
WHERE arrival_at IS NULL AND created_at IS NOT NULL;

-- محفّز: ضبط وقت الوصول تلقائيًا عند الإدراج إن لم يُرسل
CREATE OR REPLACE FUNCTION public.service_requests_set_arrival()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.arrival_at IS NULL THEN
    NEW.arrival_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_requests_arrival ON public.service_requests;
CREATE TRIGGER trg_service_requests_arrival
  BEFORE INSERT ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.service_requests_set_arrival();

-- ----------------------------------------------------------------------------
-- 2) قواعد الحقول الإجبارية + انتقال حالة «تم الاستلام» على مستوى القاعدة
-- ----------------------------------------------------------------------------
-- الحقول الإجبارية تُفحص عند الإدراج دائمًا، وعند التحديث فقط عند تغيير
-- الحقول ذات الصلة أو نوع الخدمة (حتى لا تُحجب تحديثات الحالة للمطالبات
-- القديمة التي سُجّلت قبل وجود هذه الحقول).

CREATE OR REPLACE FUNCTION public.service_requests_validate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  st text := regexp_replace(coalesce(NEW.service_type, ''), '^\s+|\s+$', '', 'g');
  field_changed boolean;
BEGIN
  -- وقت الوصول دائمًا مسجّل
  IF NEW.arrival_at IS NULL THEN
    NEW.arrival_at := now();
  END IF;

  -- (مهم: لا يُشار إلى OLD داخل شرط INSERT — يُقيَّم بالكامل في plpgsql)
  IF TG_OP = 'INSERT' THEN
    field_changed := TRUE;
  ELSE
    field_changed := NEW.service_type IS DISTINCT FROM OLD.service_type
      OR NEW.directed_to IS DISTINCT FROM OLD.directed_to
      OR NEW.requested_details IS DISTINCT FROM OLD.requested_details;
  END IF;

  -- ---- قواعد الحقول الإجبارية لكل نوع ----
  IF field_changed THEN
    IF st IN ('مفردات مرتب', 'مفردات المرتب', 'مفرد مرتب', 'مفرد المرتب')
       AND (NEW.directed_to IS NULL OR btrim(NEW.directed_to) = '') THEN
      RAISE EXCEPTION 'حقل «موجّه إلى» إجباري لطلب مفردات المرتب';
    END IF;

    IF st IN ('الإفادات')
       AND (NEW.directed_to IS NULL OR btrim(NEW.directed_to) = '') THEN
      RAISE EXCEPTION 'حقل «موجّه إلى» إجباري لطلب الإفادات';
    END IF;

    IF st IN ('الرعاية الصحية', 'خدمة الرعاية', 'الرعاية الاجتماعية')
       AND (NEW.requested_details IS NULL OR btrim(NEW.requested_details) = '') THEN
      RAISE EXCEPTION 'حقل «المطلوب» إجباري لطلب الرعاية';
    END IF;

    IF st IN ('صندوق الزمالة', 'الزمالة')
       AND (NEW.requested_details IS NULL OR btrim(NEW.requested_details) = '') THEN
      RAISE EXCEPTION 'حقل «المطلوب» إجباري لطلب الزمالة';
    END IF;
  END IF;

  -- ---- قاعدة انتقال حالة «تم الاستلام من قبل مقدم الطلب» ----
  -- لا يجوز الوصول إليها إلا من «تم التنفيذ»، ولا تتغير تلقائيًا.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status = 'تم الاستلام من قبل مقدم الطلب'
       AND OLD.status IS DISTINCT FROM 'تم الاستلام من قبل مقدم الطلب'
       AND OLD.status IS DISTINCT FROM 'تم التنفيذ' THEN
      RAISE EXCEPTION 'لا يجوز انتقال الحالة إلى «تم الاستلام من قبل مقدم الطلب» إلا من «تم التنفيذ»';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_requests_validate ON public.service_requests;
CREATE TRIGGER trg_service_requests_validate
  BEFORE INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.service_requests_validate();

-- ----------------------------------------------------------------------------
-- 3) (اختياري — للأمان الكامل) منع التحديث المباشر من المفتاح العام
-- ----------------------------------------------------------------------------
-- النظام الحالي يعمل بالمفتاح العام (anon) مباشرة مع تحقق الصلاحيات في
-- الواجهة. لمنع أي تعديل مباشر غير مصرح به على المراحل والحالة، شغّل
-- ما يلي بعد أخذ نسخة احتياطية. ملاحظة: هذا يمنع حتى مسار الواجهة الحالي
-- ما لم تُوثَّق الجلسة عبر تسجيل الدخول؛ لذا فهو خطوة تقوية لاحقة تُفعَّل بقرار صريح:
--
-- BEGIN;
--   ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY service_requests_public_read ON public.service_requests
--     FOR SELECT USING (true);
--   CREATE POLICY service_requests_public_insert ON public.service_requests
--     FOR INSERT WITH CHECK (true);
--   -- (لا يوجد UPDATE/DELETE policy → يُمنع من المفتاح العام)
-- COMMIT;
-- بعدها تُنقل عمليات الإدارة إلى Edge Function بمفتاح خدمة (service_role).

-- ============================================================================
-- نهاية الترحيل
-- ============================================================================
