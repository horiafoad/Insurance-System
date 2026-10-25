-- ============================================================================
-- إضافة عمود دور تبليغات هيئة التدريس لجدول المستخدمين
-- التاريخ: 2026-10-25
--
-- الهدف:
--   إضافة عمود faculty_notification_role لتخزين دور المستخدم في نظام
--   تبليغات هيئة التدريس (creator | input_reviewer | final_reviewer)
--
-- الضمانات:
--   • إضافة آمنة (ADD COLUMN IF NOT EXISTS)
--   • لا يحذف ولا يعدّل أي بيانات
--   • idempotent: يمكن تشغيل الملف أكثر من مرة
--
-- طريقة التشغيل:
--   Supabase Dashboard → SQL Editor → New query → الصق الملف كاملاً → Run.
-- ============================================================================

-- إضافة عمود الدور
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS faculty_notification_role text;

-- إضافة قيد اختياري للتحقق من القيم المسموحة
ALTER TABLE public.users
ADD CONSTRAINT users_faculty_notification_role_check
  CHECK (faculty_notification_role IN ('creator', 'input_reviewer', 'final_reviewer') OR faculty_notification_role IS NULL);

-- ============================================================================
-- نهاية الترحيل
-- ============================================================================
