-- =============================================================================
-- IMPORT into the NEW project only | table = course_registrations | rows = 0
-- exact count from OLD project: 0
-- order position: 29 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.course_registrations
select (jsonb_populate_record(null::public.course_registrations, e.j)).*
from jsonb_array_elements($json$[]$json$) as e(j);
commit;
select 'course_registrations' as imported, count(*) as rows_now from public.course_registrations;
