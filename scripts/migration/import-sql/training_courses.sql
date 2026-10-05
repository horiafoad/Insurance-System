-- =============================================================================
-- IMPORT into the NEW project only | table = training_courses | rows = 0
-- exact count from OLD project: 0
-- order position: 24 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.training_courses
select (jsonb_populate_record(null::public.training_courses, e.j)).*
from jsonb_array_elements($json$[]$json$) as e(j);
commit;
select 'training_courses' as imported, count(*) as rows_now from public.training_courses;
