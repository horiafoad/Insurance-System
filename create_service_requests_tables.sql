-- إنشاء جداول للخدمات المنفصلة

-- جدول طلبات مفرد مرتب
CREATE TABLE IF NOT EXISTS salary_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_name VARCHAR(100) NOT NULL,
  employee_code VARCHAR(50),
  department VARCHAR(100),
  request_month VARCHAR(20) NOT NULL,
  request_year INTEGER NOT NULL,
  request_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'جديد' CHECK (status IN ('جديد', 'قيد المراجعة', 'جاري التنفيذ', 'مكتمل', 'مرفوض')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول طلبات الزمالة
CREATE TABLE IF NOT EXISTS fellowship_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_name VARCHAR(100) NOT NULL,
  employee_code VARCHAR(50),
  department VARCHAR(100),
  fellowship_type VARCHAR(100),
  request_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'جديد' CHECK (status IN ('جديد', 'قيد المراجعة', 'جاري التنفيذ', 'مكتمل', 'مرفوض')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول طلبات الرعاية الاجتماعية
CREATE TABLE IF NOT EXISTS welfare_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_name VARCHAR(100) NOT NULL,
  employee_code VARCHAR(50),
  department VARCHAR(100),
  welfare_type VARCHAR(100),
  request_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'جديد' CHECK (status IN ('جديد', 'قيد المراجعة', 'جاري التنفيذ', 'مكتمل', 'مرفوض')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول طلبات الإفادات
CREATE TABLE IF NOT EXISTS certificate_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_name VARCHAR(100) NOT NULL,
  employee_code VARCHAR(50),
  department VARCHAR(100),
  certificate_type VARCHAR(100),
  request_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'جديد' CHECK (status IN ('جديد', 'قيد المراجعة', 'جاري التنفيذ', 'مكتمل', 'مرفوض')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- تعطيل RLS للسهولة
ALTER TABLE salary_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE fellowship_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE welfare_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE certificate_requests DISABLE ROW LEVEL SECURITY;

-- إضافة فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_salary_requests_status ON salary_requests(status);
CREATE INDEX IF NOT EXISTS idx_fellowship_requests_status ON fellowship_requests(status);
CREATE INDEX IF NOT EXISTS idx_welfare_requests_status ON welfare_requests(status);
CREATE INDEX IF NOT EXISTS idx_certificate_requests_status ON certificate_requests(status);