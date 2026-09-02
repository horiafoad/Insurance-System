-- إنشاء جدول تقييم الأداء والجودة
CREATE TABLE IF NOT EXISTS performance_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id INTEGER,
  evaluation_month VARCHAR(20) NOT NULL,
  evaluation_year INTEGER NOT NULL,
  completion_rate DECIMAL(5,2) DEFAULT 0,
  on_time_rate DECIMAL(5,2) DEFAULT 0,
  accuracy_rate DECIMAL(5,2) DEFAULT 0,
  speed_rate DECIMAL(5,2) DEFAULT 0,
  review_rate DECIMAL(5,2) DEFAULT 0,
  upload_rate DECIMAL(5,2) DEFAULT 0,
  organization_rate DECIMAL(5,2) DEFAULT 0,
  total_score DECIMAL(5,2) DEFAULT 0,
  grade VARCHAR(20) DEFAULT 'يحتاج تحسين',
  notes TEXT,
  evaluator_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE performance_evaluations
  ADD COLUMN IF NOT EXISTS employee_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_performance_evaluations_employee_id
  ON performance_evaluations(employee_id);

-- إنشاء جدول الدورات التدريبية
CREATE TABLE IF NOT EXISTS training_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_name VARCHAR(200) NOT NULL,
  course_code VARCHAR(50) UNIQUE,
  description TEXT,
  instructor VARCHAR(100),
  location VARCHAR(100),
  start_date DATE,
  end_date DATE,
  duration_hours INTEGER,
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'مجدول' CHECK (status IN ('مجدول', 'جاري', 'مكتمل', 'ملغي')),
  target_audience VARCHAR(100),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء جدول تسجيل الموظفين في الدورات
CREATE TABLE IF NOT EXISTS course_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES training_courses(id) ON DELETE CASCADE,
  employee_name VARCHAR(100) NOT NULL,
  employee_code VARCHAR(50),
  department VARCHAR(100),
  registration_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attendance_status VARCHAR(20) DEFAULT 'مسجل' CHECK (attendance_status IN ('مسجل', 'حضر', 'غائب', 'اعتذر')),
  completion_status VARCHAR(20) DEFAULT 'قيد الانتظار' CHECK (completion_status IN ('قيد الانتظار', 'مكتمل', 'غير مكتمل')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_performance_evaluations_month_year ON performance_evaluations(evaluation_month, evaluation_year);
CREATE INDEX IF NOT EXISTS idx_training_courses_status ON training_courses(status);
CREATE INDEX IF NOT EXISTS idx_course_registrations_course_id ON course_registrations(course_id);

-- تعطيل RLS للسهولة (يمكن تفعيله لاحقاً مع سياسات مناسبة)
ALTER TABLE performance_evaluations DISABLE ROW LEVEL SECURITY;
ALTER TABLE training_courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_registrations DISABLE ROW LEVEL SECURITY;

-- إضافة بيانات تجريبية
INSERT INTO training_courses (course_name, course_code, description, instructor, location, start_date, end_date, duration_hours, max_participants, target_audience)
VALUES 
('أساسيات إدارة المرتبات', 'HR-001', 'دورة شاملة لإدارة المرتبات والاستحقاقات', 'أ. محمد أحمد', 'قاعة الاجتماعات الرئيسية', '2026-09-01', '2026-09-05', 20, 30, 'موظفي قسم الاستحقاقات'),
('نظام إدارة الموارد البشرية', 'HR-002', 'التدريب على استخدام النظام الإلكتروني', 'أ. سارة علي', 'مختبر الحاسوب', '2026-09-10', '2026-09-12', 15, 25, 'جميع الموظفين'),
('الإجازات الدراسية والاستحقاقات', 'HR-003', 'إدارة الإجازات الدراسية والمطالبات', 'أ. أحمد محمد', 'قاعة التدريب', '2026-09-15', '2026-09-18', 18, 20, 'موظفي الإدارة')
ON CONFLICT (course_code) DO NOTHING;