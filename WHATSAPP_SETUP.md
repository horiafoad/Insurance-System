# إعداد إشعارات WhatsApp الرسمية — كلية الهندسة، جامعة عين شمس

هذا الدليل يشرح تشغيل نظام إشعارات WhatsApp للعملاء عبر **WhatsApp Business
Platform (Meta Cloud API)** من الرقم الرسمي:

> **+201132853275** — `201132853275`

النظام لا يرسل أي رسالة حقيقية قبل تنفيذ الخطوات الواردة هنا وضبط
`WHATSAPP_AUTO_SEND=true` صراحةً.

---

## 1) كيف يعمل النظام؟

```
الموظف يغيّر حالة الطلب
        │
        ▼
update-service-request  (Supabase Edge Function)
  1. يتحقق من جلسة الموظف الموقّعة (HMAC)
  2. يتحقق من صلاحية "requests" على الخادم
  3. يحفظ الحالة في service_requests
  4. بعد نجاح الحفظ فقط: يسجّل الإشعار في whatsapp_notifications
  5. يرسل عبر Meta Cloud API (أو يسجّل skipped/failed)
        │
        ▼
send-whatsapp  (نفس منطق الإرسال + السجل + إعادة المحاولة)
```

مبادئ الأمان المطبّقة:

- **لا يوجد Access Token في الواجهة** ولا في أي متغير يبدأ بـ `VITE_`.
  كل الأسرار في Supabase Edge Function Secrets.
- لا يثق الخادم بأي هاتف أو نص رسالة قادم من المتصفح؛ يقرأ صف الطلب من
  قاعدة البيانات ويبني الرسالة بنفسه.
- لا يمكن تغيير حالة أي طلب من خلال WhatsApp (لا يوجد Webhook وارد).
- فشل WhatsApp **لا يلغي حفظ الطلب**؛ الحفظ يتم أولًا ثم تُسجَّل نتيجة الإشعار.
- منع التكرار عبر `dedupe_key` فريد + فحص إشعار ناجح سابق لنفس الطلب/الحالة.
- استجابة إشعار الاستلام العام (بعد إدخال الطلب) لا تُعيد هاتف العميل ولا نص
  الرسالة؛ البيانات الكاملة متاحة فقط للموظف المتحقَّق من صلاحيته.
- جدول `whatsapp_notifications` محمي بـ RLS ولا يصل إليه المتصفح؛ الوصول
  عبر Edge Functions فقط بعد التحقق من الجلسة والصلاحية.

الملفات ذات الصلة:

| الملف | الوظيفة |
| --- | --- |
| `supabase/migrations/20261118_whatsapp_notifications.sql` | جدول سجل الإشعارات والفهارس |
| `supabase/functions/_shared/whatsappMessages.js` | بناء الرسالة/القالب + تطبيع الهاتف + مفتاح منع التكرار |
| `supabase/functions/_shared/whatsapp.ts` | الإرسال عبر Meta + السجل + إعادة المحاولة |
| `supabase/functions/send-whatsapp/index.ts` | API الإشعار/السجل/الإعادة/الإعدادات |
| `supabase/functions/update-service-request/index.ts` | حفظ الحالة بعد التحقق ثم الإشعار |
| `src/utils/whatsappNotifications.js` | استدعاء الدوال من المتصفح + المعاينة |
| `src/dashboard/CriteriaView.jsx` | شاشة الطلبات: تغيير الحالة + المعاينة |
| `src/dashboard/WhatsAppNotificationsModal.jsx` | سجل الإشعارات وإعادة المحاولة |
| `scripts/whatsapp/tests/message-builder.test.mjs` | اختبارات بناء الرسالة والهاتف |

---

## 2) المتطلبات الخارجية (Meta)

> كل الخطوات التالية تتم من حساب المؤسسة الرسمي. لا تضع أي Token أو كلمة مرور
> في هذه المحادثة أو في الملفات المرفوعة إلى Git.

### 2.1 إنشاء تطبيق Meta

