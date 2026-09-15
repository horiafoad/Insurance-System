-- ============================================================
-- نظام الصلاحيات المستقل (فصل الصلاحيات عن الإدارة التنظيمية)
--
-- أضِف عمود "permissions" لجدول users فقط — بدون أي سكب تلقائي.
-- التوافق الرجعي: أي مستخدم قديم ليس له قيمة (NULL) يظل بوصول كامل
-- حتى يحدِّد له المسؤول صلاحياته صراحةً من صفحة إدارة المستخدمين.
-- المستخدمون الجدد يُنشؤون بدون أي صلاحية حتى يختارها المسؤول يدويًا.
-- القيم المحتملة: letters | entitlements | requests | reports |
--                user_management | org_structure | system_settings
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions jsonb;

COMMENT ON COLUMN public.users.permissions IS
  'مصفوفة الصلاحيات المستقلة للعمود. NULL = حساب قديم بوصول كامل، [] = بدون صلاحيات.';

NOTIFY pgrst, 'reload schema';