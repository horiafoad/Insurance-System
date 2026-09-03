alter table public.claims
  add column if not exists pdf_url text;

insert into storage.buckets (id, name, public)
values ('claim-pdfs', 'claim-pdfs', true)
on conflict (id) do nothing;

drop policy if exists "Allow program users to upload claim PDFs" on storage.objects;
drop policy if exists "Allow program users to read claim PDFs" on storage.objects;

create policy "Allow program users to upload claim PDFs"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'claim-pdfs');

create policy "Allow program users to read claim PDFs"
  on storage.objects for select
  to public
  using (bucket_id = 'claim-pdfs');
