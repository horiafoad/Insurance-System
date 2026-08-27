-- ==============================================================================
-- إصلاح مشكلة دخول الإدارة
-- انسخ هذا الكود بالكامل والصقه في Supabase -> SQL Editor ثم اضغط Run
-- ==============================================================================

-- 1. تعطيل RLS على جدول المستخدمين
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. إعطاء صلاحيات كاملة
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO anon, authenticated, postgres, service_role;

-- 3. إضافة/تحديث المستخدم الافتراضي
INSERT INTO public.users (username, password, full_name, role)
VALUES ('horia', '2322003', 'المدير الرئيسي', 'super_admin')
ON CONFLICT (username) DO UPDATE SET
  password = EXCLUDED.password,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  updated_at = NOW();

-- 4. التحقق من إضافة المستخدم
SELECT * FROM public.users;

-- 5. تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';
