-- ============================================================================
-- 20261026_study_leaves_and_salary_status.sql
-- ----------------------------------------------------------------------------
-- إضافات فقط (لا حذف لأي جدول أو عمود أو صف):
--   1) جدول study_leaves          — نقل الإجازات الدراسية من localStorage إلى DB
--   2) أعمدة PDF على claims        — لإرفاق PDF لكل مطالبة (بدون حذف أي بيانات)
--   3) جدول faculty_salary_status — إيقاف/إعادة تفعيل مرتب عضو هيئة التدريس
--
-- ملاحظة أمنية: نمط المشروع الحالي (faculty_salary_archive) يفعّل RLS بسياسات
-- سماح للتطبيق (anon/authenticated) لأن التحقق من الصلاحيات يتم في الواجهة.
-- نتبع نفس النمط هنا حتى لا تتعطل الصفحات، مع إبقاء RLS مفعّلًا.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) الإجازات الدراسية
-- ---------------------------------------------------------------------------
create table if not exists public.study_leaves (
  id                  uuid primary key default gen_random_uuid(),

  -- معرّف السجل في النسخة المحلية القديمة (localStorage) — للربط والاستعادة
  legacy_id           text,

  serial              text,
  employee_code       text,
  name                text not null,
  job_title           text,
  grade               text,
  leave_pay_type      text,
  order_number        text,
  order_date          date,
  order_note          text,
  leave_kind          text,
  start_date          date,
  end_date            date,
  five_year_end       date,
  remaining_days      text,
  salary_status       text,
  returned_to_work    text,
  end_reason          text,
  claim_made          text,
  notes               text,

  -- الصف الأصلي كما ورد في ملف Excel (حفاظًا كاملًا على الأرقام والنصوص)
  data                jsonb not null default '{}'::jsonb,

  -- مرفق PDF (محلي على جهاز المستخدم — نفس نمط أرشيف هيئة التدريس)
  pdf_url             text,
  pdf_file_name       text,
  pdf_storage_provider text,
  pdf_storage_key     text,
  pdf_uploaded_at     timestamptz,
  pdf_uploaded_by     text,

  -- دفعة الاستيراد: تسمح باستبدال آمن (إدراج الجديد ثم حذف القديم)
  import_batch        uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- أعمدة احتياطية لو كان الجدول أُنشئ سابقًا بنسخة أقدم من هذا الملف
alter table public.study_leaves add column if not exists legacy_id text;
alter table public.study_leaves add column if not exists serial text;
alter table public.study_leaves add column if not exists employee_code text;
alter table public.study_leaves add column if not exists name text;
alter table public.study_leaves add column if not exists job_title text;
alter table public.study_leaves add column if not exists grade text;
alter table public.study_leaves add column if not exists leave_pay_type text;
alter table public.study_leaves add column if not exists order_number text;
alter table public.study_leaves add column if not exists order_date date;
alter table public.study_leaves add column if not exists order_note text;
alter table public.study_leaves add column if not exists leave_kind text;
alter table public.study_leaves add column if not exists start_date date;
alter table public.study_leaves add column if not exists end_date date;
alter table public.study_leaves add column if not exists five_year_end date;
alter table public.study_leaves add column if not exists remaining_days text;
alter table public.study_leaves add column if not exists salary_status text;
alter table public.study_leaves add column if not exists returned_to_work text;
alter table public.study_leaves add column if not exists end_reason text;
alter table public.study_leaves add column if not exists claim_made text;
alter table public.study_leaves add column if not exists notes text;
alter table public.study_leaves add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.study_leaves add column if not exists pdf_url text;
alter table public.study_leaves add column if not exists pdf_file_name text;
alter table public.study_leaves add column if not exists pdf_storage_provider text;
alter table public.study_leaves add column if not exists pdf_storage_key text;
alter table public.study_leaves add column if not exists pdf_uploaded_at timestamptz;
alter table public.study_leaves add column if not exists pdf_uploaded_by text;
alter table public.study_leaves add column if not exists import_batch uuid;
alter table public.study_leaves add column if not exists created_at timestamptz not null default now();
alter table public.study_leaves add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_study_leaves_legacy_id
  on public.study_leaves (legacy_id);

create index if not exists idx_study_leaves_employee_code
  on public.study_leaves (employee_code);

create index if not exists idx_study_leaves_name
  on public.study_leaves (name);

create index if not exists idx_study_leaves_start_date
  on public.study_leaves (start_date);

create index if not exists idx_study_leaves_import_batch
  on public.study_leaves (import_batch);

-- تحديث updated_at تلقائيًا
create or replace function public.study_leaves_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_study_leaves_touch on public.study_leaves;
create trigger trg_study_leaves_touch
  before update on public.study_leaves
  for each row execute function public.study_leaves_touch_updated_at();

-- RLS بنفس نمط بقية الجداول
alter table public.study_leaves enable row level security;

drop policy if exists sl_select_for_app on public.study_leaves;
create policy sl_select_for_app on public.study_leaves
  for select to anon, authenticated using (true);

drop policy if exists sl_insert_for_app on public.study_leaves;
create policy sl_insert_for_app on public.study_leaves
  for insert to anon, authenticated with check (true);

drop policy if exists sl_update_for_app on public.study_leaves;
create policy sl_update_for_app on public.study_leaves
  for update to anon, authenticated using (true) with check (true);

drop policy if exists sl_delete_for_app on public.study_leaves;
create policy sl_delete_for_app on public.study_leaves
  for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.study_leaves to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) أعمدة PDF + المستخدم على المطالبات (إضافات فقط)
