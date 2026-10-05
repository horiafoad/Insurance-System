-- =============================================================================
-- IMPORT into the NEW project only | table = salary_import_files | rows = 0
-- exact count from OLD project: 0
-- order position: 10 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.salary_import_files
select (jsonb_populate_record(null::public.salary_import_files, e.j)).*
from jsonb_array_elements($json$[]$json$) as e(j);
commit;
select 'salary_import_files' as imported, count(*) as rows_now from public.salary_import_files;
