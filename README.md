# نظام إدارة القضايا - Insurance System

نظام متكامل لإدارة القضايا والمطالبات مع إمكانية رفع ملفات Excel و PDF.

## 🚀 المميزات الرئيسية

### 1. إدارة القضايا
- **رفع ملفات Excel**: استيراد قوائم القضايا من ملفات Excel
- **رفع ملفات PDF**: رفع ملفات PDF للقضايا الفردية
- **إدارة الحالات**: تتبع حالة كل قضية (قيد المعالجة، جاري التنفيذ، مكتملة، مرفوضة)
- **البحث والتصفية**: البحث السريع وتصفية القضايا حسب الحالة والنوع

### 2. قاعدة البيانات
- **Supabase**: قاعدة بيانات PostgreSQL مع Storage للملفات
- **جدول القضايا**: تخزين معلومات القضايا الرئيسية
- **جدول التفاصيل**: تخزين تفاصيل القضايا المستوردة من Excel
- **Storage Bucket**: تخزين الملفات المرفوعة

## 📋 المتطلبات

- Node.js (الإصدار 18 أو أحدث)
- حساب Supabase
- npm أو yarn

## 🔧 الإعداد

### 1. تثبيت المكتبات

```bash
npm install
```

### 2. إعداد Supabase

#### أ. إنشاء قاعدة البيانات

1. أنشئ مشروع جديد في [Supabase](https://supabase.com)
2. احصل على `Supabase URL` و `Anon Key` من إعدادات المشروع
3. أضفها إلى ملف `.env`:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### ب. إنشاء الجداول

نفذ ملف `create_issues_tables.sql` في Supabase SQL Editor:

```sql
-- افتح SQL Editor في Supabase
-- انسخ محتوى الملف ونفذه
```

#### ج. إعداد Storage Bucket

نفذ ملف `setup_storage_bucket.sql` في Supabase SQL Editor:

```sql
-- افتح SQL Editor في Supabase
-- انسخ محتوى الملف ونفذه
```

### 3. تشغيل المشروع

```bash
npm run dev
```

## 📁 هيكل المشروع

```
Insurance-System/
├── public/
│   └── index.html
├── src/
│   ├── AdminDashboard.jsx          # الصفحة الرئيسية
│   ├── App.jsx                     # إعداد التوجيه
│   ├── supabaseClient.js           # إعداد Supabase
│   ├── dashboard/
│   │   ├── Sidebar.jsx            # القائمة الجانبية
│   │   ├── IssuesManagementPage.jsx  # صفحة إدارة القضايا
│   │   ├── styles.js              # التنسيقات
│   │   └── data.js                # البيانات الثابتة
├── create_issues_tables.sql        # إنشاء جداول قاعدة البيانات
├── setup_storage_bucket.sql       # إعداد Storage
└── README.md
```

## 🎯 كيفية الاستخدام

### رفع ملف Excel

1. افتح صفحة "إدارة القضايا" من القائمة الجانبية
2. اختر قسم "رفع قائمة قضايا (Excel)"
3. اختر ملف Excel (.xlsx أو .xls)
4. اضغط على "رفع ملف Excel"
5. سيتم استيراد البيانات تلقائياً إلى قاعدة البيانات

### رفع ملف PDF

1. افتح صفحة "إدارة القضايا"
2. اختر قسم "رفع قضية فردية (PDF)"
3. أدخل رقم القضية والعنوان
4. اختر ملف PDF
5. اضغط على "رفع ملف PDF"

### إدارة القضايا

- **البحث**: استخدم خانة البحث للبحث برقم القضية أو العنوان
- **التصفية**: استخدم القوائم المنسدلة لتصفية حسب الحالة أو النوع
- **عرض الملفات**: اضغط على "عرض" لفتح الملف المرفوع
- **تغيير الحالة**: استخدم القائمة المنسدلة لتغيير حالة القضية
- **حذف**: اضغط على "حذف" لإزالة قضية

## 🗄️ هيكل قاعدة البيانات

### جدول issues

| الحقل | النوع | الوصف |
|-------|-------|-------|
| id | BIGSERIAL | المفتاح الرئيسي |
| case_number | VARCHAR(100) | رقم القضية |
| case_title | VARCHAR(500) | عنوان القضية |
| case_description | TEXT | وصف القضية |
| case_type | VARCHAR(50) | نوع القضية (فردية/جماعية) |
| file_type | VARCHAR(20) | نوع الملف (Excel/PDF) |
| file_url | TEXT | رابط الملف |
| file_name | VARCHAR(500) | اسم الملف |
| file_size | BIGINT | حجم الملف |
| status | VARCHAR(50) | حالة القضية |
| created_at | TIMESTAMP | تاريخ الإنشاء |
| updated_at | TIMESTAMP | تاريخ التحديث |

### جدول issue_details

| الحقل | النوع | الوصف |
|-------|-------|-------|
| id | BIGSERIAL | المفتاح الرئيسي |
| issue_id | BIGINT | معرف القضية |
| row_number | INTEGER | رقم الصف |
| data | JSONB | البيانات |
| created_at | TIMESTAMP | تاريخ الإنشاء |

## 🔒 الأمان

- تم تفعيل Row Level Security (RLS) على جميع الجداول
- سياسات الوصول تسمح للمستخدمين المصادقين بإدارة القضايا
- الملفات المرفوعة محمية في Supabase Storage

## 🐛 استكشاف الأخطاء

### مشاكل رفع الملفات

1. **فشل الاتصال بـ Supabase**:
   - تحقق من صحة البيانات في ملف `.env`
   - تأكد من أن مشروع Supabase نشط

2. **Storage Bucket غير موجود**:
   - نفذ ملف `setup_storage_bucket.sql`
   - تأكد من إنشاء bucket باسم `issues-files`

3. **خطأ في حجم الملف**:
   - الحد الأقصى هو 100MB
   - قلل حجم الملف أو زد الحد في إعدادات Storage

### مشاكل قاعدة البيانات

1. **الجداول غير موجودة**:
   - نفذ ملف `create_issues_tables.sql`
   - تحقق من SQL Editor في Supabase

2. **أخطاء الصلاحيات**:
   - تحقق من سياسات RLS
   - تأكد من تفعيل الصلاحيات المناسبة

## 📝 ملاحظات التطوير

- يستخدم المشروع React 18 مع Vite
- المكتبات الرئيسية:
  - `@supabase/supabase-js` للاتصال بقاعدة البيانات
  - `xlsx` لمعالجة ملفات Excel
  - `react-router-dom` للتوجيه

## 🤝 المساهمة

للمساهمة في المشروع:
1. Fork المشروع
2. أنشئ branch للميزة الجديدة
3. Commit التغييرات
4. Push إلى Branch
5. افتح Pull Request

## 📄 الترخيص

هذا المشروع مرخص تحت MIT License.

## 📞 الدعم

للدعم والاستفسارات:
- افتح Issue في GitHub
- راجع وثائق Supabase: https://supabase.com/docs
