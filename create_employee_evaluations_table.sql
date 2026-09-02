-- إنشاء جدول مهام الموظفين

CREATE TABLE IF NOT EXISTS employee_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_date DATE,
  task_month INTEGER NOT NULL CHECK (task_month BETWEEN 1 AND 12),
  task_year INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'جديد' CHECK (status IN ('جديد', 'جاري', 'مكتمل', 'متأخر')),
  priority VARCHAR(20) NOT NULL DEFAULT 'عادي' CHECK (priority IN ('عادي', 'مهم', 'عاجل')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- تعطيل RLS للسهولة
ALTER TABLE employee_tasks DISABLE ROW LEVEL SECURITY;

-- إضافة فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_employee_tasks_employee_id ON employee_tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_tasks_status ON employee_tasks(status);
CREATE INDEX IF NOT EXISTS idx_employee_tasks_priority ON employee_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_employee_tasks_due_date ON employee_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_employee_tasks_month_year ON employee_tasks(task_month, task_year);

-- إضافة تعليق على الجدول
COMMENT ON TABLE employee_tasks IS 'جدول مهام موظفي قسم الاستحقاقات';

-- ============================================
-- إضافة بيانات تجريبية
-- ============================================

-- مهام لكل موظف - شهر أغسطس 2026
INSERT INTO employee_tasks (employee_id, title, description, due_date, task_month, task_year, status, priority) VALUES
(1, 'إعداد استمارة مرتبات أغسطس', 'إعداد واستكمال استمارة مرتبات شهر أغسطس 2026', '2026-08-20', 8, 2026, 'مكتمل', 'عاجل'),
(1, 'مراجعة فواتير أورانج', 'مراجعة فواتير أورانج للعاملين', '2026-08-25', 8, 2026, 'جاري', 'مهم'),
(2, 'معالجة فواتير العلاج', 'معالجة فواتير العلاج الواردة', '2026-08-22', 8, 2026, 'جديد', 'عادي'),
(2, 'تحديث بيانات التأمينات', 'تحديث بيانات التأمينات للموظفين', '2026-08-30', 8, 2026, 'جديد', 'مهم'),
(3, 'مراجعة طلبات الإجازات', 'مراجعة طلبات الإجازات الدراسية', '2026-08-18', 8, 2026, 'مكتمل', 'عاجل'),
(3, 'إعداد تقرير الإجازات', 'إعداد تقرير شهري عن الإجازات', '2026-08-28', 8, 2026, 'جاري', 'عادي'),
(4, 'متابعة المطالبات القانونية', 'متابعة حالة المطالبات القانونية', '2026-08-25', 8, 2026, 'جديد', 'مهم'),
(4, 'إعداد مفردات المرتب', 'إعداد مفردات المرتب عند الطلب', '2026-08-29', 8, 2026, 'جديد', 'عادي'),
(5, 'معالجة طلبات الزمالة', 'معالجة طلبات الزمالة والاشتراكات', '2026-08-23', 8, 2026, 'جاري', 'عاجل'),
(5, 'متابعة صندوق الزمالة', 'متابعة حالة صندوق الزمالة', '2026-08-27', 8, 2026, 'جديد', 'مهم'),
(6, 'إعداد ملفات المعاملات', 'إعداد وتنظيم ملفات المعاملات اليومية', '2026-08-21', 8, 2026, 'جديد', 'عادي'),
(6, 'مراجعة الأرشيف', 'مراجعة وتحديث الأرشيف الإلكتروني', '2026-08-26', 8, 2026, 'جديد', 'مهم');

-- ============================================
-- استعلامات مفيدة
-- ============================================

-- عرض جميع المهام مع اسم الموظف
SELECT 
  t.id,
  t.employee_id,
  CASE t.employee_id
    WHEN 1 THEN 'صفاء عبد الوهاب'
    WHEN 2 THEN 'ياسمين عبد الوهاب'
    WHEN 3 THEN 'حورية فؤاد'
    WHEN 4 THEN 'أماني صلاح'
    WHEN 5 THEN 'عبد الله السعيد'
    WHEN 6 THEN 'جهاد عاطف'
  END as employee_name,
  t.title,
  t.description,
  t.due_date,
  t.task_month,
  t.task_year,
  t.status,
  t.priority,
  t.created_at
FROM employee_tasks t
ORDER BY t.created_at DESC;

-- عرض ملخص المهام لكل موظف حسب الشهر
SELECT 
  employee_id,
  CASE employee_id
    WHEN 1 THEN 'صفاء عبد الوهاب'
    WHEN 2 THEN 'ياسمين عبد الوهاب'
    WHEN 3 THEN 'حورية فؤاد'
    WHEN 4 THEN 'أماني صلاح'
    WHEN 5 THEN 'عبد الله السعيد'
    WHEN 6 THEN 'جهاد عاطف'
  END as employee_name,
  task_month,
  task_year,
  COUNT(*) as total_tasks,
  SUM(CASE WHEN status = 'مكتمل' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'جديد' OR status = 'جاري' THEN 1 ELSE 0 END) as pending,
  SUM(CASE WHEN status = 'متأخر' THEN 1 ELSE 0 END) as late
FROM employee_tasks
GROUP BY employee_id, task_month, task_year
ORDER BY task_year DESC, task_month DESC, employee_id;

-- عرض المهام المتأخرة
SELECT 
  t.*,
  CASE t.employee_id
    WHEN 1 THEN 'صفاء عبد الوهاب'
    WHEN 2 THEN 'ياسمين عبد الوهاب'
    WHEN 3 THEN 'حورية فؤاد'
    WHEN 4 THEN 'أماني صلاح'
    WHEN 5 THEN 'عبد الله السعيد'
    WHEN 6 THEN 'جهاد عاطف'
  END as employee_name
FROM employee_tasks t
WHERE t.status = 'متأخر' OR (t.due_date < CURRENT_DATE AND t.status != 'مكتمل')
ORDER BY t.due_date ASC;

-- عرض مهام موظف معين لشهر معين
SELECT * FROM employee_tasks
WHERE employee_id = 1 AND task_month = 8 AND task_year = 2026
ORDER BY due_date ASC;