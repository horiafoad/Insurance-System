-- ============================================================================
-- إصلاح سياسات RLS لجدولي أرشيف مفردات المرتب
-- ============================================================================
-- المشكلة: سكربت update_salary_archive_tables.sql كان يحذف سياسات الإدراج
--   fsa_insert_for_app / esa_insert_for_app من جدولي الأرشيف دون إعادة إنشائها.
-- النتيجة: "new row violates row-level security policy" عند الاستيراد.
--
-- التشغيل: من Supabase Dashboard -> SQL Editor -> New query -> Run
-- (يُشغَّل مرة واحدة، ويمكن تشغيله أكثر من مرة بأمان)
-- ============================================================================

-- ============================================================
-- 1) جدول أرشيف هيئة التدريس
-- ============================================================

alter table public.faculty_salary_archive enable row level security;

drop policy if exists "fsa_select_for_app" on public.faculty_salary_archive;
create policy "fsa_select_for_app"
  on public.faculty_salary_archive for select
  to anon, authenticated using (true);

drop policy if exists "fsa_insert_for_app" on public.faculty_salary_archive;
create policy "fsa_insert_for_app"
  on public.faculty_salary_archive for insert
  to anon, authenticated with check (true);

drop policy if exists "fsa_update_for_app" on public.faculty_salary_archive;
create policy "fsa_update_for_app"
  on public.faculty_salary_archive for update
  to anon, authenticated using (true) with check (true);

drop policy if exists "fsa_delete_for_app" on public.faculty_salary_archive;
create policy "fsa_delete_for_app"
  on public.faculty_salary_archive for delete
  to anon, authenticated using (true);

-- قائمة مراجعة هيئة التدريس
alter table public.faculty_salary_imports enable row level security;

drop policy if exists "fsi_select_for_app" on public.faculty_salary_imports;
create policy "fsi_select_for_app"
  on public.faculty_salary_imports for select
  to anon, authenticated using (true);

drop policy if exists "fsi_insert_for_app" on public.faculty_salary_imports;
create policy "fsi_insert_for_app"
  on public.faculty_salary_imports for insert
  to anon, authenticated with check (true);

drop policy if exists "fsi_update_for_app" on public.faculty_salary_imports;
create policy "fsi_update_for_app"
  on public.faculty_salary_imports for update
  to anon, authenticated using (true) with check (true);

drop policy if exists "fsi_delete_for_app" on public.faculty_salary_imports;
create policy "fsi_delete_for_app"
  on public.faculty_salary_imports for delete
  to anon, authenticated using (true);

-- ============================================================
-- 2) جدول أرشيف الموظفين
-- ============================================================

alter table public.employee_salary_archive enable row level security;

drop policy if exists "esa_select_for_app" on public.employee_salary_archive;
create policy "esa_select_for_app"
  on public.employee_salary_archive for select
  to anon, authenticated using (true);

drop policy if exists "esa_insert_for_app" on public.employee_salary_archive;
create policy "esa_insert_for_app"
  on public.employee_salary_archive for insert
  to anon, authenticated with check (true);

drop policy if exists "esa_update_for_app" on public.employee_salary_archive;
create policy "esa_update_for_app"
  on public.employee_salary_archive for update
  to anon, authenticated using (true) with check (true);

drop policy if exists "esa_delete_for_app" on public.employee_salary_archive;
create policy "esa_delete_for_app"
  on public.employee_salary_archive for delete
  to anon, authenticated using (true);

-- قائمة مراجعة الموظفين
alter table public.employee_salary_imports enable row level security;

drop policy if exists "esi_select_for_app" on public.employee_salary_imports;
create policy "esi_select_for_app"
  on public.employee_salary_imports for select
  to anon, authenticated using (true);

drop policy if exists "esi_insert_for_app" on public.employee_salary_imports;
create policy "esi_insert_for_app"
  on public.employee_salary_imports for insert
  to anon, authenticated with check (true);

drop policy if exists "esi_update_for_app" on public.employee_salary_imports;
create policy "esi_update_for_app"
  on public.employee_salary_imports for update
  to anon, authenticated using (true) with check (true);

drop policy if exists "esi_delete_for_app" on public.employee_salary_imports;
create policy "esi_delete_for_app"
  on public.employee_salary_imports for delete
  to anon, authenticated using (true);

-- ============================================================
-- 3) جدول تتبع ملفات الاستيراد (لتأكيد بقاء سياساته صحيحة)
-- ============================================================

alter table public.salary_import_files enable row level security;

drop policy if exists "Allow authenticated users to read import files" on public.salary_import_files;
create policy "Allow authenticated users to read import files"
  on public.salary_import_files for select
  to anon, authenticated using (true);

drop policy if exists "Allow authenticated users to insert import files" on public.salary_import_files;
create policy "Allow authenticated users to insert import files"
  on public.salary_import_files for insert
  to anon, authenticated with check (true);

drop policy if exists "Allow authenticated users to update import files" on public.salary_import_files;
create policy "Allow authenticated users to update import files"
  on public.salary_import_files for update
  to anon, authenticated using (true) with check (true);

-- تحديث كاش PostgREST ليقرأ السياسات الجديدة فورًا
notify pgrst, 'reload schema';