-- =============================================================================
-- IMPORT into the NEW project only | table = performance_evaluations | rows = 0
-- exact count from OLD project: 0
-- order position: 23 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.performance_evaluations
select (jsonb_populate_record(null::public.performance_evaluations, e.j)).*
from jsonb_array_elements($json$[]$json$) as e(j);
commit;
select 'performance_evaluations' as imported, count(*) as rows_now from public.performance_evaluations;
