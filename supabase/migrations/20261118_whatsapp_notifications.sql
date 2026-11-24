-- ============================================================================
-- سجل إشعارات WhatsApp + بيانات الربط
-- التاريخ: 2026-11-18
--
-- آمن لإعادة التشغيل (idempotent) ولا يحذف أي بيانات موجودة.
-- لا يعدّل جدول service_requests ولا أي جدول قائم.
--
-- طريقة التشغيل: Supabase Dashboard -> SQL Editor -> الصق الملف كاملاً -> Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) جدول سجل الإشعارات
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  -- رقم الطلب يُخزَّن نصًا حتى يعمل مع service_requests.id سواء كان BIGSERIAL أو UUID.
  request_id text NOT NULL,
  request_number text,
  recipient_phone text,
  -- الحالة التي أدت إلى الإرسال (قيمة موحّدة: جديدة / قيد التنفيذ / تم التنفيذ / مرفوضة / ...)
  trigger_status text,
  -- created = إشعار استلام طلب جديد، status_change = تغيير حالة بواسطة الموظف
  event_type text NOT NULL DEFAULT 'status_change',
  message_text text,
  -- حالة الإرسال: pending / sending / sent / failed / skipped
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  dedupe_key text NOT NULL,
  dry_run boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  sent_at timestamptz
);

-- إضافة الأعمدة عند إعادة تشغيل السكريبت على نسخة أُنشئت يدويًا.
ALTER TABLE public.whatsapp_notifications
  ADD COLUMN IF NOT EXISTS request_number text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS trigger_status text,
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'status_change',
  ADD COLUMN IF NOT EXISTS message_text text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- ضمان وجود dedupe_key على النسخ القديمة قبل إنشاء الفهرس الفريد.
UPDATE public.whatsapp_notifications
SET dedupe_key = request_id || ':' || event_type || ':' || COALESCE(trigger_status, '') || ':' || created_at::text
WHERE dedupe_key IS NULL OR btrim(dedupe_key) = '';

ALTER TABLE public.whatsapp_notifications
  ALTER COLUMN dedupe_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_notifications_dedupe_key_uidx
  ON public.whatsapp_notifications(dedupe_key);

CREATE INDEX IF NOT EXISTS whatsapp_notifications_request_idx
  ON public.whatsapp_notifications(request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_notifications_status_idx
  ON public.whatsapp_notifications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_notifications_created_idx
  ON public.whatsapp_notifications(created_at DESC);

-- ----------------------------------------------------------------------------
-- 2) تحديث updated_at تلقائيًا
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_whatsapp_notifications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_whatsapp_notifications
  ON public.whatsapp_notifications;

CREATE TRIGGER trg_touch_whatsapp_notifications
  BEFORE UPDATE ON public.whatsapp_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_whatsapp_notifications_updated_at();

-- ----------------------------------------------------------------------------
-- 3) الأمان
--
-- لا يصل الجدول إلى المتصفح إطلاقًا. كل القراءة/الكتابة تتم من Edge Functions
-- بمفتاح service_role بعد التحقق من جلسة الموظف وصلاحية "requests".
-- لذلك نفعّل RLS ولا نضيف أي policy لـ anon/authenticated.
-- ----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_notifications FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_notifications TO service_role;

COMMENT ON TABLE public.whatsapp_notifications IS
  'سجل إشعارات WhatsApp المرسلة للعملاء. الوصول عبر Edge Functions فقط.';
COMMENT ON COLUMN public.whatsapp_notifications.trigger_status IS
  'حالة الطلب التي أدت إلى الإشعار.';
COMMENT ON COLUMN public.whatsapp_notifications.status IS
  'حالة الإرسال: pending/sending/sent/failed/skipped.';

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';