1. افتح <https://developers.facebook.com/apps>.
2. **Create App** → نوع التطبيق **Business**.
3. أدخل اسم التطبيق (مثال: `ASU Engineering WhatsApp`) واربطه بـ
   **Business Portfolio** الخاص بالكلية/الجامعة.
4. من لوحة التطبيق: **Add Product** → **WhatsApp** → **Set up**.

### 2.2 حساب WhatsApp Business (WABA) والرقم

1. من **WhatsApp → API Setup** اختر أو أنشئ **WhatsApp Business Account**.
2. أضف رقم الإرسال **+201132853275**.
   - لا يمكن استخدام رقم مسجّل حاليًا في تطبيق WhatsApp العادي. إن كان الرقم
     مستخدمًا، احذف حسابه من تطبيق WhatsApp أولًا (أو استخدم رقمًا مخصصًا
     للخدمة).
   - وثّق الرقم عبر رمز SMS/مكالمة.
3. اضبط **Display name** ليظهر للعميل، مثال:
   `كلية الهندسة – جامعة عين شمس`.
   قد تحتاج الموافقة على الاسم من Meta.
4. سجّل القيم التالية من الصفحة نفسها:
   - **Phone Number ID** (معرّف الرقم، وليس رقم الهاتف نفسه)
   - **WhatsApp Business Account ID (WABA ID)**
   - **Temporary access token** (صالح 24 ساعة — للاختبار فقط)

### 2.3 توكن دائم (Production)

التوكن المؤقت لا يصلح للإنتاج. أنشئ **System User Token**:

1. <https://business.facebook.com/settings> → **Users → System users**.
2. **Add** → نوع المستخدم **Admin** → اسم واضح.
3. **Add Assets** → أضف تطبيق Meta وحساب WABA.
4. **Generate New Token** → اختر التطبيق → فعّل الصلاحيتين:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. انسخ التوكن واحفظه في مكان آمن فورًا (لن يظهر مرة أخرى). هذا هو
   `WHATSAPP_TOKEN`.

### 2.4 التحقق من النشاط والحدود

- أكمل **Business Verification** في Meta Business Settings لرفع حدود المراسلة.
- أضف وسيلة دفع في **WhatsApp Manager → Account tools → Billing**.
- راجع **Messaging limits** و**Quality rating**؛ الحساب الجديد يبدأ بحد
  منخفض ثم يرتفع تدريجيًا.
- في وضع التطوير، يمكن إرسال رسائل فقط إلى أرقام **Test numbers**
  المضافة في لوحة التطبيق.

### 2.5 موافقة العميل (Opt-in) ونافذة 24 ساعة

- يجب أن يكون لدى مقدم الطلب موافقة/علاقة خدمة تسمح بإرسال إشعار عن طلبه
  (تقديم الطلب بنفسه يُعدّ أساسًا مناسبًا، ويُفضّل توضيح ذلك في النموذج).
- الرسائل النصية الحرة تعمل فقط داخل **نافذة خدمة العميل 24 ساعة** من آخر
  رسالة من العميل.
- خارج النافذة **يجب** استخدام **قالب معتمد (Template)**. لذلك القوالب هي
  المسار الموصى به للإنتاج.

### 2.6 إنشاء القوالب المعتمدة

من **WhatsApp Manager → Message templates → Create template**:

- **Category:** `Utility`
- **Language:** `Arabic` (`ar`) — أو `ar_EG` إن اخترتها، مع ضبط
  `WHATSAPP_TEMPLATE_LANG` بنفس القيمة.
- استخدم متغيرات بأرقام متسلسلة تبدأ من `{{1}}`.

#### القالب العام (4 معاملات)

الاسم المقترح: `service_request_status_ar`

```
كلية الهندسة – جامعة عين شمس
إدارة الاستحقاقات

السيد/السيدة مقدم الطلب،
تحية طيبة وبعد،
تم تحديث حالة طلبكم.
رقم الطلب: {{1}}
الحالة الجديدة: {{2}}
تاريخ التحديث: {{3}}
لمتابعة تفاصيل الطلب: {{4}}
مع خالص التحية،
إدارة الاستحقاقات
```

