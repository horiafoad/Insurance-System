-- ============================================================================
-- تبليغات هيئة التدريس / الموظفين / العقود
-- (قسم مستقل تمامًا — لا يلمس جداول الخطابات أو الأرشيف الحالي)
--
-- التشغيل: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- ملاحظات مهمة:
-- • التبليغات مرتبطة بفهرس مستقل (notification_members) وليس بنسخ من
--   بيانات الأرشيف. تتم تعبئة الفهرس من أرشيف المرتبات عند الحاجة فقط
--   (الاسم + الرقم) مع الاحتفاظ بمرجع المصدر في metadata.
-- • أنواع التبليغات مفصولة لكل قسم (faculty / employees / contracts).
-- • إيقاف نوع لا يحذفه ولا يغيّر بيانات التبليغات القديمة، لأن كل تبليغ
--   يحفظ نسخة ثابتة من type_code وtype_name وdetails.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 0) السماح بأدوار التبليغات في جدول users
--    الجدول القديم قد يقيّد role على super_admin/admin/user وبطول 20 حرفًا،
--    بينما "notifications_creator" أطول من ذلك. نوسّع النوع ونستبدل القيد
--    دون المساس بأي بيانات موجودة.
-- ---------------------------------------------------------------
alter table public.users alter column role type text;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'users'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.users drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.users
  add constraint users_role_check
  check (role in (
    'super_admin',
    'admin',
    'user',
    'creator',
    'notifications_creator',
    'payroll_entry',
    'payroll_reviewer',
    'notifications_admin'
  )) not valid;

-- ---------------------------------------------------------------
-- 1) أنواع التبليغات (مستقلة لكل قسم)
-- ---------------------------------------------------------------
create table if not exists public.notification_types (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('faculty', 'employees', 'contracts')),
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  extra_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section, code)
);

create index if not exists idx_notification_types_section
  on public.notification_types (section, sort_order, name);

-- ---------------------------------------------------------------
-- 2) فهرس الأعضاء (ملف ثابت لكل عضو/موظف/متعاقد)
-- ---------------------------------------------------------------
create table if not exists public.notification_members (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('faculty', 'employees', 'contracts')),
  external_id text,
  full_name text not null,
  job_title text,
  department text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section, external_id)
);

create index if not exists idx_notification_members_section
  on public.notification_members (section, full_name);

create index if not exists idx_notification_members_external
  on public.notification_members (section, external_id);

-- ---------------------------------------------------------------
-- 3) التبليغات
--    status:
--      draft          = مسودة
--      pending_entry  = بانتظار مراجعة مدخل البيرول
--      entry_reviewed = تمت مراجعة المدخل
--      final_reviewed = تمت المراجعة النهائية
--      rejected       = مرفوض
-- ---------------------------------------------------------------
create table if not exists public.notification_reports (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('faculty', 'employees', 'contracts')),
  member_id uuid references public.notification_members(id) on delete set null,
  member_name text not null,
  member_number text,
  type_id uuid references public.notification_types(id) on delete restrict,
  type_code text not null,
  type_name text not null,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  effective_date date,
  reason text,
  payment_method text,
  new_payment_method text,
  promotion_from text,
  promotion_to text,
  amount numeric(14, 2),
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending_entry'
    check (status in ('draft', 'pending_entry', 'entry_reviewed', 'final_reviewed', 'rejected')),
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_reports_section_month
  on public.notification_reports (section, year, month);

create index if not exists idx_notification_reports_member
  on public.notification_reports (member_id, member_number);

create index if not exists idx_notification_reports_type
  on public.notification_reports (type_id);

create index if not exists idx_notification_reports_status
  on public.notification_reports (section, status);

create index if not exists idx_notification_reports_creator
  on public.notification_reports (created_by);

-- ---------------------------------------------------------------
-- 4) سجل المراجعة (لا يُسجَّل إلا بضغط زر التأكيد)
-- ---------------------------------------------------------------
create table if not exists public.notification_reviews (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notification_reports(id) on delete cascade,
  stage text not null check (stage in ('entry', 'final')),
  status text not null default 'completed' check (status in ('completed', 'rejected')),
  previous_stage text,
  next_stage text,
  user_id uuid,
  user_name text,
  notes text,
  acted_at timestamptz not null default now()
);

