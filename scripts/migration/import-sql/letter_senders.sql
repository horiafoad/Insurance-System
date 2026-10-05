-- =============================================================================
-- IMPORT into the NEW project only | table = letter_senders | rows = 4
-- exact count from OLD project: 4
-- order position: 4 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.letter_senders
select (jsonb_populate_record(null::public.letter_senders, e.j)).*
from jsonb_array_elements($json$[{"id":1,"name":"الاستحقاقات","is_active":true,"created_at":"2026-09-10T08:41:59.872734+00:00"},
{"id":11,"name":"ننننننننننن","is_active":true,"created_at":"2026-09-16T18:51:24.458419+00:00"},
{"id":7,"name":"الارشيف","is_active":true,"created_at":"2026-09-14T09:08:56.00438+00:00"},
{"id":9,"name":"القيد والحفظ","is_active":true,"created_at":"2026-09-15T14:59:45.307186+00:00"}]$json$) as e(j);
commit;
select 'letter_senders' as imported, count(*) as rows_now from public.letter_senders;
