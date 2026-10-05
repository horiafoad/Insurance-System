-- ============================================================================
-- 03-test-users-preview.sql
-- ============================================================================
-- READ-ONLY. لا يحتوي على أي write operation.
-- هذا هو اختبار الجدول الصغير المطلوب: table = users
-- الغرض: التأكد أن المسار يعمل قبل باقي الجداول.
--
-- ⛔ لا يطبع أي password.
--    كلمة المرور تُعرض كـclassification فقط:
--      'BCRYPT'  → طول 60 ويبدأ بـ $2
--      'PLAINTEXT' → نص صريح (خطأ أمني قائم، we'll hash it on import)
--      'EMPTY'
--    لا يظهر أي جزء من القيمة.
--
-- الاستخدام:
--   1) الصق في SQL Editor على المشروع القديم
--   2) شغّله  →  يجب أن ترى عدد الصفوف
--   3) انسخ قيمة العمود `report` فقط
--   4) احفظها في:  scripts/export-old-data/raw/03-users-preview.txt
-- ============================================================================

select
  'rows: ' || (select count(*) from public.users) || E'\n'
  || '--- per-user password classification (no values) ---' || E'\n'
  || coalesce((
       select string_agg(
         format('%-22s %-10s %-8s pw=%s',
                coalesce(u.username,'(null)'),
                coalesce(u.role,'(null)'),
                coalesce(u.full_name is not null::text,'-'),
                case
                  when u.password is null then 'NULL'
                  when u.password = '' then 'EMPTY'
                  when u.password like '$2%' and length(u.password) = 60 then 'BCRYPT'
                  else 'PLAINTEXT'
                end),
                E'\n' order by u.id)
       from public.users u
     ), 'none')
  || E'\n' || '--- column list ---' || E'\n'
  || (select string_agg(c.column_name || ' ' || c.udt_name
                        || case when c.is_nullable='NO' then ' NOT NULL' else '' end,
                        E'\n' order by c.ordinal_position)
      from information_schema.columns c
      where c.table_schema='public' and c.table_name='users')
  as report;