create index if not exists idx_notification_reviews_report
  on public.notification_reviews (notification_id, acted_at);

-- ---------------------------------------------------------------
-- 5) مرفقات التبليغ
-- ---------------------------------------------------------------
create table if not exists public.notification_attachments (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notification_reports(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_path text,
  bucket text,
  storage_provider text,
  storage_key text,
  mime_type text,
  size_bytes bigint,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_attachments_report
  on public.notification_attachments (notification_id);

-- ---------------------------------------------------------------
-- 6) Row Level Security
--    النظام يستخدم تسجيل الدخول الحالي على مستوى التطبيق (بدون
--    Supabase Auth)، لذلك تتبع السياسات نفس نمط باقي جداول المشروع.
--    الصلاحيات الدقيقة (إنشاء/تعديل/حذف/مراجعة) تُفرض في الواجهة
--    عبر users.permissions، ويُسجَّل اسم المستخدم مع كل مراجعة.
-- ---------------------------------------------------------------
alter table public.notification_types enable row level security;
alter table public.notification_members enable row level security;
alter table public.notification_reports enable row level security;
alter table public.notification_reviews enable row level security;
alter table public.notification_attachments enable row level security;

drop policy if exists "notification_types_select_for_app" on public.notification_types;
create policy "notification_types_select_for_app"
  on public.notification_types for select to anon, authenticated using (true);

drop policy if exists "notification_types_insert_for_app" on public.notification_types;
create policy "notification_types_insert_for_app"
  on public.notification_types for insert to anon, authenticated with check (true);

drop policy if exists "notification_types_update_for_app" on public.notification_types;
create policy "notification_types_update_for_app"
  on public.notification_types for update to anon, authenticated using (true) with check (true);

drop policy if exists "notification_types_delete_for_app" on public.notification_types;
create policy "notification_types_delete_for_app"
  on public.notification_types for delete to anon, authenticated using (true);

drop policy if exists "notification_members_select_for_app" on public.notification_members;
create policy "notification_members_select_for_app"
  on public.notification_members for select to anon, authenticated using (true);

drop policy if exists "notification_members_insert_for_app" on public.notification_members;
create policy "notification_members_insert_for_app"
  on public.notification_members for insert to anon, authenticated with check (true);

drop policy if exists "notification_members_update_for_app" on public.notification_members;
create policy "notification_members_update_for_app"
  on public.notification_members for update to anon, authenticated using (true) with check (true);

drop policy if exists "notification_members_delete_for_app" on public.notification_members;
create policy "notification_members_delete_for_app"
  on public.notification_members for delete to anon, authenticated using (true);

drop policy if exists "notification_reports_select_for_app" on public.notification_reports;
create policy "notification_reports_select_for_app"
  on public.notification_reports for select to anon, authenticated using (true);

drop policy if exists "notification_reports_insert_for_app" on public.notification_reports;
create policy "notification_reports_insert_for_app"
  on public.notification_reports for insert to anon, authenticated with check (true);

drop policy if exists "notification_reports_update_for_app" on public.notification_reports;
create policy "notification_reports_update_for_app"
  on public.notification_reports for update to anon, authenticated using (true) with check (true);

drop policy if exists "notification_reports_delete_for_app" on public.notification_reports;
create policy "notification_reports_delete_for_app"
  on public.notification_reports for delete to anon, authenticated using (true);

drop policy if exists "notification_reviews_select_for_app" on public.notification_reviews;
create policy "notification_reviews_select_for_app"
  on public.notification_reviews for select to anon, authenticated using (true);

drop policy if exists "notification_reviews_insert_for_app" on public.notification_reviews;
create policy "notification_reviews_insert_for_app"
  on public.notification_reviews for insert to anon, authenticated with check (true);

drop policy if exists "notification_attachments_select_for_app" on public.notification_attachments;
create policy "notification_attachments_select_for_app"
  on public.notification_attachments for select to anon, authenticated using (true);

drop policy if exists "notification_attachments_insert_for_app" on public.notification_attachments;
create policy "notification_attachments_insert_for_app"
  on public.notification_attachments for insert to anon, authenticated with check (true);

drop policy if exists "notification_attachments_update_for_app" on public.notification_attachments;
create policy "notification_attachments_update_for_app"
  on public.notification_attachments for update to anon, authenticated using (true) with check (true);

drop policy if exists "notification_attachments_delete_for_app" on public.notification_attachments;
create policy "notification_attachments_delete_for_app"
  on public.notification_attachments for delete to anon, authenticated using (true);

-- ---------------------------------------------------------------
-- 6.1) الصلاحيات الأساسية (GRANT)
--    سياسات RLS لا تعمل بدون منح الصلاحيات للدور anon، وهذا ما كان
--    يسبب الخطأ: permission denied for table notification_* (42501).
-- ---------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.notification_types
  to anon, authenticated;
