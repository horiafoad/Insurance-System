# استخراج بيانات Supabase القديم — READ ONLY

المشروع القديم: `jpybzalxcezxhokzmwdx`

## ما الذي يتجاوز الـ402؟

SQL Editor ينفَّذ على الخادم (`postgres` مباشرة)، فلا يمر عبر بوابة REST/Storage/Edge
Functions التي تعيد `402`. لذلك القراءة منه ممكنة بينما REST API ممنوع.

## القيود المطبَّقة

كل statements في هذا المجلد **قراءة فقط**. ممنوع في كل ملفات المشروع:
`INSERT` / `UPDATE` / `DELETE` / `DROP` / `ALTER` / `TRUNCATE` / `COPY` / `CREATE`.

لا يُستخدم REST API ولا Storage API. لا ملفات Storage ولا PDF ولا صور.

## الخطوات

### 1) الجرد — كم صف في كل جدول؟

في SQL Editor على المشروع القديم:
شغّل `01-discovery.sql` → انسخ قيمة عمود `report` (خلية واحدة) → احفظها في:

```
scripts/export-old-data/raw/01-discovery.txt
```

هذه الخطوة تحدد أي الجداول فيها rows فعلية (وهو طلبك الأول).

### 2) ميتاداتا الأعمدة

شغّل `02-catalog.sql` → انسخ قيمة عمود `ndjson` → احفظها في:

```
scripts/export-old-data/raw/02-catalog.txt
```

مطلوبة لأن:
- أعمدة `numeric` / `json` / `jsonb` تُصدَّر كنص، لأن `JSON.parse` في JavaScript
  يقرّب الأرقام العشرية فيفقد دقة قيم المال. النص يحفظ القيمة حرفيًا.
- المفتاح الأساسي يُستخدم لترتيب الصفوف ترتيبًا حتميًا، فتصبح التقسيمات (chunks)
  آمنة بلا تكرار ولا نقص.

> إذا قُطعت الخلية، نفّذ نفس الاستعلام لجدول واحد:
> `where table_name='<table>'`

### 3) اختبار الجدول الصغير (users) — بكلمة المرور مخفية

شغّل `03-test-users-preview.sql` → انسخ `report` → احفظها في `raw/03-users-preview.txt`.

هذه المعاينة **لا تعرض أي password**. تُظهر تصنيفًا فقط:
`BCRYPT` أو `PLAINTEXT` أو `EMPTY` أو `NULL`.

> `PLAINTEXT` يعني أن كلمة مرور مخزّنة كنص صريح. سنحوّلها إلى bcrypt عند
> الاستيراد في المشروع الجديد، ولا تُطبع قيمتها في أي تقرير.

### 4) توليد خطة التصدير

```bash
node scripts/export-old-data/generate.mjs --rows 5000
```

ينتج `run-plan/*.sql` (statement لكل جدول/جزء) و`run-plan/manifest.json`
بالترتيب الصحيح حسب الـForeign Keys.

الجداول مرتبة تلقائيًا: الأصل قبل التابع (مثل `letters` قبل `letter_movements`).

خيارات:
- `--rows 1000` إذا كانت النتائج تُقتطع في الواجهة
- `--all` لتصدير كل جداول `public` حتى غير المستخدمة في التطبيق

### 5) التنفيذ

لكل statement بالترتيب في `manifest.json`:

1. انسخ محتوى `run-plan/<table>.001.sql`
2. الصقه في SQL Editor على المشروع القديم، وشغّله
3. انسخ قيمة عمود `ndjson` (خلية واحدة)
4. احفظها في `scripts/export-old-data/raw/<table>.1.txt`

> ⚠️ لا تلصق محتويات الجداول في المحادثة. احفظها في الملفات فقط.

### 6) التحقق

```bash
node scripts/export-old-data/ingest.mjs
```

يكتب `ndjson/<table>.ndjson` + `ndjson/report.json`، ويطبع:
عدد الصفوف، والمقابل بالعدد الحقيقي، وعدد الأعمدة، وsha256.

**يجب أن تكون كل الجداول `ok: yes`.** أي `NO` أعد تصدير ذلك الجدول.

`ingest.mjs` لا يطبع محتوى الصفوف إطلاقًا، فلا تظهر كلمات المرور في الـterminal.

## الحفاظ على القيم

| المطلوب | كيف |
|---|---|
| UUIDs | نصوص JSON كما هي |
| IDs | كما هي |
| timestamps | ISO 8601 مع المنطقة الزمنية |
| NULL | `null` |
| arrays | `permissions: ["read","write"]` |
| numeric دقيق | نص، لا رقم JS |
| json / jsonb | نص، لا رقم JS |
| العلاقات (FK) | `manifest.json` فيه `fks` لكل جدول + ترتيب الاستيراد |

## partitioning حجم单元格

الواجهة قد تقتطع الخلايا الكبيرة. عندها:

```bash
node scripts/export-old-data/generate.mjs --rows 1000
```

واستخدم `raw/<table>.1.txt`, `raw/<table>.2.txt`, ... (السكربت يجمعها).

## روابط Storage القديمة

جداول الأرشيف فيها أعمدة `file_url` / `preview_url(s)` / `file_path` تشير إلى
ملفات كانت في Supabase Storage. **هذه النصوص تُصدَّر كما هي** (حفاظًا على
البيانات)، لكننا لا ننقل الملفات. عند الاستيراد في المشروع الجديد ستُعالَج
منفصلًا (Nullable أو academic archival) حسب خطة R2.

## الحماية

`raw/` و `ndjson/` و `run-plan/` مستبعدة في `.gitignore`.
`raw/users.*.txt` و `ndjson/users.ndjson` تحتوي كلمات المرور — لا تُرفع إلى Git.

## فحص ذاتي

```bash
node scripts/export-old-data/selftest.mjs
```

يعمل ببيانات اصطناعية فقط، ويتحقق من: تحليل الكتالوج، التحويل بلا فقد،
التقسيم، حذف التكرار، ومطابقة الأعداد. لا يحتاج قاعدة بيانات.
