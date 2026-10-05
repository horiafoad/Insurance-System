# دليل الانتقال إلى Cloudflare R2

هذا الدليل يشرح الانتقال التدريجي لتخزين الملفات من Supabase Storage إلى
Cloudflare R2 **دون فقدان أي ملف ودون تغيير ما يراه المستخدم**.

## ⛔ عائق يجب حله قبل أي خطوة (مكتشف بـ storage:check)

حالة مشروع Supabase **مقيّدة** حاليًا:

```
Service for this project is restricted due to the following violations:
exceed_storage_size_quota. The project owner must upgrade their plan
or remove spend caps to restore service.
```

هذا ليس مجرد امتلاء مساحة تخزين: **الخدمة مقيّدة بالكامل**، والـ REST API
نفسها تردّ برسالة خطأ، فلا تُقرأ الجداول ولا تُنزَّل الملفات.

النتيجة المباشرة: لا يمكن قراءة الصفوف لمعرفة الملفات المطلوبة، ولا تنزيلها.

**المطلوب أولًا (من مالك المشروع):**

1. Supabase Dashboard → `Settings → Billing`:
   - إما ترقية الخطة، **أو**
   - إزالة `spend cap` / رفع سقف الإنفاق.
2. إعادة تشغيل الفحص للتأكد من عودة الخدمة:
   ```powershell
   npm run storage:check
   ```
3. فقط بعد نجاح الفحص تُكمل خطوات هذا الدليل.

> بدون هذه الخطوة، أي محاولة ترحيل ستتوقف عند أول قراءة وتُنتج تقريرًا فارغًا.

## المبدأ الأساسي: الانتقال تدريجي

| المرحلة | الرفع الجديد | القراءة القديمة | الحالة |
|---|---|---|---|
| 0 (الآن) | Supabase | Supabase | كل شيء يعمل كما هو |
| 1 | R2 | Supabase + R2 | الملفات الجديدة على R2، القديمة على Supabase |
| 2 | R2 | R2 فقط | بعد اكتمال الترحيل وحذف بكتات Supabase |

السبب: الرابط الموقّع صالح دقائق معدودة، فلا يصلح للتخزين في قاعدة البيانات.
لذلك تحفظ قاعدة البيانات **مرجعًا ثابتًا** على الشكل:

```
r2://<logical-bucket>/<object-path>
```

و `src/services/fileStorage.js` يحوّله إلى رابط موقّع عند العرض فقط.

---

## 1. إنشاء البكتة على Cloudflare