قيم نموذجية عند الإنشاء (Sample values):

| المتغير | قيمة نموذجية |
| --- | --- |
| `{{1}}` | `1024` |
| `{{2}}` | `قيد التنفيذ` |
| `{{3}}` | `الأربعاء، 18 نوفمبر 2026، 11:30` |
| `{{4}}` | `https://insurance-system-9et.pages.dev/?track=1024` |

#### قالب الرفض (5 معاملات) — اختياري

الاسم المقترح: `service_request_rejected_ar`

```
كلية الهندسة – جامعة عين شمس
إدارة الاستحقاقات

السيد/السيدة مقدم الطلب،
تحية طيبة وبعد،
نأسف لإبلاغكم بأنه تم رفض طلبكم.
رقم الطلب: {{1}}
الحالة الجديدة: {{2}}
تاريخ التحديث: {{3}}
سبب الرفض: {{4}}
لمتابعة تفاصيل الطلب: {{5}}
مع خالص التحية،
إدارة الاستحقاقات
```

> **ملاحظة مهمة:** لا تُستخدم معاملات القالب إلا إذا كان
> `WHATSAPP_TEMPLATE_NAME` مضبوطًا. الرسالة النصية الكاملة (بالترتيب
> المطلوب) تُستخدم فقط عندما لا يوجد قالب — وهي تعمل داخل نافذة 24 ساعة
> أو لأرقام الاختبار.
>
> قالب الرفض لا يُستخدم إلا عند ضبط `WHATSAPP_TEMPLATE_REJECTED_NAME`
> و`WHATSAPP_SHARE_REJECTION_REASON=true` معًا. غير ذلك يُستخدم القالب
> العام، ولا يُذكر سبب الرفض.

انتظر حتى تصبح حالة القالب **Approved** قبل التفعيل.

---

## 3) قاعدة البيانات (Supabase SQL)

شغّل ملف الترحيل مرة واحدة من **Supabase Dashboard → SQL Editor**:

```
supabase/migrations/20261118_whatsapp_notifications.sql
```

الملف:

- ينشئ جدول `public.whatsapp_notifications` إن لم يكن موجودًا.
- يضيف الأعمدة الناقصة (idempotent) ولا يحذف أي بيانات.
- ينشئ فهرسًا فريدًا على `dedupe_key` وفهارس للبحث.
- يفعّل RLS ويمنع `anon`/`authenticated` ويمنح `service_role` فقط.
- **لا يعدّل** جدول `service_requests` ولا أي جدول قائم.

للتحقق بعد التشغيل:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'whatsapp_notifications'
order by ordinal_position;

select indexname from pg_indexes
where schemaname = 'public'
  and tablename = 'whatsapp_notifications';
```

---

## 4) نشر Edge Functions

من جذر المشروع (PowerShell)، وبعد `npx supabase login`:

```powershell
npx supabase link --project-ref epfppicdvkklzryworzu

