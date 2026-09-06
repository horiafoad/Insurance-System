-- تحسينات أداء قاعدة البيانات للتعامل مع البيانات الكبيرة
-- هذا الملف يحتوي على تحسينات عامة لجميع جداول النظام

-- ============================================
-- تحسينات جداول المرتبات
-- ============================================

-- إضافة فهارس مركبة لتحسين البحث والفرز
CREATE INDEX IF NOT EXISTS idx_faculty_salary_pages_year_month 
ON faculty_salary_pages(period_year, period_month);

CREATE INDEX IF NOT EXISTS idx_faculty_salary_pages_text_search 
ON faculty_salary_pages USING gin(to_tsvector('arabic', text_content));

CREATE INDEX IF NOT EXISTS idx_faculty_salary_pages_year_month_page 
ON faculty_salary_pages(period_year, period_month, page_number);

-- تحسين جداول طلبات الخدمات
CREATE INDEX IF NOT EXISTS idx_salary_requests_employee_name 
ON salary_requests(employee_name);

CREATE INDEX IF NOT EXISTS idx_salary_requests_year_month 
ON salary_requests(request_year, request_month);

CREATE INDEX IF NOT EXISTS idx_salary_requests_date 
ON salary_requests(request_date DESC);

CREATE INDEX IF NOT EXISTS idx_fellowship_requests_employee_name 
ON fellowship_requests(employee_name);

CREATE INDEX IF NOT EXISTS idx_fellowship_requests_date 
ON fellowship_requests(request_date DESC);

CREATE INDEX IF NOT EXISTS idx_welfare_requests_employee_name 
ON welfare_requests(employee_name);

CREATE INDEX IF NOT EXISTS idx_welfare_requests_date 
ON welfare_requests(request_date DESC);

CREATE INDEX IF NOT EXISTS idx_certificate_requests_employee_name 
ON certificate_requests(employee_name);

CREATE INDEX IF NOT EXISTS idx_certificate_requests_date 
ON certificate_requests(request_date DESC);

-- ============================================
-- تحسينات جداول التقييمات والمهام
-- ============================================

-- تحسين جداول المهام
CREATE INDEX IF NOT EXISTS idx_employee_tasks_employee_month_year 
ON employee_tasks(employee_id, task_month, task_year);

CREATE INDEX IF NOT EXISTS idx_employee_tasks_status_priority 
ON employee_tasks(status, priority);

CREATE INDEX IF NOT EXISTS idx_employee_tasks_created_date 
ON employee_tasks(created_at DESC);

-- تحسين جداول التقييمات
CREATE INDEX IF NOT EXISTS idx_performance_evaluations_employee_year_month 
ON performance_evaluations(employee_id, evaluation_year, evaluation_month);

CREATE INDEX IF NOT EXISTS idx_performance_evaluations_total_score 
ON performance_evaluations(total_score DESC);

