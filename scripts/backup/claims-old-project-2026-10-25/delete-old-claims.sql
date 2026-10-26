-- ============================================================================
-- حذف المطالبات القديمة (367 صفًا) من المشروع القديم jpybzalxcezxhokzmwdx
-- التاريخ: 2026-10-25
--
-- نطاق العمل: جدول public.claims فقط.
-- لا يحذف أي جدول آخر ولا أي بيانات أخرى (مستخدمون، موظفون، أرشيف، خطابات،
-- إشعارات، إعدادات، صلاحيات، ... إلخ).
--
-- قبل الحذف: إنشاء نسخة داخلية كاملة في public.claims_backup_20261025
-- ============================================================================

BEGIN;

-- 1) نسخة احتياطية داخلية كاملة (full fidelity)
DROP TABLE IF EXISTS public.claims_backup_20261025;
CREATE TABLE public.claims_backup_20261025 AS
  SELECT * FROM public.claims;

-- 2) التحقق من التطابق قبل الحذف
DO $$
DECLARE
  v_claims bigint;
  v_backup bigint;
  v_diff   bigint;
BEGIN
  SELECT count(*) INTO v_claims FROM public.claims;
  SELECT count(*) INTO v_backup FROM public.claims_backup_20261025;

  IF v_claims <> 367 THEN
    RAISE EXCEPTION 'Aborting: expected 367 old claims, found %.', v_claims;
  END IF;

  IF v_backup <> v_claims THEN
    RAISE EXCEPTION 'Aborting: backup has % rows but claims has %.', v_backup, v_claims;
  END IF;

  SELECT count(*) INTO v_diff
  FROM (
    (SELECT * FROM public.claims EXCEPT SELECT * FROM public.claims_backup_20261025)
    UNION ALL
    (SELECT * FROM public.claims_backup_20261025 EXCEPT SELECT * FROM public.claims)
  ) d;

  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'Aborting: backup differs from claims in % rows.', v_diff;
  END IF;

  RAISE NOTICE 'Backup verified: % rows identical.', v_backup;
END $$;

-- 3) الحذف (جدول المطالبات فقط)
DELETE FROM public.claims;

-- 4) التحقق النهائي
DO $$
DECLARE
  v_claims bigint;
  v_backup bigint;
BEGIN
  SELECT count(*) INTO v_claims FROM public.claims;
  SELECT count(*) INTO v_backup FROM public.claims_backup_20261025;

  IF v_claims <> 0 THEN
    RAISE EXCEPTION 'Aborting: % claims still present after delete.', v_claims;
  END IF;

  IF v_backup <> 367 THEN
    RAISE EXCEPTION 'Aborting: backup row count changed to %.', v_backup;
  END IF;

  RAISE NOTICE 'Delete OK. claims=0, claims_backup_20261025=%', v_backup;
END $$;

COMMIT;
