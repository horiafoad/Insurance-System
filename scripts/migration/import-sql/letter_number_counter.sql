-- =============================================================================
-- IMPORT into the NEW project only | table = letter_number_counter | rows = 1
-- exact count from OLD project: 1
-- order position: 6 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.letter_number_counter
select (jsonb_populate_record(null::public.letter_number_counter, e.j)).*
from jsonb_array_elements($json$[{"id":1,"last_number":7}]$json$) as e(j);
commit;
select 'letter_number_counter' as imported, count(*) as rows_now from public.letter_number_counter;