-- ---------------------------------------------------------------------------
alter table public.claims add column if not exists started_by text;
alter table public.claims add column if not exists settled_by text;
alter table public.claims add column if not exists pdf_file_name text;
alter table public.claims add column if not exists pdf_storage_provider text;
alter table public.claims add column if not exists pdf_storage_key text;
alter table public.claims add column if not exists pdf_uploaded_at timestamptz;
alter table public.claims add column if not exists pdf_uploaded_by text;

-- ---------------------------------------------------------------------------
-- 3) حالة مرتب عضو هيئة التدريس (إيقاف / إعادة تفعيل)
--    مفتاح منطقي: (faculty_name, computer_number) — نفس تجميع صفحة الأرشيف
-- ---------------------------------------------------------------------------
create table if not exists public.faculty_salary_status (
  id              uuid primary key default gen_random_uuid(),
  faculty_name    text not null,
  computer_number text not null default '',
  status          text not null default 'active',
  stopped_at      timestamptz,
  stopped_by      text,
  stop_reason     text,
  reactivated_at  timestamptz,
  reactivated_by  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint faculty_salary_status_status_check
    check (status in ('active', 'stopped'))
);

alter table public.faculty_salary_status add column if not exists stop_reason text;
alter table public.faculty_salary_status add column if not exists created_at timestamptz not null default now();
alter table public.faculty_salary_status add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_faculty_salary_status_member
  on public.faculty_salary_status (faculty_name, computer_number);

create index if not exists idx_faculty_salary_status_state
  on public.faculty_salary_status (status);

create or replace function public.faculty_salary_status_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_faculty_salary_status_touch on public.faculty_salary_status;
create trigger trg_faculty_salary_status_touch
  before update on public.faculty_salary_status
  for each row execute function public.faculty_salary_status_touch_updated_at();

alter table public.faculty_salary_status enable row level security;

drop policy if exists fss_select_for_app on public.faculty_salary_status;
create policy fss_select_for_app on public.faculty_salary_status
  for select to anon, authenticated using (true);

drop policy if exists fss_insert_for_app on public.faculty_salary_status;
create policy fss_insert_for_app on public.faculty_salary_status
  for insert to anon, authenticated with check (true);

drop policy if exists fss_update_for_app on public.faculty_salary_status;
create policy fss_update_for_app on public.faculty_salary_status
  for update to anon, authenticated using (true) with check (true);

drop policy if exists fss_delete_for_app on public.faculty_salary_status;
create policy fss_delete_for_app on public.faculty_salary_status
  for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.faculty_salary_status to anon, authenticated;
