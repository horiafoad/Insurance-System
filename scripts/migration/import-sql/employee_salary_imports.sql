-- =============================================================================
-- IMPORT into the NEW project only | table = employee_salary_imports | rows = 0
-- exact count from OLD project: 0
-- order position: 12 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.employee_salary_imports
select (jsonb_populate_record(null::public.employee_salary_imports, e.j)).*
from jsonb_array_elements($json$[]$json$) as e(j);
commit;
select 'employee_salary_imports' as imported, count(*) as rows_now from public.employee_salary_imports;
