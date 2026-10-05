-- ============================================================================
-- 02-catalog.sql
-- ============================================================================
-- READ-ONLY. لا يحتوي على أي write operation.
-- الغرض: ميتاداتا الأعمدة لكل جدول (نوع كل عمود + مفتاحه الأساسي) حتى
--        يولّد السكربت تصديرًا بلا فقد (lossless) وترتيبًا حتميًا.
--
-- لماذا نحتاجه:
--   1) أعمدة numeric/decimal وjson/jsonb تُصدَّر كنص، لأن JSON.parse في
--      JavaScript قد يقرّب الأرقام العشرية فتُفقد دقة values المال.
--      النص يحفظ القيمة حرفيًا 100%.
--   2) المفتاح الأساسي (PK) يُستخدم لترتيب الصفوف ترتيبًا حتميًا، فتصبح
--      الـchunking آمنة بلا تكرار ولا نقص.
--
-- الاستخدام:
--   1) الصق في SQL Editor على المشروع القديم
--   2) شغّله
--   3) انسخ قيمة العمود `ndjson` فقط
--   4) احفظها في:  scripts/export-old-data/raw/02-catalog.txt
--
-- ملاحظة: نسخ يدوي وليس تلقائي لأن الحجم كبير. إن ظهرت الخلية مقطوعة،
--         شغّل الاستعلام التالي لكل جدول على حدة واستبدل t باسم الجدول:
--           select string_agg(format('%I %s%s', column_name, data_type,
--                 case when is_nullable='NO' then ' NOT NULL' else '' end), E'\n'
--                 order by ordinal_position)
--           from information_schema.columns
--           where table_schema='public' and table_name='<table>';
-- ============================================================================

select coalesce(string_agg(line, E'\n' order by tbl, ord), '[]') as ndjson
from (
  select
    c.table_name as tbl,
    c.ordinal_position as ord,
    format(
      '{"table":%L,"col":%L,"type":%L,"udt":%L,"nullable":%L,"lossless":%L,"pk":%L,"fk":%L}',
      c.table_name,
      c.column_name,
      c.data_type,
      c.udt_name,
      (c.is_nullable = 'YES'),
      (c.data_type in ('numeric', 'decimal', 'money')
         or c.udt_name in ('numeric', 'json', 'jsonb')),
      coalesce(pk.is_pk, false),
      coalesce(fk.ref, '')
    ) as line
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  left join lateral (
    select true as is_pk
    from information_schema.table_constraints tc
    join information_schema.key_column_usage k
      on k.constraint_name = tc.constraint_name
     and k.table_schema = tc.table_schema
    where tc.table_schema = c.table_schema
      and tc.table_name = c.table_name
      and tc.constraint_type = 'PRIMARY KEY'
      and k.column_name = c.column_name
    limit 1
  ) pk on true
  left join lateral (
    select
      ccu.table_schema || '.' || ccu.table_name || '.' || ccu.column_name as ref
    from information_schema.table_constraints tc
    join information_schema.key_column_usage k
      on k.constraint_name = tc.constraint_name
     and k.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
    where tc.table_schema = c.table_schema
      and tc.table_name = c.table_name
      and tc.constraint_type = 'FOREIGN KEY'
      and k.column_name = c.column_name
    limit 1
  ) fk on true
  where c.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
) s;
