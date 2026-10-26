-- ===============================================================
-- استكمال صلاحيات جدول users المطلوبة لإدارة المستخدمين
--   project ref: epfppicdvkklzryworzu
-- ---------------------------------------------------------------
-- الحالة الحالية: anon يستطيع قراءة الأعمدة العادية وتعديلها،
-- لكنه لا يستطيع:
--   * إنشاء مستخدم جديد           → permission denied (42501) عند INSERT
--   * تعيين/تغيير كلمة المرور      → permission denied (42501) عند UPDATE password
--
-- هذا الملف يمنح هاتين الصلاحيتين فقط، مع إبقاء قراءة كلمة المرور
-- ممنوعة عن anon (لا يمكن سحب كلمات المرور من المتصفح).
--
-- طريقة التنفيذ: Supabase → SQL Editor → New query → الصق → Run
-- ===============================================================

grant usage on schema public to anon, authenticated;

-- إنشاء حساب جديد من صفحة إدارة المستخدمين
grant insert on public.users to anon, authenticated;

-- تعيين كلمة المرور عند الإنشاء أو التعديل (عمود password فقط)
grant update (password) on public.users to anon, authenticated;

-- التحقق: يجب أن تُرجع الاستعلامات التالية نجاحًا بدون أخطاء
-- (يمكنك تجاهل النتيجة، المهم عدم ظهور permission denied)
-- select id, username from public.users limit 1;
