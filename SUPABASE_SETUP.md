# إعداد Supabase لنظام إدارة القضايا

## الخطوة 1: إنشاء مشروع Supabase

1. اذهب إلى [https://supabase.com](https://supabase.com)
2. سجل الدخول أو أنشئ حساب جديد
3. اضغط على "New Project"
4. أدخل:
   - **اسم المشروع**: insurance-system
   - **كلمة مرور قاعدة البيانات**: (اختر كلمة مرور قوية)
   - **المنطقة**: اختر المنطقة الأقرب لك
5. اضغط "Create new project"
6. انتظر حتى ينتهي إنشاء المشروع (قد يستغرق دقيقتين)

## الخطوة 2: الحصول على بيانات الاتصال

1. بعد إنشاء المشروع، اذهب إلى **Settings** > **API**
2. انسخ القيم التالية:
   - **Project URL**: مثل `https://xxxxxxxxxxxxx.supabase.co`
   - **anon public key**: المفتاح العام

## الخطوة 3: إضافة البيانات إلى المشروع

1. افتح ملف `.env` في المشروع
2. أضف البيانات التالية:

```env
VITE_SUPABASE_URL=https://your-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

استبدل القيم بالبيانات التي نسختها من Supabase.

## الخطوة 4: إنشاء جداول قاعدة البيانات

1. في لوحة تحكم Supabase، اذهب إلى **SQL Editor**
2. اضغط على "New Query"
3. انسخ محتوى ملف `create_issues_tables.sql`
4. الصق المحتوى في المحرر
5. اضغط "Run" لتنفيذ الاستعلام

سيتم إنشاء الجداول التالية:
- `issues`: جدول القضايا الرئيسي
- `issue_details`: جدول تفاصيل القضايا

## الخطوة 5: إعداد Storage Bucket

1. في SQL Editor، أنشئ استعلام جديد
2. انسخ محتوى ملف `setup_storage_bucket.sql`
3. الصق المحتوى في المحرر
4. اضغط "Run" لتنفيذ الاستعلام

سيتم إنشاء:
- Storage bucket باسم `issues-files`
- سياسات الوصول اللازمة

## الخطوة 6: التحقق من الإعداد

### التحقق من الجداول

1. اذهب إلى **Table Editor** في Supabase
2. تأكد من وجود الجداول:
   - `issues`
   - `issue_details`

### التحقق من Storage

1. اذهب إلى **Storage** في Supabase
2. تأكد من وجود bucket باسم `issues-files`

## الخطوة 7: تشغيل المشروع

1. في مجلد المشروع، شغل:

```bash
npm install
npm run dev
```

2. افتح المتصفح على العنوان المعروض (عادة `http://localhost:5173`)

## استكشاف الأخطاء

### المشكلة: خطأ في الاتصال بـ Supabase

**الحل**:
- تحقق من صحة البيانات في ملف `.env`
- تأكد من نسخ البيانات من المكان الصحيح في Supabase
- تحقق من أن مشروع Supabase نشط (ليس paused)

### المشكلة: Storage Bucket غير موجود

**الحل**:
- تأكد من تنفيذ ملف `setup_storage_bucket.sql`
- تحقق من أن Bucket موجود في قسم Storage

### المشكلة: الجداول غير موجودة

**الحل**:
- تأكد من تنفيذ ملف `create_issues_tables.sql`
- تحقق من وجود الجداول في Table Editor

### المشكلة: خطأ في الصلاحيات

**الحل**:
- تحقق من تنفيذ جميع سياسات RLS في ملفات SQL
- تأكد من تفعيل Row Level Security على الجداول

## ملاحظات مهمة

- احفظ كلمة مرور قاعدة البيانات في مكان آمن
- لا تشارك keys الخاصة بك مع أحد
- في بيئة الإنتاج، استخدم Service Role Key للعمليات الحساسة
- فكر في تفعيل Authentication إذا كنت بحاجة إلى نظام تسجيل دخول

## الدعم الإضافي

- وثائق Supabase: https://supabase.com/docs
- وثائق React: https://react.dev
- وثائق Vite: https://vitejs.dev
