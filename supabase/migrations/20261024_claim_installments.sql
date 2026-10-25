-- ============================================================================
-- ترحيل آمن لنظام الأقساط (claim_installments)
-- التاريخ: 2026-10-24
--
-- لا يحذف ولا يغيّر أي البيانات القديمة. كل الإضافات أعمدة جديدة (additive)
-- أو جدول جديد. يمكن تشغيله مرة واحدة فقط وهو idempotent.
--
-- طريقة التشغيل: Supabase Dashboard → SQL Editor → الصق الملف كاملاً → Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) جدول الأقاتس
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.claim_installments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  claim_id bigint NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number BETWEEN 1 AND 4),
  amount numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  receipt_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, installment_number)
);

-- فهرس لتسريع الاستفسارات
CREATE INDEX IF NOT EXISTS idx_claim_installments_claim_id
  ON public.claim_installments (claim_id);

-- مفتاح فريد لمنع التكرار عند الاستيراد
CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_installments_claim_num
  ON public.claim_installments (claim_id, installment_number);

-- صلاحيات الوصول من التطبيق (نفس صلاحيات جدول المطالبات)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_installments
  TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.claim_installments_id_seq
  TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) الأعمدة الجديدة على جدول المطالبات
-- ----------------------------------------------------------------------------
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS total_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS paid_amount numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_reason text,
  ADD COLUMN IF NOT EXISTS settlement_notes text;

-- مفتاح فريد لمنع تكرار المطالبة عند الاستيراد (based on row_number + sheet_name)
-- نستخدم UNIQUE INDEX بدل constraint لتفعيل ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS uq_claims_sheet_row
  ON public.claims (sheet_name, row_number)
  WHERE row_number > 0;

-- ----------------------------------------------------------------------------
-- 3) دالة مساعدة لحساب الأRemaining المتبقي
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claims_recalc_amounts(p_claim_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric(18,2);
  v_paid numeric(18,2);
BEGIN
  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(CASE WHEN paid THEN amount ELSE 0 END), 0)
  INTO v_total, v_paid
  FROM public.claim_installments
  WHERE claim_id = p_claim_id;

  UPDATE public.claims
  SET
    total_amount = v_total,
    paid_amount = v_paid,
    remaining_amount = v_total - v_paid,
    updated_at = now()
  WHERE id = p_claim_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4) محفّز: حساب المبالغ تلقائيًا عند إضافة/تعديل قسط
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_installments_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_installments_audit ON public.claim_installments;
CREATE TRIGGER trg_claim_installments_audit
  BEFORE INSERT OR UPDATE ON public.claim_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_installments_audit();

-- محفّز: بعد إضافة أو تعديل قسط،حدّث المبالغ في جدول المطالبات
CREATE OR REPLACE FUNCTION public.claim_installments_after_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.claims_recalc_amounts(NEW.claim_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_installments_after_insert ON public.claim_installments;
DROP TRIGGER IF EXISTS trg_claim_installments_after_update ON public.claim_installments;

CREATE TRIGGER trg_claim_installments_after_insert
  AFTER INSERT ON public.claim_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_installments_after_change();

CREATE TRIGGER trg_claim_installments_after_update
  AFTER UPDATE ON public.claim_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_installments_after_change();

-- ----------------------------------------------------------------------------
-- 5) تسوية إدارية آمنة ( settling )
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claims_settle_claim(
  p_claim_id bigint,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining numeric(18,2);
BEGIN
  SELECT remaining_amount INTO v_remaining
  FROM public.claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'مطالبة غير موجودة: %', p_claim_id;
  END IF;

  IF v_remaining > 0 AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'يجب تزويد سبب تسوية إدارية عند وجود رصد مستحق.';
  END IF;

  UPDATE public.claims
  SET
    payment_status = 'خالي الطرف',
    settled_at = now(),
    settlement_reason = p_reason,
    settlement_notes = p_notes,
    updated_at = now()
  WHERE id = p_claim_id;

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- نهاية الترحيل
-- ============================================================================