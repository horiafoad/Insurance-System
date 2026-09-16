-- ==============================================================================
-- جداول إشعارات الموبايل (Web Push)
-- يُنفذ من Supabase Dashboard -> SQL Editor ثم اضغط Run
-- ملاحظة: هذا الملف لا يُطبّق تلقائياً أثناء البناء.
-- ==============================================================================

-- 1. جدول اشتراكات الأجهزة (Device Subscriptions)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_name TEXT,
  platform TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- 2. فهرس لسرعة جلب اشتراكات المستخدم
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

-- 3. تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at
  ON public.push_subscriptions;

CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 4. الأمان: RLS مفعّل والوصول فقط عبر service_role (Edge Function)
--    لأن النظام لا يستخدم supabase.auth، يُمنع الوصول المباشر من العميل كلياً.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;
GRANT ALL ON TABLE public.push_subscriptions TO postgres;

-- 5. منع تسجيل نفس الـ endpoint مرتين (upsert يستخدم هذا القيد)
--    إضافة: لا يُحذف الصف، بل يُعاد تسجيله أو يُعطَّل عبر is_active.