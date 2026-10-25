-- ============================================================================
-- تجهيز خطة الأقساط لمطالبة قبل تسجيل أي سداد
-- التاريخ: 2026-10-25
--
-- السبب: دالة claims_recalc_amounts تعيد حساب total_amount من مجموع الأقساط.
-- لذلك أي مطالبة لا تحتوي أقساطًا (أو تحتوي أقساطًا لا تساوي إجماليها) يجب
-- تهيئتها أولًا، وإلا فسيتم فقدان الإجمالي الأصلي عند إضافة قسط جديد.
--
-- الدالة idempotent: لا تفعل شيئًا إذا كانت خطة الأقساط مكتملة، وتعمل داخل
-- معاملة واحدة (استدعاء واحد) فلا تبقى المطالبة في حالة وسيطة.
-- ============================================================================

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
  v_created     integer := 0;
BEGIN
  SELECT total_amount, paid_amount
    INTO v_total, v_paid
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

  -- الجزء المسجل كمدفوع لكنه غير موزع على أقساط.
  v_gap_paid := v_paid - v_paid_sum;
  IF v_gap_paid > 0.01 THEN
    SELECT MIN(n) INTO v_free
      FROM generate_series(1, 4) n
     WHERE NOT EXISTS (
       SELECT 1 FROM public.claim_installments
        WHERE claim_id = p_claim_id AND installment_number = n
     );

    IF v_free IS NULL THEN
      RAISE EXCEPTION 'لا توجد خانة قسط متاحة لتسجيل المبلغ المدفوع (%)', v_gap_paid;
    END IF;

    INSERT INTO public.claim_installments
      (claim_id, installment_number, amount, paid, paid_at, notes)
    VALUES
      (p_claim_id, v_free, v_gap_paid, TRUE, now(),
       'مبلغ مدفوع مسجل مسبقًا قبل تفصيل الأقساط');

    v_created := v_created + 1;
    v_sum := v_sum + v_gap_paid;
  END IF;

  -- الجزء المتبقي غير المسدد.
  v_gap_pending := v_total - v_sum;
  IF v_gap_pending > 0.01 THEN
    SELECT MIN(n) INTO v_free
      FROM generate_series(1, 4) n
     WHERE NOT EXISTS (
       SELECT 1 FROM public.claim_installments
        WHERE claim_id = p_claim_id AND installment_number = n
     );

    IF v_free IS NULL THEN
      RAISE EXCEPTION 'لا توجد خانة قسط متاحة لتسجيل المبلغ المتبقي (%)', v_gap_pending;
    END IF;

    INSERT INTO public.claim_installments
      (claim_id, installment_number, amount, paid)
    VALUES
      (p_claim_id, v_free, v_gap_pending, FALSE);

    v_created := v_created + 1;
  END IF;

  PERFORM public.claims_recalc_amounts(p_claim_id);
  RETURN v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claims_ensure_installment_plan(bigint)
  TO anon, authenticated, service_role;