من [Cloudflare Dashboard](https://dash.cloudflare.com):

1. اختر `R2` من القائمة الجانبية.
2. `Create bucket` — اسم مثل `insurance-files`.
3. **مهم:** البكتة **خاصة (Private)** تلقائيًا عند الإنشاء. اتركها كذلك؛
   الوصول يتم عبر روابط موقّعة، لا عبر رابط عام.

## 2. إعداد CORS على البكتة

الرفع من المتصفح يتم مباشرة إلى R2 (حتى لا نمرّ بحدّ حجم Edge Function)،
لذلك يحتاج المتصفح إذارًا من R2.

من `R2 → <bucket> → Settings → CORS Policies → Add`:

```json
[
  {
    "AllowedOrigins": [
      "https://YOUR-PROJECT.pages.dev",
      "https://YOUR-DOMAIN.com",
      "http://localhost:5173",
      "http://localhost:4173"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

> **Electron و Android:** يعمل التطبيق من `file://` و `capacitor://`، وقد يفشل
> التحقق من المصدر في بعض البيئات. إن ظهر خطأ CORS، أضف `"*"` إلى
> `AllowedOrigins` مؤقتًا للاختبار. الاستدعاءات موقّعة زمنيًا (15 دقيقة)،
> فالمخاطر محدودة، لكن يفضّل تضييقها بعد التأكد.

> **مشكلة CORS شائعة:** إن فشل الرفع بـ `Access-Control-Allow-Headers`،
> أضف `content-type` صراحة إلى `AllowedHeaders` بدل `"*"`.

## 3. إنشاء API Token

من `R2 → Manage R2 API Tokens → Create API Token`:

- الصلاحية: `Object Read & Write`
- **مقيّد على**: البكتة التي أنشأتها في الخطوة 1 فقط
- صلاحية: `Admin Read` **غير مطلوبة** — لا تحدّدها

احفظ `Access Key ID` و `Secret Access Key` في مكان آمن. لن يُكتبا في هذا المستودع.

## 4. ضبط Supabase Edge Secrets

من Supabase Dashboard → `Project Settings → Edge Functions → Secrets`
أو بالأمر:

```bash
npx supabase secrets set R2_ACCOUNT_ID=<account-id>
npx supabase secrets set R2_ACCESS_KEY_ID=<key-id>
npx supabase secrets set R2_SECRET_ACCESS_KEY=<secret>
npx supabase secrets set R2_BUCKET_NAME=insurance-files
```

> `R2_ACCOUNT_ID` تجده في Cloudflare → `Account Overview` (رقم الحساب).
> إن كان `AUTH_SESSION_SECRET` مضبوطًا بالفعل (وهو مطلوب لـ `auth-login`)
> فلا حاجة لتغييره.

## 5. نشر دالة file-storage

```bash
npx supabase functions deploy file-storage
```

للتحقق:

```bash
curl -X POST "$VITE_SUPABASE_URL/functions/v1/file-storage" \
  -H "content-type: application/json" \
  -d '{"action":"config"}'
```

المتوقع:

```json
{ "ok": true, "enabled": true, "bucket": "insurance-files", "missing": [] }
```

إذا ظهر `"enabled": false` فراجع قائمة `missing` — هي تشرح أي متغير ناقص.

## 5b. نشر دالة scanner-upload (جسر السكانر)

دالة `file-storage` تفرض جلسة مستخدم ولا تكتب في جداول التطبيق، فلا يصلح
للجسر المحلي. لذلك وُجدت دالة مخصّصة: **`scanner-upload`**.

أولًا أنشئ توكنًا سريًا (24 حرفًا على الأقل):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

ثم أضفه كـ Edge secret:

```bash
npx supabase secrets set SCANNER_BRIDGE_TOKEN=<القيمة_الطويلة>
```

انشر الدالة:

```bash
npx supabase functions deploy scanner-upload
```

> لا تحتاج `--no-verify-jwt`. الجسر يرسل المفتاح العام `VITE_SUPABASE_ANON_KEY`
> في `apikey`/`Authorization` ليمرّ عبر بوابة Supabase، والصلاحية الحقيقية على
> العملية يوفّرها `x-scanner-token` داخل الدالة.

للتحقق (بدون رفع أي ملف):

```bash
curl -X POST "$VITE_SUPABASE_URL/functions/v1/scanner-upload" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "x-scanner-token: <SCANNER_BRIDGE_TOKEN>" \
  -H "x-scan-action: health"
```

المتوقع:

```json
{ "ok": true, "r2": { "enabled": true, "bucket": "insurance-files", "missing": [] },
  "db": true, "tokenConfigured": true,
  "limits": { "maxBytes": 52428800, "families": ["pdf", "jpg", "png"] } }
```

### ماذا تفعل هذه الدالة ولا تفعل

| تفعل | لا تفعل |
|---|---|
| تتحقق من `x-scanner-token` بمقارنة ثابتة الزمن | لا تكشف أي R2 secret لأي متصل |
| تقبل PDF/JPEG/PNG فقط، وتفحص **بصمة البايتات** لا الامتداد فقط | لا تقبل أي نوع ملف آخر ولو سمّى نفسه `.pdf` |
| تحدّ بحجم 50MB (نفس حد البكت القديمة) | لا تكتب خارج بكت `scanner-inbox` المنطقية |
| **تولّد** object path آمنًا (لا يختاره الجسر) | لا تحذف أي ملف قديم ولا أي bucket |
| ترفع إلى R2 **أولًا**، ثم تسجّل السطر | لا تنشئ سطرًا في القاعدة إذا فشل الرفع |
| تستعمل object key حتميًا مشتقًا من بصمة الملف | لا تنتج ملفات مكررة عند إعادة المحاولة |
| لا ترسل CORS headers | لا يستطيع المتصفح استدعاءها إطلاقًا |
| | لا تحفظ رابطًا موقّعًا في القاعدة (تحفظ `r2://...` ثابت) |

## 6. تطبيق تعديلات قاعدة البيانات

نفّذ `add_r2_storage_columns.sql` في Supabase SQL Editor.
السكربت **إضافي فقط** (يضيف أعمدة وجداول) ولا يحذف أو يعدّل أي بيانات قائمة.

يضيف:
- `storage_provider` و `storage_key` للجداول التي تحمل روابط ملفات
- جدول `storage_r2_objects` لتتبّع ما نُقل
- جدول `storage_migration_log` لتدقيق كل عملية ترحيل

## 7. الترحيل

اضبط مفاتيح R2 و service role في **بيئة الطرفية** فقط:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "..."   # من Supabase → API
$env:R2_ACCOUNT_ID = "..."
$env:R2_ACCESS_KEY_ID = "..."
$env:R2_SECRET_ACCESS_KEY = "..."
$env:R2_BUCKET_NAME = "insurance-files"
```

ثم بالترتيب:

```bash
npm run storage:check                 # 1) فحص الاتصال — بلا كتابة
npm run storage:migrate               # 2) معاينة كاملة — بلا كتابة
npm run storage:migrate -- --apply --table issues    # 3) جدول واحد
npm run storage:migrate -- --apply    # 4) الباقي
```

في نهاية كل تشغيل يُكتب تقرير `.storage-r2-migration-report-<timestamp>.json`.

### القواعد المهمة للترحيل

- **لا حذف.** `--apply` ينسخ إلى R2 ويحدّث رابط قاعدة البيانات فقط.
  الملفات الأصلية تبقى في Supabase.
- الصفوف التي رابطها `r2://` تُتخطى، فإعادة التشغيل آمنة.
- خطأ `exceed_storage_size_quota` يوقف السكربت فورًا. في هذه الحالة
  ارفع حصة Supabase مؤقتًا ثم أعد التشغيل.
- الصف قد يحتوي أكثر من رابط ملف. السكربت يرحّل **كل** الروابط في الصف،
  بما فيها `preview_url` و`preview_urls` (عمود `text[]`) للأرشيفات.
- التقرير يُنشأ في `.storage-r2-migration-report-<timestamp>.json` وهو
  مُتجاهَل في Git. أي صف يظهر `فشل جزئي` يحتاج مراجعة يدوية قبل إعادة التشغيل.

### ما لا يرحّله السكربت (مهم)

| العنصر | الحالة | الإجراء |
|---|---|---|
| `scanner-bridge/bridge.cjs` | **تم تحويله إلى R2** عبر دالة `scanner-upload` | لا يحتاج شيئًا — انشر الدالة وSQL فقط |
| المسحوبات **القديمة** في `scanner_inbox` | صفوف `file_url` روابط http على Supabase | تُرحَّل بسكربت الترحيل، أو تُترك وتُقرأ من Supabase |
| `ConnectionTest.jsx` | يستخدم `supabase.storage` عمدًا (تشخيصي) | مسموح — استثناء مقصود |
| أعمدة المسار الخام (`file_path`, `storage_path`) | لا تُعاد كتابتها | تبقى تدل على مسار Supabase الأصلي؛ لا تعتمد عليها للقراءة بعد الترحيل |
| الكائنات غير المرتبطة بصف | تُنسخ بـ `--no-objects` فقط | الكائنات يتيمة تبقى في Supabase؛ لا تحذف Supabase قبل جردها |

## 8. تفعيل الرفع على R2

بعد نجاح الترحيل، في `.env`:

```bash
VITE_FILE_STORAGE_PROVIDER=r2
```

أعد تشغيل `npm run dev`. الآن:

- الملفات القديمة (رابط `http`) تُقرأ من Supabase كالمعتاد
- الملفات الجديدة (`r2://`) تُرفع إلى R2 وتُقرأ عبر رابط موقّع

تأكد أن العرض يعمل، ثم احذف بكتات Supabase من Dashboard **يدويًا فقط**.

## 7b. تشغيل جسر السكانر بعد التحويل

الأمر **لم يتغيّر**، كما كان:

```bash
npm run scan:watch
```

ومجلد الرصد يضبط بنفس الاسم:

```powershell
$env:SCAN_INBOX = "D:\Scans"; npm run scan:watch
```

قبل التشغيل تأكد من:

1. نشر دالة `scanner-upload` (الخطوة 5b).
2. تنفيذ `add_scanner_r2_columns.sql` — ويلزمه أيضًا
   `add_r2_storage_columns.sql` (يعتمد على `storage_provider`/`storage_key`).
3. وجود نفس `SCANNER_BRIDGE_TOKEN` في Edge secrets وفي البيئة الطرفية.

### ماذا يفعل الجسر الآن

```
السكانر → C:\ScanInbox → الجسر يراقب وينتظر انتهاء الكتابة
        → POST إلى scanner-upload (ترويسة x-scanner-token + الملف ثنائيًا)
        → الدالة: تتحقق من التوكن والنوع والحجم
                  تولّد object path آمنًا
                  ترفع إلى R2 أولًا
                  ثم تكتب سطر scanner_inbox (status = pending)
        → الجسر يسجّل الملف في state.json ويتخطّاه لاحقًا
        → الموقع يعرضه في «مسحوحات السكانر» ويوقّع الرابط عند الاستقبال
```

سلوك الجسر لم يتغيّر: نفس الاكتشاف (`pdf|jpe?g|png`)، نفس انتظار انتهاء
الكتابة، نفس منع تشغيل أكثر من جسر، ونفس `state.json`.

### ما لا يعرفه الجسر

| لا يعرفه الجسر | لماذا |
|---|---|
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | لا يوقّع أي طلب على R2 — الدالة تفعل ذلك |
| `R2_BUCKET_NAME` | الدالة تقرر البكت |
| `SUPABASE_SERVICE_ROLE_KEY` | الدالة تسجّل السطر — لا الجسر |
| أي R2 secret | لا يُرسل أي سر إلى الجهاز أو المتصفح |

### منع التكرار

يعتمد على `source_fingerprint = sha256(الاسم | الحجم | mtime)`:

- الملف نفسه في نفس اللحظة ⇒ نفس البصمة ⇒ لا رفع ثانٍ ولا سطر ثانٍ.
- إعادة محاولة بعد فشل القاعدة ⇒ نفس البصمة **و نفس object key** ⇒ لا ملفات يتيمة.
- مسحوبة جديدة بنفس الاسم في وقت مختلف ⇒ `mtime` مختلف ⇒ سطر جديد صحيح.

### اختبارات الجسر (محلية، بلا شبكة)

```bash
node scripts/test-scanner-bridge.cjs            # اكتشاف + محتوى + state.json
node scripts/test-scanner-bridge-guard.cjs      # القفل + settle + الأخطاء
node scripts/test-scanner-upload-logic.mjs      # تحقق النوع/الاسم/المفتاح
```

> الاختبارات تنشئ `state.json` مؤقتًا وتعيده كما كان في النهاية.

---

## استكشاف الأخطاء

| العرض | السبب المحتمل | الحل |
|---|---|---|
| `R2 not configured` | متغير سر ناقص | تحقق من `missing` في رد `config` |
| `Failed to fetch` عند الرفع | CORS | راجع الخطوة 2 وتأكد من مطابقة النطاق |
| الصورة لا تظهر، الرابط `r2://` | الدالة لم تُنشر | تحقق من الخطوة 5 |
| `403 Forbidden` من الدالة | صلاحية الجلسة | يجب تسجيل الدخول؛ الأداة تكفي فعل `entitlements` أو `letters` |
| `exceed_storage_size_quota` | حصة Supabase ممتلئة **أو الخدمة مقيّدة بالكامل** | راجع `Settings → Billing`: رقِّ الخطة أو أزل spend cap (الخطوة 0) |
| `Service for this project is restricted` | الخدمة مقيّدة، والـ REST API كلها محجوبة | نفس الحل أعلاه — لا ترحيل قبلها |
| `مفتاح API غير صالح` | `SUPABASE_SERVICE_ROLE_KEY` خاطئ | انسخ المفتاح من `Settings → API` (السري، لا الـ anon) |
| الجسر: `Unauthorized` | `SCANNER_BRIDGE_TOKEN` لا يطابق الـ Edge secret | تأكد أن نفس القيمة في-terminal وفي Edge secrets، وأنها ≥ 24 حرفًا |
| الجسر: `bridge not configured` | التوكن مضبوط في الدالة لكن ناقص/قصير | اضبطه في `Edge Functions → Secrets` بطول ≥ 24 حرفًا |
| الجسر: `R2 not configured` | أسرار R2 ناقصة داخل الدالة | نفّذ خطوة 4 ثم أعد نشر الدالة |
| الجسر: `unsupported file content` | الملف ليس PDF/JPEG/PNG فعليًا | نوع غير مدعوم من HP Scan |
| الجسر: `content does not match extension` | محتوى لا يطابق الامتداد | ملف تالف أو امتداد خاطئ |
| الجسر: `database insert failed` | القاعدة رفضت السطر | نفّذ `add_scanner_r2_columns.sql` — الملف لم يُفقد، سيُعاد المحاولة |
| المسحوبة تظهر ولا تُفتح | رابط `r2://` بلا توقيع | تحقق من جلسة المستخدم (تحتاج صلاحية `entitlements`) |
| الرابط الموقّع انتهى | تجاوزت مدة صلاحيته | طبيعي — يُطلب رابط جديد تلقائيًا عند العرض |

## ملاحظات تصميم

- **الصلاحيات** في `file-storage` تعكس `src/utils/permissions.js` كما هي.
  لم يُقدَّم نظام صلاحيات جديد.
- **BUCKET_PERMISSION** في `supabase/functions/file-storage/index.ts` هو
  المكان الوحيد الذي يجب تعديله إذا تغيّرت أذونات بكتة ما.
- **CORS الافتراضي** في الدالة هو `*` كي تعمل نسخة Electron و Android بلا
  إعداد. ضيّقها عبر `STORAGE_ALLOWED_ORIGINS` بعد التأكد.
- **حدود الرفع** التي كانت سارية قبل التحويل ما زالت سارية
  (مثل 50MB في `SalaryImportReview`). لم تتغير حدود الحجم.
- `scanner-bridge` بقي على Supabase عمدًا — تمسكه مخالبه بـ
  `scanner-inbox` ولم يُغيَّر سلوكه.