-- تحسين جداول الدورات
CREATE INDEX IF NOT EXISTS idx_training_courses_dates 
ON training_courses(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_course_registrations_employee 
ON course_registrations(employee_name);

-- ============================================
-- تحسينات جداول المستخدمين
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

CREATE INDEX IF NOT EXISTS idx_users_role 
ON users(role);

-- ============================================
-- إضافة archive للبيانات القديمة
-- ============================================

-- إنشاء جداول للأرشفة
CREATE TABLE IF NOT EXISTS faculty_salary_pages_archive (
  LIKE faculty_salary_pages INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS salary_requests_archive (
  LIKE salary_requests INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS fellowship_requests_archive (
  LIKE fellowship_requests INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS welfare_requests_archive (
  LIKE welfare_requests INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS certificate_requests_archive (
  LIKE certificate_requests INCLUDING ALL
);

-- ============================================
-- إضافة دوال للحفاظ على أداء قاعدة البيانات
-- ============================================

-- دالة لأرشفة البيانات القديمة (أكبر من سنة)
CREATE OR REPLACE FUNCTION archive_old_data()
RETURNS void AS $$
BEGIN
  -- أرشفة صفحات المرتبات القديمة
  INSERT INTO faculty_salary_pages_archive
  SELECT * FROM faculty_salary_pages
  WHERE period_year < EXTRACT(YEAR FROM CURRENT_DATE) - 1
  ON CONFLICT DO NOTHING;
  
  DELETE FROM faculty_salary_pages
  WHERE period_year < EXTRACT(YEAR FROM CURRENT_DATE) - 1;
  
  -- أرشفة طلبات الخدمات القديمة
  INSERT INTO salary_requests_archive
  SELECT * FROM salary_requests
  WHERE request_year < EXTRACT(YEAR FROM CURRENT_DATE) - 1
  ON CONFLICT DO NOTHING;
  
  DELETE FROM salary_requests
  WHERE request_year < EXTRACT(YEAR FROM CURRENT_DATE) - 1;
  
  -- نفس الشيء لباقي الجداول
  INSERT INTO fellowship_requests_archive
  SELECT * FROM fellowship_requests
  WHERE EXTRACT(YEAR FROM request_date) < EXTRACT(YEAR FROM CURRENT_DATE) - 1
  ON CONFLICT DO NOTHING;
  
  DELETE FROM fellowship_requests
  WHERE EXTRACT(YEAR FROM request_date) < EXTRACT(YEAR FROM CURRENT_DATE) - 1;
  
  INSERT INTO welfare_requests_archive
  SELECT * FROM welfare_requests
  WHERE EXTRACT(YEAR FROM request_date) < EXTRACT(YEAR FROM CURRENT_DATE) - 1
  ON CONFLICT DO NOTHING;
  
  DELETE FROM welfare_requests
  WHERE EXTRACT(YEAR FROM request_date) < EXTRACT(YEAR FROM CURRENT_DATE) - 1;
  
  INSERT INTO certificate_requests_archive
  SELECT * FROM certificate_requests
  WHERE EXTRACT(YEAR FROM request_date) < EXTRACT(YEAR FROM CURRENT_DATE) - 1
  ON CONFLICT DO NOTHING;
  
  DELETE FROM certificate_requests
  WHERE EXTRACT(YEAR FROM request_date) < EXTRACT(YEAR FROM CURRENT_DATE) - 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- إضافة دوال لتحديث الإحصائيات بشكل متقطع
-- ============================================

-- دالة لتحديث إحصائيات المرتبات
CREATE OR REPLACE FUNCTION update_salary_stats()
RETURNS void AS $$
BEGIN
  -- يمكن إضافة منطق لتحديث جداول إحصائيات منفصلة
  -- لتقليل الحمل على الاستعلامات الرئيسية
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- إضافة VACUUM و ANALYZE تلقائي
-- ============================================

-- تعيين الإعدادات لتحسين الأداء
ALTER DATABASE SET autovacuum = on;
ALTER DATABASE SET autovacuum_vacuum_scale_factor = 0.1;
ALTER DATABASE SET autovacuum_analyze_scale_factor = 0.05;

-- ============================================
-- تعليقات على التحسينات
-- ============================================

COMMENT ON FUNCTION archive_old_data() IS 'دالة لأرشفة البيانات القديمة تلقائياً للحفاظ على أداء قاعدة البيانات';
COMMENT ON FUNCTION update_salary_stats() IS 'دالة لتحديث الإحصائيات بشكل متقطع';

-- ============================================
-- نصائح للاستخدام
-- ============================================

-- 1. قم بتشغيل دالة الأرشفة بشكل دوري (مثلاً شهرياً):
-- SELECT archive_old_data();

-- 2. قم بتحليل الجداول بشكل دوري:
-- ANALYZE faculty_salary_pages;
-- ANALYZE salary_requests;
-- ANALYZE employee_tasks;

-- 3. إذا كان لديك بيانات كثيرة جداً، فكر في:
--    - استخدام pagination في الاستعلامات
--    - تقييد النتائج ب LIMIT
--    - استخدام فلاتر دقيقة

-- 4. للبحث عن النصوص بشكل فعال:
--    - استخدم الفهارس النصية (gin indexes)
--    - استخدم to_tsvector للبحث العربي