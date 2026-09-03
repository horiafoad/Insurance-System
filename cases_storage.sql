create table if not exists public.cases (
  id bigserial primary key,
  sheet_name varchar(100),
  row_number integer,
  data jsonb,
  pdf_url text,
  created_at timestamptz default now()
);

alter table public.cases disable row level security;
grant all on table public.cases to anon, authenticated, postgres, service_role;
grant all on sequence public.cases_id_seq to anon, authenticated, postgres, service_role;

drop policy if exists "Allow program users to read cases" on public.cases;
drop policy if exists "Allow program users to insert cases" on public.cases;
drop policy if exists "Allow program users to update cases" on public.cases;

create policy "Allow program users to read cases"
  on public.cases for select to anon, authenticated using (true);

create policy "Allow program users to insert cases"
  on public.cases for insert to anon, authenticated with check (true);

create policy "Allow program users to update cases"
  on public.cases for update to anon, authenticated using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('case-pdfs', 'case-pdfs', true)
on conflict (id) do nothing;

drop policy if exists "Allow program users to upload case PDFs" on storage.objects;
drop policy if exists "Allow program users to read case PDFs" on storage.objects;

create policy "Allow program users to upload case PDFs"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'case-pdfs');

create policy "Allow program users to read case PDFs"
  on storage.objects for select to public
  using (bucket_id = 'case-pdfs');