grant select, insert, update, delete on public.notification_members
  to anon, authenticated;
grant select, insert, update, delete on public.notification_reports
  to anon, authenticated;
grant select, insert, update, delete on public.notification_reviews
  to anon, authenticated;
grant select, insert, update, delete on public.notification_attachments
  to anon, authenticated;

-- ---------------------------------------------------------------
-- 7) Bucket مستقل للمرفقات
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('notification-attachments', 'notification-attachments', true)
on conflict (id) do nothing;

drop policy if exists "notification_attachments_upload_objects" on storage.objects;
create policy "notification_attachments_upload_objects"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'notification-attachments');

drop policy if exists "notification_attachments_read_objects" on storage.objects;
create policy "notification_attachments_read_objects"
  on storage.objects for select to public
  using (bucket_id = 'notification-attachments');

drop policy if exists "notification_attachments_update_objects" on storage.objects;
create policy "notification_attachments_update_objects"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'notification-attachments')
  with check (bucket_id = 'notification-attachments');

drop policy if exists "notification_attachments_delete_objects" on storage.objects;
create policy "notification_attachments_delete_objects"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'notification-attachments');

-- ---------------------------------------------------------------
-- 8) الأنواع الافتراضية — هيئة التدريس
-- ---------------------------------------------------------------
insert into public.notification_types (section, code, name, description, sort_order, extra_fields)
values
  ('faculty', 'salary_disbursement', 'صرف المرتب', 'تبليغ بصرف مرتب عضو هيئة التدريس', 10,
   '[{"key":"amount","label":"قيمة الصرف","type":"number","required":false},{"key":"payment_date","label":"تاريخ الصرف","type":"date","required":false},{"key":"payment_method","label":"طريقة الصرف","type":"select","required":false,"options":["تحويل بنكي","نقدًا","شيك","محفظة إلكترونية"]}]'::jsonb),

  ('faculty', 'salary_stop', 'وقف المرتب', 'تبليغ بوقف مرتب عضو هيئة التدريس', 20,
   '[{"key":"reason","label":"سبب الوقف","type":"select","required":true,"options":["الاستقالة","الوفاة","الإعارة الداخلية","الإعارة الخارجية","مهمة علمية بدون مرتب","إجازة دراسية بدون مرتب","رعاية طفل"]},{"key":"effective_date","label":"تاريخ سريان الوقف","type":"date","required":true},{"key":"payment_method","label":"طريقة الدفع الحالية","type":"select","required":false,"options":["تحويل بنكي","نقدًا","شيك","محفظة إلكترونية"]}]'::jsonb),

  ('faculty', 'payment_method_change', 'تغيير طريقة الدفع', 'تبليغ بتغيير طريقة دفع المرتب', 30,
   '[{"key":"payment_method","label":"طريقة الدفع الحالية","type":"select","required":false,"options":["تحويل بنكي","نقدًا","شيك","محفظة إلكترونية"]},{"key":"new_payment_method","label":"طريقة الدفع الجديدة","type":"select","required":true,"options":["تحويل بنكي","نقدًا","شيك","محفظة إلكترونية"]},{"key":"effective_date","label":"تاريخ السريان","type":"date","required":true}]'::jsonb),

  ('faculty', 'study_leave_with_salary', 'إجازة دراسية بمرتب', 'تبليغ بإجازة دراسية مع صرف المرتب', 40,
   '[{"key":"leave_start","label":"تاريخ بداية الإجازة","type":"date","required":true},{"key":"leave_end","label":"تاريخ نهاية الإجازة","type":"date","required":false},{"key":"university","label":"الجهة / الجامعة","type":"text","required":false},{"key":"effective_date","label":"تاريخ السريان","type":"date","required":false}]'::jsonb),

  ('faculty', 'deductions', 'الخصومات', 'تبليغ بخصم مالي من المرتب', 50,
   '[{"key":"amount","label":"قيمة الخصم","type":"number","required":true},{"key":"deduction_reason","label":"سبب الخصم","type":"text","required":false},{"key":"installments","label":"عدد الأقساط","type":"number","required":false},{"key":"effective_date","label":"تاريخ السريان","type":"date","required":false}]'::jsonb),

  ('faculty', 'promotion', 'الترقية', 'تبليغ بترقية عضو هيئة التدريس في التسلسل الوظيفي', 60,
   '[{"key":"promotion_from","label":"الدرجة الحالية","type":"select","required":true,"options":["معيد","مدرس مساعد","مدرس","أستاذ مساعد","أستاذ"]},{"key":"promotion_to","label":"الدرجة الجديدة","type":"select","required":true,"options":["معيد","مدرس مساعد","مدرس","أستاذ مساعد","أستاذ"]},{"key":"effective_date","label":"تاريخ الترقية","type":"date","required":true}]'::jsonb)
