-- ==============================================================================
-- نظام الإشعارات داخل النظام (جرس الإشعارات) + Web Push
-- يُنفذ من Supabase Dashboard -> SQL Editor ثم اضغط Run
-- السكريبت آمن لإعادة التشغيل (idempotent) — لا يحذف أي بيانات موجودة.
-- ==============================================================================

-- 1. جدول الإشعارات (المصدر الأساسي لجرس الإشعارات والعداد غير المقروء)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  body TEXT,
  reference_id TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. فهارس للبحث السريع (جلب إشعارات المستخدم + عدد غير المقروء)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read);

-- 3. الأمان: نفس نمط بقية جداول النظام (RLS معطّل — الدخول مخصص للمشروع)
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.notifications TO anon, authenticated, postgres, service_role;

-- ------------------------------------------------------------------------------
-- 3.1 ضمان وجود الأعمدة التي تحتاجها محفزات الإشعارات في جدول users
--     (تُنشأها create_org_structure.sql و create_user_permissions.sql) —
--     حتى يعمل هذا السكريبت مستقلاً بأمان دون فشل.
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department_id BIGINT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS permissions JSONB;

-- ==============================================================================
-- 4. محفز: إشعار فوري عند وصول طلب إلكتروني جديد (service_requests)
--    المتلقون: كل من يملك صلاحية "requests" أو حسابات قديمة بوصول كامل
--    أو الأدوار super_admin / admin (نفس منطق push-notifications).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_request_notifications()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, reference_id, data)
  SELECT
    u.id,
    'new_request',
    '🔔 طلب جديد',
    'وصل طلب جديد يحتاج إلى المتابعة',
    NEW.id::text,
    jsonb_build_object(
      'request_id', NEW.id,
      'requester_name', NEW.name,
      'service_type', NEW.service_type,
      'status', NEW.status
    )
  FROM public.users u
  WHERE u.id IS NOT NULL
    AND (
      u.permissions IS NULL
      OR u.role IN ('super_admin', 'admin')
      OR (u.permissions IS NOT NULL AND u.permissions ? 'requests')
    )
    -- منع التكرار: إشعار واحد فقط لكل مزيج (type + reference_id + user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = u.id
        AND n.type = 'new_request'
        AND n.reference_id = NEW.id::text
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_request_notifications
  ON public.service_requests;

CREATE TRIGGER trg_create_request_notifications
  AFTER INSERT ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.create_request_notifications();

-- ==============================================================================
-- 5. دالة المحفز: إشعار فوري عند وصول خطاب إلى قسم (letter_movements)
--    المتلقون: مستخدمو القسم الهدف فقط + المدراء (super_admin / admin).
--    ملاحظة: تُنشأ المحطة الأولى بحالة in_progress بدون استلام عند تسجيل خطاب
--    جديد، وكذلك عند التسليم للمحطة التالية — فلا يصلك إشعار إلا للقسم المعني.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_letter_notifications()
RETURNS TRIGGER AS $$
DECLARE
  dept_name TEXT;
  letter_subject TEXT;
  letter_no TEXT;
BEGIN
  SELECT
    d.name, l.subject, l.letter_number
    INTO dept_name, letter_subject, letter_no
  FROM public.letters l
  LEFT JOIN public.letter_departments d ON d.id = NEW.department_id
  WHERE l.id = NEW.letter_id
  LIMIT 1;

  INSERT INTO public.notifications (user_id, type, title, body, reference_id, data)
  SELECT
    u.id,
    'new_letter',
    '📩 خطاب جديد',
    'وصل خطاب جديد إلى قسم ' || COALESCE(dept_name, ''),
    NEW.letter_id::text,
    jsonb_build_object(
      'letter_id', NEW.letter_id,
      'letter_number', letter_no,
      'subject', letter_subject,
      'department_id', NEW.department_id,
      'department_name', dept_name
    )
  FROM public.users u
  WHERE u.id IS NOT NULL
    AND (
      u.department_id = NEW.department_id
      OR u.role IN ('super_admin', 'admin')
    )
    -- منع التكرار: إشعار واحد فقط لكل مزيج (type + reference_id + user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = u.id
        AND n.type = 'new_letter'
        AND n.reference_id = NEW.letter_id::text
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إدراج محطة جديدة (تسجيل خطاب جديد -> المحطة الأولى in_progress بدون استلام)
DROP TRIGGER IF EXISTS trg_letter_notifications_insert
  ON public.letter_movements;

CREATE TRIGGER trg_letter_notifications_insert
  AFTER INSERT ON public.letter_movements
  FOR EACH ROW
  WHEN (
    NEW.status = 'in_progress'
    AND NEW.received_at IS NULL
    AND NEW.sent_at IS NULL
  )
  EXECUTE FUNCTION public.create_letter_notifications();

-- تسليم إلى محطة جديدة (تنتقل المحطة التالية إلى in_progress بدون استلام)
DROP TRIGGER IF EXISTS trg_letter_notifications_update
  ON public.letter_movements;

CREATE TRIGGER trg_letter_notifications_update
  AFTER UPDATE OF status ON public.letter_movements
  FOR EACH ROW
  WHEN (
    NEW.status = 'in_progress'
    AND NEW.received_at IS NULL
    AND NEW.sent_at IS NULL
    AND OLD.status IS DISTINCT FROM 'in_progress'
  )
  EXECUTE FUNCTION public.create_letter_notifications();

-- ==============================================================================
-- 6. إضافة جدول notifications إلى نشر Realtime لجعل العداد لحظيًا بدون Refresh
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'SKIP notifications (table does not exist)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    RAISE NOTICE 'ADDED notifications TO supabase_realtime';
  ELSE
    RAISE NOTICE 'SKIP notifications (already published)';
  END IF;
END
$$;

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';