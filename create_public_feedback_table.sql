-- ==============================================================================
-- إنشاء وإصلاح جدول تقييمات الخدمة والشكاوى القادمة من الصفحة الرئيسية
-- ==============================================================================
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

CREATE INDEX IF NOT EXISTS idx_public_feedback_type
ON public.public_feedback(feedback_type);

CREATE INDEX IF NOT EXISTS idx_public_feedback_created_at
ON public.public_feedback(created_at DESC);

-- تعطيل RLS للسماح باستقبال الشكاوى والتقييمات بدون قيود أمنية تعطل الإرسال
ALTER TABLE public.public_feedback DISABLE ROW LEVEL SECURITY;

-- منح كامل الصلاحيات لجميع الأدوار (الزوار anon والمستخدمين authenticated)
GRANT ALL ON TABLE public.public_feedback TO anon, authenticated, postgres, service_role;

NOTIFY pgrst, 'reload schema';