on conflict (section, code) do nothing;

-- ---------------------------------------------------------------
-- 9) الأنواع الافتراضية — الموظفون
-- ---------------------------------------------------------------
insert into public.notification_types (section, code, name, description, sort_order, extra_fields)
values
  ('employees', 'salary_disbursement', 'صرف المرتب', 'تبليغ بصرف مرتب الموظف', 10,
   '[{"key":"amount","label":"قيمة الصرف","type":"number","required":false},{"key":"payment_date","label":"تاريخ الصرف","type":"date","required":false},{"key":"payment_method","label":"طريقة الصرف","type":"select","required":false,"options":["تحويل بنكي","نقدًا","شيك","محفظة إلكترونية"]}]'::jsonb),

  ('employees', 'salary_stop', 'وقف المرتب', 'تبليغ بوقف مرتب الموظف', 20,
   '[{"key":"reason","label":"سبب الوقف","type":"select","required":true,"options":["الاستقالة","الوفاة","الإعارة الداخلية","الإعارة الخارجية","مهمة علمية بدون مرتب","إجازة دراسية بدون مرتب","رعاية طفل"]},{"key":"effective_date","label":"تاريخ سريان الوقف","type":"date","required":true}]'::jsonb),

  ('employees', 'payment_method_change', 'تغيير طريقة الدفع', 'تبليغ بتغيير طريقة دفع المرتب', 30,
   '[{"key":"payment_method","label":"طريقة الدفع الحالية","type":"select","required":false,"options":["تحويل بنكي","نقدًا","شيك","محفظة إلكترونية"]},{"key":"new_payment_method","label":"طريقة الدفع الجديدة","type":"select","required":true,"options":["تحويل بنكي","نقدًا","شيك","محفظة إلكترونية"]},{"key":"effective_date","label":"تاريخ السريان","type":"date","required":true}]'::jsonb),

  ('employees', 'study_leave_with_salary', 'إجازة دراسية بمرتب', 'تبليغ بإجازة دراسية مع صرف المرتب', 40,
   '[{"key":"leave_start","label":"تاريخ بداية الإجازة","type":"date","required":true},{"key":"leave_end","label":"تاريخ نهاية الإجازة","type":"date","required":false},{"key":"university","label":"الجهة / الجامعة","type":"text","required":false}]'::jsonb),

  ('employees', 'deductions', 'الخصومات', 'تبليغ بخصم مالي من المرتب', 50,
   '[{"key":"amount","label":"قيمة الخصم","type":"number","required":true},{"key":"deduction_reason","label":"سبب الخصم","type":"text","required":false},{"key":"installments","label":"عدد الأقساط","type":"number","required":false}]'::jsonb),

  ('employees', 'promotion', 'الترقية', 'تبليغ بترقية الموظف', 60,
   '[{"key":"promotion_from","label":"الدرجة الحالية","type":"text","required":true},{"key":"promotion_to","label":"الدرجة الجديدة","type":"text","required":true},{"key":"effective_date","label":"تاريخ الترقية","type":"date","required":true}]'::jsonb)