npx supabase functions deploy send-whatsapp --project-ref epfppicdvkklzryworzu
npx supabase functions deploy update-service-request --project-ref epfppicdvkklzryworzu
```

- لا تستخدم `--no-verify-jwt`؛ الواجهة ترسل مفتاح anon تلقائيًا مع الطلب.
- `AUTH_SESSION_SECRET` مطلوب ومُستخدم بالفعل في `auth-login`، وتستخدمه
  الدالتان للتحقق من جلسة الموظف. تأكد من وجوده في Secrets.
- إذا لم تُنشر `update-service-request` بعد، تبقى الواجهة تعمل بالمسار
  القديم (حفظ مباشر) ثم تحاول الإشعار عبر `send-whatsapp`. بعد النشر يصبح
  التحقق من الجلسة والصلاحية على الخادم إلزاميًا.

---

## 5) أسرار Supabase المطلوبة

**لا تضع أي سر في ملف `.env` الخاص بالواجهة ولا في Git.** اضبطها عبر
Supabase Dashboard → **Edge Functions → Secrets** أو بالأمر التالي (استبدل
القيم محليًا في الطرفية فقط):

```powershell
npx supabase secrets set --project-ref epfppicdvkklzryworzu `
  WHATSAPP_TOKEN='ضع_التوكن_هنا' `
  WHATSAPP_PHONE_NUMBER_ID='ضع_Phone_Number_ID_هنا' `
  WHATSAPP_BUSINESS_ACCOUNT_ID='ضع_WABA_ID_هنا' `
  WHATSAPP_GRAPH_VERSION='v20.0' `
  WHATSAPP_TEMPLATE_NAME='service_request_status_ar' `
  WHATSAPP_TEMPLATE_REJECTED_NAME='service_request_rejected_ar' `
  WHATSAPP_TEMPLATE_LANG='ar' `
  WHATSAPP_TRACKING_BASE_URL='https://insurance-system-9et.pages.dev/' `
  WHATSAPP_OFFICIAL_NUMBER='201132853275' `
  WHATSAPP_SHARE_REJECTION_REASON='false' `
  WHATSAPP_SHARE_NOTES='false' `
  WHATSAPP_AUTO_SEND='false' `
  WHATSAPP_DRY_RUN='true'
```

> استخدم علامات اقتباس مفردة `'...'` في PowerShell حتى لا يفسّر الرموز
> الخاصة داخل التوكن. ولا تحفظ الأمر في سجل الطرفية على جهاز مشترك.

| السر | مطلوب | الافتراضي | الوصف |
| --- | --- | --- | --- |
| `WHATSAPP_TOKEN` | نعم للإرسال | — | توكن System User الدائم |
| `WHATSAPP_PHONE_NUMBER_ID` | نعم للإرسال | — | معرّف رقم الإرسال من Meta |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | اختياري | — | WABA ID (تشخيص/توثيق) |
| `WHATSAPP_GRAPH_VERSION` | اختياري | `v20.0` | إصدار Graph API |
| `WHATSAPP_TEMPLATE_NAME` | موصى به للإنتاج | — | قالب الحالة العام |
| `WHATSAPP_TEMPLATE_REJECTED_NAME` | اختياري | — | قالب الرفض |
| `WHATSAPP_TEMPLATE_LANG` | اختياري | `ar` | لغة القالب |
| `WHATSAPP_TRACKING_BASE_URL` | موصى به | — | أساس رابط المتابعة (https) |
| `WHATSAPP_OFFICIAL_NUMBER` | اختياري | `201132853275` | الرقم الرسمي للعرض/التوثيق |
| `WHATSAPP_SHARE_REJECTION_REASON` | اختياري | `false` | إظهار `notes` كسبب رفض |
| `WHATSAPP_SHARE_NOTES` | اختياري | `false` | إظهار الملاحظات الداخلية (غير مفضل) |
| `WHATSAPP_AUTO_SEND` | نعم للتفعيل | `false` | **البوابة الرئيسية**: `true` فقط بعد الاختبار |
| `WHATSAPP_DRY_RUN` | للاختبار | `false` | `true` = محاكاة دون إرسال حقيقي |
| `WHATSAPP_SERVICE_KEY` | اختياري | — | للطلبات القديمة `{to,text}` فقط |

> `WHATSAPP_SERVICE_KEY` غير مطلوب للنظام الجديد. بدونه تُرفض أي محاولة
> إرسال نص حر من المتصفح.

`VITE_WHATSAPP_MANUAL_FALLBACK` (اختياري، واجهة فقط): `true` يفتح محادثة
`wa.me` من حساب الموظف عند اكتمال الطلب. **ليس** مسار الإرسال الرسمي،
والافتراضي `false`.

---

## 6) الاختبار قبل التفعيل الحقيقي

### 6.1 اختبارات الوحدة

```powershell
npm run test:whatsapp
```

