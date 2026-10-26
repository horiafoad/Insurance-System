-- ===============================================================
-- إصلاح صلاحيات قاعدة البيانات بعد الانتقال للمشروع الجديد
--   project ref: epfppicdvkklzryworzu
-- ---------------------------------------------------------------
-- المشكلة: بعض الجداول أُنشئت بدون منح الصلاحيات للدور anon،
-- فيظهر في التطبيق:
--   permission denied for table notification_reports   (code 42501)
--   permission denied for table users                  (code 42501)
--
-- شغّل هذا الملف مرة واحدة في:
--   Supabase → SQL Editor → New query → الصق → Run
-- الملف آمن وقابل لإعادة التشغيل ولا يحذف أي بيانات.
-- ===============================================================

grant usage on schema public to anon, authenticated;

-- 1) جداول وحدة الإشعارات --------------------------------------
grant select, insert, update, delete
  on public.notification_types
  to anon, authenticated;

grant select, insert, update, delete
  on public.notification_members
  to anon, authenticated;

grant select, insert, update, delete
  on public.notification_reports
  to anon, authenticated;

grant select, insert, update, delete
  on public.notification_reviews
  to anon, authenticated;

grant select, insert, update, delete
  on public.notification_attachments
  to anon, authenticated;

-- إضافة جداول الإشعارات إلى Realtime (اختياري، آمن لو كانت مضافة)
do $$
begin
  begin
    alter publication supabase_realtime add table public.notification_reports;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notification_reviews;
  exception when duplicate_object then null;
  end;
end $$;

-- 2) جدول المستخدمين (إدارة المستخدمين في لوحة التحكم) ----------
-- ملاحظة أمنية: هذا الجدول يخزّن كلمة المرور كنص صريح، ومنح anon
-- صلاحية قراءته يعني أن أي شخص يملك مفتاح anon يستطيع قراءتها.
-- هذا هو نفس سلوك المشروع القديم، وهو مطلوب حاليًا لكي تعمل شاشة
-- "إدارة المستخدمين" (إضافة/تعديل/حذف/عرض).
-- الحل الآمن لاحقًا: تشفير كلمة المرور (bcrypt) ونقل العمليات إلى
-- Edge Function بصلاحية service_role.
do $$
begin
  if to_regclass('public.users') is not null then
    execute 'grant select, insert, update, delete on public.users to anon, authenticated';
  end if;
end $$;

-- 3) التحقق بعد التنفيذ ----------------------------------------
-- يجب أن تُرجع أعدادًا بدون خطأ 401/42501
select 'notification_types' as table_name, count(*) from public.notification_types
union all
select 'notification_members', count(*) from public.notification_members
union all
select 'notification_reports', count(*) from public.notification_reports
union all
select 'notification_reviews', count(*) from public.notification_reviews
union all
select 'notification_attachments', count(*) from public.notification_attachments;