on conflict (section, code) do nothing;

-- ---------------------------------------------------------------
-- 10) الأنواع الافتراضية — العقود
-- ---------------------------------------------------------------
insert into public.notification_types (section, code, name, description, sort_order, extra_fields)
values
  ('contracts', 'salary_disbursement', 'صرف المرتب', 'تبليغ بصرف مستحقات المتعاقد', 10,
   '[{"key":"amount","label":"قيمة الصرف","type":"number","required":false},{"key":"payment_date","label":"تاريخ الصرف","type":"date","required":false}]'::jsonb),

  ('contracts', 'salary_stop', 'وقف المرتب', 'تبليغ بوقف مستحقات المتعاقد', 20,
   '[{"key":"reason","label":"سبب الوقف","type":"select","required":true,"options":["الاستقالة","الوفاة","الإعارة الداخلية","الإعارة الخارجية","مهمة علمية بدون مرتب","إجازة دراسية بدون مرتب","رعاية طفل"]},{"key":"effective_date","label":"تاريخ سريان الوقف","type":"date","required":true}]'::jsonb),

  ('contracts', 'payment_method_change', 'تغيير طريقة الدفع', 'تبليغ بتغيير طريقة دفع المستحقات', 30,
   '[{"key":"payment_method","label":"طريقة الدفع الحالية","type":"select","required":false,"options":["تحويل بنكي","نقدًا","شيك","محفظة إلكترونية"]},{"key":"new_payment_method","label":"طريقة الدفع الجديدة","type":"select","required":true,"options":["تحويل بنكي","نقدًا","شيك","محفظة إلكترونية"]},{"key":"effective_date","label":"تاريخ السريان","type":"date","required":true}]'::jsonb),

  ('contracts', 'deductions', 'الخصومات', 'تبليغ بخصم مالي من المستحقات', 40,
   '[{"key":"amount","label":"قيمة الخصم","type":"number","required":true},{"key":"deduction_reason","label":"سبب الخصم","type":"text","required":false}]'::jsonb),

  ('contracts', 'contract_renewal', 'تجديد العقد', 'تبليغ بتجديد عقد', 50,
   '[{"key":"contract_start","label":"تاريخ بداية العقد","type":"date","required":true},{"key":"contract_end","label":"تاريخ نهاية العقد","type":"date","required":true},{"key":"contract_value","label":"قيمة العقد","type":"number","required":false}]'::jsonb)
on conflict (section, code) do nothing;

-- ---------------------------------------------------------------
-- 11) تعبئة فهرس الأعضاء من الأرشيف الحالي (بدون نسخ الملفات)
-- ---------------------------------------------------------------
insert into public.notification_members (section, external_id, full_name, metadata)
select
  'faculty',
  btrim(a.computer_number),
  max(a.faculty_name),
  jsonb_build_object('source', 'faculty_salary_archive')
from public.faculty_salary_archive a
where a.computer_number is not null and btrim(a.computer_number) <> ''
group by btrim(a.computer_number)
on conflict (section, external_id) do update
set full_name = excluded.full_name,
    metadata = public.notification_members.metadata || excluded.metadata,
    updated_at = now();

insert into public.notification_members (section, external_id, full_name, metadata)
select
  'employees',
  btrim(a.computer_number),
  max(a.employee_name),
  jsonb_build_object('source', 'employee_salary_archive')
from public.employee_salary_archive a
where a.computer_number is not null and btrim(a.computer_number) <> ''
group by btrim(a.computer_number)
on conflict (section, external_id) do update
set full_name = excluded.full_name,
    metadata = public.notification_members.metadata || excluded.metadata,
    updated_at = now();

-- ============================================================================
-- انتهى. لا يتم حذف أي جدول أو بيانات موجودة.
-- ============================================================================