تغطي: تطبيع أرقام الهاتف، توحيد الحالات، نص الرسالة (رقم الطلب/الحالة/
التاريخ/الرابط)، سبب الرفض، رفض الروابط غير الآمنة، مفتاح منع التكرار،
وترتيب معاملات القالب.

### 6.2 اختبار Dry Run (بدون إرسال حقيقي)

1. `WHATSAPP_AUTO_SEND=true`
2. `WHATSAPP_DRY_RUN=true`
3. غيّر حالة طلب إلى **قيد التنفيذ**.

> يمكن تنفيذ Dry Run حتى قبل إضافة `WHATSAPP_TOKEN` و
> `WHATSAPP_PHONE_NUMBER_ID`؛ المحاكاة تتوقف قبل الاتصال بـ Meta.
4. من زر **📨 سجل إشعارات WhatsApp** تأكد من:
   - حالة `sent`
   - علامة `Dry Run`
   - `WhatsApp Message ID` يبدأ بـ `dry-run-`
   - الحالة محفوظة في الطلب.

### 6.3 اختبار إرسال حقيقي إلى رقم اختبار

1. أضف رقمك في **Meta App → WhatsApp → API Setup → To numbers**.
2. `WHATSAPP_DRY_RUN=false` و`WHATSAPP_AUTO_SEND=true`.
3. أضف طلبًا برقمك، ثم غيّره إلى **قيد التنفيذ** وتأكد من وصول الرسالة
   ومن ظهور `provider_message_id` الحقيقي في السجل.

### 6.4 سيناريوهات مطلوبة

| السيناريو | المتوقع |
| --- | --- |
| طلب جديد (استلام) | إشعار «جديدة» بعد نجاح الإدخال (خلال 15 دقيقة من الإنشاء) |
| قيد التنفيذ | إشعار واحد ويُسجَّل `sent` |
| تم التنفيذ | إشعار واحد + معاينة تلقائية في الواجهة |
| مرفوضة | إشعار رفض؛ يظهر السبب فقط عند `WHATSAPP_SHARE_REJECTION_REASON=true` |
| رقم هاتف مفقود/غير صالح | الحفظ ينجح، السجل `skipped` والسبب `missing_or_invalid_phone` |
| فشل الإرسال (توكن خاطئ مثلًا) | الحفظ ينجح، السجل `failed` مع رسالة Meta، ويمكن إعادة المحاولة |
| تكرار نفس الحالة / إعادة محاولة ناجحة | لا إشعار جديد (`duplicate` / `already_sent`) |
| انقطاع WhatsApp بالكامل | حفظ الطلب لا يتأثر إطلاقًا |

### 6.5 استعلامات تحقق

```sql
-- آخر الإشعارات
select request_id, trigger_status, status, attempts,
       provider_message_id, error_message, created_at, sent_at
from public.whatsapp_notifications
order by created_at desc
limit 20;

-- التأكد من عدم وجود تكرار لنفس المفتاح
select dedupe_key, count(*)
from public.whatsapp_notifications
group by dedupe_key
having count(*) > 1;
```

### 6.6 إعادة المحاولة

من **📨 سجل إشعارات WhatsApp**:

- السجلات `failed` و`skipped` (وأيضًا `pending`/`sending` العالقة) تعرض زر
  **🔁 إعادة المحاولة**.
- الإعادة تحدّث نفس السجل (نفس `dedupe_key`) ولا تنشئ إشعارًا مكررًا.
- السجل `sent` لا يُعاد إرساله.

---

## 7) التفعيل النهائي (بالترتيب)

1. نفّذ ملف SQL.
2. انشر الدالتين.
3. اضبط الأسرار مع `WHATSAPP_AUTO_SEND=false`.
4. اختبر `DRY_RUN=true`.
5. اختبر إرسالًا حقيقيًا إلى رقم اختبار.
6. اختبر السيناريوهات في القسم 6.4.
7. اضبط `WHATSAPP_AUTO_SEND=true` و`WHATSAPP_DRY_RUN=false`.
8. راقب السجل و**Quality rating** في Meta خلال أول أيام.

