-- ============================================================================
-- 01-discovery.sql  (READ-ONLY)
-- ============================================================================
-- المشروع القديم: jpybzalxcezxhokzmwdx
--
-- ممنوع في هذا الملف: CREATE / INSERT / UPDATE / DELETE / DROP / ALTER /
--                      TRUNCATE / COPY
-- لا يُنشئ أي كائن ولا يغيّر أي بيانات ولا schema. فقط SELECT على الكتالوج.
--
-- ---------------------------------------------------------------------------
-- لماذا لا يُحسب count(*) هنا مباشرة؟
-- ---------------------------------------------------------------------------
-- أي `count(*) from public.<table>` يفشل الاستعلام كله إن لم يكن الجدول
-- موجودًا:
--     ERROR: 42P01: relation "public.faculty_salary_archive" does not exist
-- لأن PostgreSQL يخطّط الاستعلام قبل تنفيذه، فلا يمكن تخطّي جدول غائب
-- بشرط داخل الاستعلام نفسه.
--
-- الحل: لا تُفترض أي جداول. نقرأ الكتالوج أولًا (information_schema /
--      pg_class) ونكتشف الموجود فعليًا، ثم نستخدم to_regclass() لفحص
--      كل جدول متوقّع على حدة.
--
-- ---------------------------------------------------------------------------
-- كيفية الاستخدام (3 خطوات)
-- ---------------------------------------------------------------------------
-- 1) شغّل [1] أسفله  → انسخ خلية  report  → احفظها في:
--        scripts/export-old-data/raw/01-discovery.txt
--
-- 2) شغّل [2] أسفله  → ينتج لك statement جاهز به counts الدقيقة.
--    انسخ ناتج الخلية run_this_next والصقه في SQL Editor وشغّله.
--    (هو read-only: select count(*) فقط)
--
-- 3) انسخ خلية  report  الناتجة من [2] → ضعها في نفس الملف:
--        scripts/export-old-data/raw/01-discovery.txt
--    (تستبدل محتوى الخطوة 1، لأنها تحتوي العدّ الدقيق)
--
-- ملاحظة: generate.mjs يقبل أيضًا تقديرات Step 1 إن تخطّيت Step 2،
--          لكنه سيستخدم chunk واحدًا كبيرًا للجداول الكبيرة. مُستحسن
--          عمل Step 2 قبل التصدير.
-- ============================================================================


