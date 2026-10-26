-- ============================================================================
-- 20261026_claims_plan_four_installments.sql
-- ----------------------------------------------------------------------------
-- يحل مكان claims_ensure_installment_plan بنفس السلوك الآمن، مع توزيع
-- المتبقي على الأقساط الأربعة بدل قسط واحد.
--
-- الضمانات:
--   • لا يحذف ولا يعدّل أي قسط موجود — الإضافات فقط.
--   • idempotent: لو الخطة مكتملة يرجع 0 ولا يكتب شيئًا.
--   • يحافظ على فرق المدفوع (paid_amount) كقسط مسدد مستقل.
--   • يقسّم المتبقي على الخانات الحرة (حتى 4) بدقة قرشين، والباقي في الأخير.
--   • يضيف تاريخ استحقاق (due_date) لكل قسط جديد: شهر بين كل قسط، بدءًا من
--     تاريخ التحويل إلى «جاري السداد» (أو تاريخ اليوم لو غير مسجل).
-- ============================================================================

ALTER TABLE public.claim_installments
  ADD COLUMN IF NOT EXISTS due_date date;

CREATE OR REPLACE FUNCTION public.claims_ensure_installment_plan(p_claim_id bigint)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_total       numeric(18,2);
  v_paid        numeric(18,2);
  v_sum         numeric(18,2);
  v_paid_sum    numeric(18,2);
  v_gap_paid    numeric(18,2);
  v_gap_pending numeric(18,2);
  v_free        integer;
  v_free_count  integer;
  v_created     integer := 0;
  v_share       numeric(18,2);
  v_index       integer := 0;
  v_base_date   date;
BEGIN
  SELECT total_amount, paid_amount, COALESCE(started_at::date, current_date)
    INTO v_total, v_paid, v_base_date
    FROM public.claims
   WHERE id = p_claim_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'مطالبة غير موجودة: %', p_claim_id;
  END IF;

  v_total := COALESCE(v_total, 0);
  v_paid  := COALESCE(v_paid, 0);

  SELECT COALESCE(SUM(amount), 0),
         COALESCE(SUM(CASE WHEN paid THEN amount ELSE 0 END), 0)
    INTO v_sum, v_paid_sum
    FROM public.claim_installments
   WHERE claim_id = p_claim_id;

  -- الخطة مكتملة بالفعل.
  IF v_sum >= v_total - 0.01 THEN
    RETURN 0;
  END IF;

  -- فرق المدفوع يُسجَّل كقسط مسدد.
  v_gap_paid := v_paid - v_paid_sum;
  IF v_gap_paid > 0.01 THEN
    SELECT MIN(n) INTO v_free
      FROM generate_series(1, 4) n
     WHERE NOT EXISTS (
       SELECT 1 FROM public.claim_installments
        WHERE claim_id = p_claim_id AND installment_number = n
     );

    IF v_free IS NULL THEN
      RAISE EXCEPTION 'لا توجد خانة قسط متاحة لفرق المدفوع (%)', v_gap_paid;
    END IF;

    INSERT INTO public.claim_installments
      (claim_id, installment_number, amount, paid, paid_at, due_date, notes)
    VALUES
      (p_claim_id, v_free, v_gap_paid, TRUE, now(), v_base_date,
       'مبلغ مدفوع مسجل من قبل على المطالبة');

    v_created := v_created + 1;
    v_sum := v_sum + v_gap_paid;
  END IF;

  -- توزيع المتبقي على الخانات الحرة (1..4) بدقة قرشين.
  v_gap_pending := v_total - v_sum;
  IF v_gap_pending > 0.01 THEN
    SELECT COUNT(*) INTO v_free_count
      FROM generate_series(1, 4) n
     WHERE NOT EXISTS (
       SELECT 1 FROM public.claim_installments
        WHERE claim_id = p_claim_id AND installment_number = n
     );

    IF v_free_count = 0 THEN
      RAISE EXCEPTION 'لا توجد خانة قسط متاحة للمتبقي (%)', v_gap_pending;
    END IF;

    v_share := ROUND(v_gap_pending / v_free_count, 2);

    FOR v_free IN
      SELECT n FROM generate_series(1, 4) n
       WHERE NOT EXISTS (
         SELECT 1 FROM public.claim_installments
          WHERE claim_id = p_claim_id AND installment_number = n
       )
      ORDER BY n
    LOOP
      v_index := v_index + 1;
      INSERT INTO public.claim_installments
        (claim_id, installment_number, amount, paid, due_date)
      VALUES
        (p_claim_id, v_free,
         CASE WHEN v_index = v_free_count
              THEN v_gap_pending - (v_share * (v_free_count - 1))
              ELSE v_share
          END,
         FALSE,
         (v_base_date + make_interval(months => v_free - 1))::date);

      v_created := v_created + 1;
    END LOOP;
  END IF;

  PERFORM public.claims_recalc_amounts(p_claim_id);
  RETURN v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claims_ensure_installment_plan(bigint)
  TO anon, authenticated, service_role;
