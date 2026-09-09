# دليل حل مشاكل رفع ملفات Excel

## المشكلة: فشل رفع ملف Excel

### الحلول المقترحة:

### 1. التحقق من إعداد Supabase

#### أ. التحقق من Storage Bucket
1. افتح لوحة تحكم Supabase
2. اذهب إلى **Storage**
3. تأكد من وجود bucket باسم `issues-files`
4. إذا لم يكن موجوداً، نفذ ملف `setup_storage_bucket.sql`

#### ب. التحقق من الجداول
1. اذهب إلى **Table Editor** في Supabase
2. تأكد من وجود الجداول:
   - `issues`
   - `issue_details`
3. إذا لم تكن موجودة، نفذ ملف `create_issues_tables.sql`

### 2. استخدام صفحة اختبار الاتصال

1. افتح المشروع في المتصفح
2. سجل الدخول كمسؤول
3. اختر "اختبار الاتصال" من القائمة الجانبية
4. اضغط "تشغيل الاختبارات"
5. راجع النتائج وحل المشاكل المحددة

### 3. التحقق من ملف .env

تأكد من أن ملف `.env` يحتوي على:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. مشاكل شائعة وحلولها

#### المشكلة: "Storage bucket 'issues-files' غير موجود"
**الحل**: نفذ ملف `setup_storage_bucket.sql` في Supabase SQL Editor

#### المشكلة: "جدول issues غير موجود"
**الحل**: نفذ ملف `create_issues_tables.sql` في Supabase SQL Editor

#### المشكلة: "فشل الوصول إلى Storage"
**الحل**: 
- تحقق من صلاحيات Storage
- تأكد من تفعيل RLS على Storage
- نفذ سياسات الوصول من ملف `setup_storage_bucket.sql`

#### المشكلة: "فشل الاتصال بقاعدة البيانات"
**الحل**:
- تحقق من صحة URL و ANON KEY
- تأكد من أن مشروع Supabase نشط
- تحقق من اتصال الإنترنت

#### المشكلة: "الملف فارغ أو لا يحتوي على بيانات"
**الحل**:
- تأكد من أن ملف Excel يحتوي على بيانات
- تحقق من أن الورقة الأولى ليست فارغة
- جرب حفظ الملف بصيغة .xlsx

#### المشكلة: "فشل إضافة تفاصيل القضايا"
**الحل**:
- قد تكون البيانات كبيرة جداً
- الكود يقسم البيانات تلقائياً إلى مجموعات
- إذا استمرت المشكلة، قلل حجم الملف

### 5. التحقق من Console

1. افتح Developer Tools في المتصفح (F12)
2. اذهب إلى تبويب Console
3. حاول رفع ملف Excel
4. راجع الرسائل المطبوعة في Console
5. الرسائل ستظهر تفاصيل الخطأ

### 6. خطوات متقدمة

#### إعادة إنشاء Storage Bucket
```sql
-- حذف bucket القديم إذا موجود
DELETE FROM storage.buckets WHERE id = 'issues-files';

-- إعادة إنشائه
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'issues-files',
  'issues-files',
  true,
  104857600,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/pdf'
  ]
);
```

#### إعادة إنشاء الجداول
```sql
-- حذف الجداول القديمة
DROP TABLE IF EXISTS issue_details CASCADE;
DROP TABLE IF EXISTS issues CASCADE;

-- إعادة إنشائها (نفذ ملف create_issues_tables.sql)
```

### 7. اختبار بسيط

جرب رفع ملف Excel بسيط يحتوي على:
- صف واحد فقط
- أعمدة بسيطة (مثل: الاسم، الرقم، التاريخ)
- حجم صغير

إذا نجح هذا الملف، فالمشكلة قد تكون في ملفك الأصلي.

### 8. التواصل مع الدعم

إذا استمرت المشكلة:
1. اجمع لقطة شاشة من رسالة الخطأ
2. انسخ رسائل Console
3. افتح Issue في GitHub
4 اذكر الخطوات التي جربتها

## نصائح إضافية

- دائماً نفذ ملفات SQL بالترتيب الصحيح
- تحقق من أن مشروع Supabase ليس في وضع paused
- استخدم ملفات Excel بصيغة .xlsx للحصول على أفضل نتائج
- قلل حجم الملفات الكبيرة قبل الرفع
- احتفظ بنسخة احتياطية من بياناتك
