-- إنشاء جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('super_admin', 'admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء فهرس على اسم المستخدم
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- إضافة مستخدم رئيسي افتراضي (يمكن تغيير كلمة المرور لاحقاً)
INSERT INTO users (username, password, full_name, role)
VALUES ('horia', '2322003', 'المدير الرئيسي', 'super_admin')
ON CONFLICT (username) DO NOTHING;

-- إنشاء دالة لتحديث وقت التعديل تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- إنشاء تريجر لتحديث وقت التعديل
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();