### الإيقاف الفوري (Rollback)

```powershell
npx supabase secrets set --project-ref epfppicdvkklzryworzu WHATSAPP_AUTO_SEND="false"
```

يتوقف الإرسال الحقيقي فورًا مع بقاء الحفظ والسجل يعملان. لا حاجة لتغيير
الكود. لإيقاف المحاولات كليًا يمكن كذلك ضبط `WHATSAPP_DRY_RUN="true"`.

---

## 8) استكشاف الأخطاء

| العرض | السبب المحتمل | الحل |
| --- | --- | --- |
| `not_configured` | توكن أو Phone Number ID ناقص | اضبط السرّين وأعد نشر/تحديث الدالة |
| `auto_send_disabled` | `WHATSAPP_AUTO_SEND` ليس `true` | فعّله بعد الاختبار |
| `missing_or_invalid_phone` | رقم الطلب فارغ أو غير مصري/دولي صالح | صحّح رقم الطلب ثم أعد المحاولة |
| `unauthorized` | جلسة الموظف منتهية/غير موجودة | أعد تسجيل الدخول |
| `forbidden` | لا يملك صلاحية `requests` | راجع صلاحيات المستخدم |
| `update_conflict` | تغيّر الطلب من موظف آخر | أعد تحميل القائمة ثم أعد المحاولة |
| `status_mismatch` | الحالة في القاعدة تختلف عن المطلوب | أعد تحميل القائمة |
| `whatsapp_api_error` + `code=190` | التوكن منتهي/غير صالح | أنشئ توكن System User جديد |
| `code=131030` | الرقم غير مسموح في وضع التطوير | أضفه إلى Test numbers أو انشر التطبيق |
| `code=131047` | خارج نافذة 24 ساعة بدون قالب | استخدم قالبًا معتمدًا |
| `code=132000/132001` | عدد/ترتيب المعاملات أو اسم القالب/اللغة غير مطابق | راجع القالب و`WHATSAPP_TEMPLATE_LANG` |
| `code=100` | معامل غير صالح | راجع تفاصيل الخطأ في السجل |
| `code=131026` | الرقم غير قابل للاستلام على WhatsApp | تحقق من الرقم |
| القالب `Pending/Rejected` | لم يُعتمد بعد | انتظر الاعتماد أو عدّل النص |

سجل الأخطاء التفصيلي يظهر في عمود **رسالة الخطأ** داخل نافذة السجل
(ويشمل `code` و`subcode` و`fbtrace_id` من Meta).

---

## 9) ملاحظات أمنية وتشغيلية

- لا تُشارك `WHATSAPP_TOKEN` في المحادثات أو لقطات الشاشة أو Git.
- لا تضع أسرارًا في `VITE_*`؛ أي متغير بهذا البادئة يُضمَّن في حزمة المتصفح.
- الجدول غير متاح للمتصفح؛ كل الوصول عبر دوال الحافة بمفتاح service role.
- الإشعار يُسجَّل دائمًا (نجاح/فشل/تخطٍّ) مع رقم الطلب والهاتف والحالة
  ووقت المحاولة وسبب الخطأ ومعرّف رسالة WhatsApp.
- لا يوجد أي مسار لاستقبال أوامر من WhatsApp، ولا يمكن تعديل حالة طلب من
  خلاله.
- الاحتفاظ بسجل الإشعارات مفيد للمراجعة؛ لا تحذف السجلات إن كنت تحتاج
  منع التكرار التاريخي.
- إشعار «تم استلام الطلب» يُرسل مرة واحدة لكل طلب جديد. وبما أن نموذج
  تقديم الطلب عام، فإن تفعيل الإرسال التلقائي يجعل كل طلب جديد يستهلك رسالة
  واحدة؛ عند ظهور إساءة استخدام يُنصح بإضافة CAPTCHA أو تحديد معدل على
  مستوى الاستضافة/النموذج العام.