-- ############################################################################
-- [1] discovery — الجداول الموجودة فعليًا
-- ############################################################################
-- مخرج واحد: خلية report نصية واحدة قابلة للنسخ.
-- لا يفشل مهما كان مفقودًا من الجداول.
--
-- كل تجميع هنا scalar subquery مستقل له FROM خاص به.
-- سبب: الـouter SELECT بلا FROM، فـaliases مثل a/o (داخل CTE app/others)
-- ليست في نطاقه. لا نضيف FROM مشترك للـCTEين لأن ذلك يُنتج Cartesian
-- product ويكرّر النتائج.Scalar subquery لكل تجميع = لا تكرار ولا خطأ 42P01.
-- ############################################################################
with app_tables(ord, t) as (
  values
    (1,'users'), (2,'letter_sectors'), (3,'letter_departments'),
    (4,'letter_senders'), (5,'letter_templates'), (6,'letters'),
    (7,'letter_movements'), (8,'letter_number_counter'), (9,'issues'),
    (10,'issue_details'), (11,'case_documents'), (12,'archive_qr_codes'),
    (13,'executive_orders'), (14,'executive_order_persons'),
    (15,'faculty_salary_archive'), (16,'faculty_salary_imports'),
    (17,'faculty_salary_pages'), (18,'salary_import_files'),
    (19,'employee_salary_archive'), (20,'employee_salary_imports'),
    (21,'claims'), (22,'tasks'), (23,'service_requests'),
    (24,'performance_evaluations'), (25,'training_courses'),
    (26,'course_registrations'), (27,'employee_tasks'), (28,'notifications'),
    (29,'public_feedback'), (30,'push_subscriptions'),
    (31,'support_requests'), (32,'scanner_inbox')
),
present as (
  -- الجداول الحقيقية في public فقط. relkind r = ordinary, p = partitioned
  select
    c.relname as t,
    greatest(coalesce(s.n_live_tup, c.reltuples, 0), 0)::bigint as approx,
    pg_total_relation_size(c.oid) as bytes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
),
app_status as (
  select
    a.ord,
    a.t,
    (to_regclass('public.' || a.t) is not null) as present_flag,
    p.approx,
    p.bytes
  from app_tables a
  left join present p on p.t = a.t
),
others as (
  select p.t, p.approx, p.bytes
  from present p
  where not exists (select 1 from app_tables a where a.t = p.t)
)
select
    '--- app tables ---' || E'\n'
  || coalesce((
       select string_agg(
                format('%-30s %-8s approx=%-10s bytes=%s',
                       a.t,
                       case when a.present_flag then 'EXISTS' else 'MISSING' end,
                       case when a.present_flag then a.approx::text else '-' end,
                       case when a.present_flag then a.bytes::text else '-' end),
                E'\n' order by a.ord)
       from app_status a
     ), 'none')
  || E'\n' || '--- public tables NOT used by app ---' || E'\n'
  || coalesce((
       select string_agg(
                format('%-30s approx=%-10s bytes=%s', o.t, o.approx, o.bytes),
                E'\n' order by o.t)
       from others o
     ), 'none')
  || E'\n' || '--- totals ---' || E'\n'
  || format('app tables: total=%s present=%s missing=%s',
       (select count(*) from app_tables),
       (select count(*) from app_status where present_flag),
       (select count(*) from app_status where not present_flag))
  || E'\n'
  || format('public tables: %s', (select count(*) from present))
  || E'\n'
  || format('app rows (approx): %s',
       (select coalesce(sum(approx), 0) from app_status where present_flag))
  || E'\n' || 'missing: '
  || coalesce((select string_agg(t, ',' order by ord)
               from app_status where not present_flag), 'none')
  || E'\n' || 'schema_signature: '
  || coalesce((select md5(string_agg(t || '=' || approx, ',' order by t))
               from app_status where present_flag), 'empty')
  as report;


-- ############################################################################
-- [2] exact counts — يُنتج statement جاهزًا للجداول الموجودة فقط
-- ############################################################################
-- لا ينفّذ شيئًا. يطبع نص SQL لتنسخه ثم تشغيله.
-- لن يذكر أي جدول غير موجود، لذلك لن يفشل.
-- ############################################################################
with app_tables(ord, t) as (
  values
    (1,'users'), (2,'letter_sectors'), (3,'letter_departments'),
    (4,'letter_senders'), (5,'letter_templates'), (6,'letters'),
    (7,'letter_movements'), (8,'letter_number_counter'), (9,'issues'),
    (10,'issue_details'), (11,'case_documents'), (12,'archive_qr_codes'),
    (13,'executive_orders'), (14,'executive_order_persons'),
    (15,'faculty_salary_archive'), (16,'faculty_salary_imports'),
    (17,'faculty_salary_pages'), (18,'salary_import_files'),
    (19,'employee_salary_archive'), (20,'employee_salary_imports'),
    (21,'claims'), (22,'tasks'), (23,'service_requests'),
    (24,'performance_evaluations'), (25,'training_courses'),
    (26,'course_registrations'), (27,'employee_tasks'), (28,'notifications'),
    (29,'public_feedback'), (30,'push_subscriptions'),
    (31,'support_requests'), (32,'scanner_inbox')
),
present_app as (
  select a.ord, a.t
  from app_tables a
  where to_regclass('public.' || a.t) is not null
),
built as (
  select string_agg(
           format('select %L as t, count(*) as c from public.%I', p.t, p.t),
           ' union all ' order by p.ord) as unions
  from present_app p
)
select
  case
    when built.unions is null then
      '-- no expected app table exists in this database'
    else
      format($q$
select '--- app tables (exact count) ---' || E'\n'
    || string_agg(format('%%-30s %%s', t, c), E'\n' order by t) as report
from (
  %s
) s;
$q$, built.unions)
  end as run_this_next
from built;


-- ############################################################################
-- لا يحتوي هذا الملف على أي بيانات (INSERT/COPY) ولا أي secret.
-- ############################################################################
