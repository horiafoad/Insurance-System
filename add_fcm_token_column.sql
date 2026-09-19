-- ==============================================================================
-- إضافة عمود fcm_token لجدول push_subscriptions (إشعارات تطبيق الأندرويد الأصلي)
-- يُنفذ من Supabase Dashboard -> SQL Editor ثم Run (آمن/idempotent)
-- ==============================================================================

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_fcm_token
  ON public.push_subscriptions(fcm_token)
  WHERE fcm_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';