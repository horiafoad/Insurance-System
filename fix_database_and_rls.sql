-- ==============================================================================
-- سكريبت إصلاح وتفعيل قاعدة البيانات بالكامل لنظام الاستحقاقات
-- انسخ هذا الكود بالكامل والصقه في Supabase -> SQL Editor ثم اضغط Run
-- ==============================================================================

-- 1. جدول التقييمات والشكاوى (الصفحة الرئيسية)
CREATE TABLE IF NOT EXISTS public.public_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_type VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(50),
  rating INTEGER,
  message TEXT,
  source_page VARCHAR(50) DEFAULT 'الرئيسية',
  status VARCHAR(30) DEFAULT 'جديد',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- تعطيل RLS للسماح باستقبال الشكاوى والتقييمات من الزوار بدون قيود
ALTER TABLE public.public_feedback DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.public_feedback TO anon, authenticated, postgres, service_role;

-- 2. جدول الطلبات الواردة (مفردات المرتب وغيرها)
CREATE TABLE IF NOT EXISTS public.service_requests (
  id BIGSERIAL PRIMARY KEY,
  service_type VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  job_title VARCHAR(100),
  phone VARCHAR(50),
  request_month INTEGER,
  request_year INTEGER,
  certificate_type VARCHAR(100),
  notes TEXT,
  detail_scores JSONB,
  status VARCHAR(30) DEFAULT 'جديد',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS certificate_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.service_requests DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.service_requests TO anon, authenticated, postgres, service_role;

-- 3. جدول تقييم الأداء والجودة الداخلي
CREATE TABLE IF NOT EXISTS public.performance_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id INTEGER,
  evaluation_month VARCHAR(30) NOT NULL,
  evaluation_year INTEGER NOT NULL,
  completion_rate DECIMAL(5,2) DEFAULT 0,
  on_time_rate DECIMAL(5,2) DEFAULT 0,
  accuracy_rate DECIMAL(5,2) DEFAULT 0,
  speed_rate DECIMAL(5,2) DEFAULT 0,
  review_rate DECIMAL(5,2) DEFAULT 0,
  upload_rate DECIMAL(5,2) DEFAULT 0,
  organization_rate DECIMAL(5,2) DEFAULT 0,
  total_score DECIMAL(5,2) DEFAULT 0,
  grade VARCHAR(30) DEFAULT 'يحتاج تحسين',
  notes TEXT,
  evaluator_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.performance_evaluations
  ADD COLUMN IF NOT EXISTS employee_id INTEGER;
ALTER TABLE public.performance_evaluations
  ADD COLUMN IF NOT EXISTS detail_scores JSONB;
CREATE INDEX IF NOT EXISTS idx_performance_evaluations_employee_id
  ON public.performance_evaluations(employee_id);

ALTER TABLE public.performance_evaluations DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.performance_evaluations TO anon, authenticated, postgres, service_role;

-- 4. جدول الدورات التدريبية
CREATE TABLE IF NOT EXISTS public.training_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_name VARCHAR(200) NOT NULL,
  course_code VARCHAR(50),
  description TEXT,
  instructor VARCHAR(100),
  location VARCHAR(100),
  start_date DATE,
  end_date DATE,
  duration_hours INTEGER,
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,
  status VARCHAR(30) DEFAULT 'مكتمل',
  target_audience VARCHAR(100),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.training_courses DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.training_courses TO anon, authenticated, postgres, service_role;

-- 5. جدول تسجيل الحضور في الدورات
CREATE TABLE IF NOT EXISTS public.course_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES public.training_courses(id) ON DELETE CASCADE,
  employee_name VARCHAR(150) NOT NULL,
  employee_code VARCHAR(50),
  department VARCHAR(100),
  registration_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attendance_status VARCHAR(30) DEFAULT 'مسجل',
  completion_status VARCHAR(30) DEFAULT 'قيد الانتظار',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.course_registrations DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.course_registrations TO anon, authenticated, postgres, service_role;

-- 6. جدول المستخدمين
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO anon, authenticated, postgres, service_role;

-- إضافة المستخدم الافتراضي
INSERT INTO public.users (username, password, full_name, role)
VALUES ('horia', '2322003', 'المدير الرئيسي', 'super_admin')
ON CONFLICT (username) DO UPDATE SET
  password = EXCLUDED.password,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  updated_at = NOW();

-- 7. جدول المهام
CREATE TABLE IF NOT EXISTS public.tasks (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  responsible VARCHAR(100),
  received_date DATE,
  due_date DATE,
  status VARCHAR(30) DEFAULT 'not_started',
  reviewed BOOLEAN DEFAULT FALSE,
  uploaded BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.tasks TO anon, authenticated, postgres, service_role;

-- 8. جدول المطالبات
CREATE TABLE IF NOT EXISTS public.claims (
  id BIGSERIAL PRIMARY KEY,
  sheet_name VARCHAR(100),
  claimant_name VARCHAR(150),
  claim_number VARCHAR(100),
  claim_date DATE,
  amount NUMERIC(12,2),
  status VARCHAR(50),
  notes TEXT,
  row_number INTEGER,
  data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.claims DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.claims TO anon, authenticated, postgres, service_role;

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';
