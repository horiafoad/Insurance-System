-- ==============================================================================
-- توصيات أمنية لقاعدة البيانات — راجِع هذا الملف قبل تنفيذه يدويًا
-- (لا يُنفَّذ تلقائيًا من التطبيق)
--
-- ملاحظة مهمة: التطبيق يعمل حاليًا بمفتاح anon فقط بدون Supabase Auth (JWT)،
-- وتسجيل الدخول يتم بمقارنة كلمة المرور client-side. لذلك أي سياسة RLS
-- تقيّد قراءة عمود password ستُعطّل تسجيل الدخول حتى يُنقَل التحقق
-- إلى Edge Function (انظر القسم 3). الأجزاء أدناه مرتبة بحيث لا تُعطّل التطبيق.
-- ==============================================================================

-- --------------------------------------------------------------------------
-- 1) تغيير كلمة المرور الافتراضية فورًا (خطوة عاجلة — تُنفَّذ الآن)
--    كلمة المرور '2322003' منشورة في ملفات SQL المتتبعة في Git.
--    استبدلها بكلمة قوية فور موافقتك:
-- --------------------------------------------------------------------------
-- UPDATE public.users SET password = 'ضع_كلمة_قوية_هنا' WHERE username = 'horia';

-- --------------------------------------------------------------------------
-- 2) تفعيل RLS على جدول المستخدمين مع سياسات تحافظ على وظائف التطبيق الحالية
--    (قراءة/كتابة المستخدمين تبقى للأنون كما هي لتستمر إدارة المستخدمين
--    من داخل التطبيق؛ الفائدة هنا توثيق السياسات وتمهيد التقييد لاحقًا).
-- --------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON public.users;
CREATE POLICY "anon_select_users" ON public.users
  FOR SELECT TO anon USING (true);

-- بعد نقل تسجيل الدخول إلى Edge Function (القسم 3) احذف هذه السياسة
-- واستبدلها بسياسة لا تسمح بقراءة عمود password:
--   CREATE POLICY "anon_select_users" ON public.users
--     FOR SELECT TO anon USING (true);
--   REVOKE SELECT ("password") ON public.users FROM anon;  -- حسب إمكانية إخفاء الأعمدة

DROP POLICY IF EXISTS "anon_manage_users" ON public.users;
CREATE POLICY "anon_manage_users" ON public.users
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 3) تشفير كلمات المرور (يوصى به بشدة) — الخطة الصحيحة طويلة المدى
--    بمجرد نقل التحقق إلى Edge Function جديدة (مثل auth-login) تعمل بـ bcrypt:
--    أ) إضافة دالة تشفير:
-- --------------------------------------------------------------------------
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;
--
-- UPDATE public.users SET password = crypt(password, gen_salt('bf', 10));
--
-- ب) في Edge Function تسجيل الدخول يتم:
--    SELECT id, username, password, full_name, role FROM users
--    WHERE username = $1
--    ثم المقارنة بـ bcrypt.compare، وبعدها تُقيَّد سياسة القراءة
--    لئلا يقرأ العميل كلمات المرور بعد الآن (كما في نهاية القسم 2).
--    وعندها يُحذف عمود password من استعلام App.jsx.

-- --------------------------------------------------------------------------
-- 4) عند الانتقال إلى Supabase Auth (خطة مستقبلية) — خطوات الانتقال:
--    - إنشاء مشروع Supabase Auth وتفعيل JWT في كل الطلبات.
--    - ثم تفعيل RLS على كل الجداول وفقًا للأدوار:
-- --------------------------------------------------------------------------
-- ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.performance_evaluations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.course_registrations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.public_feedback ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
--
-- -- عام: قراءة مسموحة، والكتابة تُنظَّم لاحقًا حسب الدور
-- CREATE POLICY "public_read" ON public.service_requests
--   FOR SELECT TO anon, authenticated USING (true);
--
-- -- التطبيق يحتاج إعادة ضبط قاعدة الاتصال لتضمين التوكن قبل هذا القسم.

-- --------------------------------------------------------------------------
-- 5) تحديث كاش PostgREST بعد أي تغيير في السياسات
-- --------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';