-- =============================================================================
-- IMPORT into the NEW project only | table = letter_sectors | rows = 5
-- exact count from OLD project: 5
-- order position: 2 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.letter_sectors
select (jsonb_populate_record(null::public.letter_sectors, e.j)).*
from jsonb_array_elements($json$[{"id":1,"name":"عميد الكلية","is_active":true,"created_at":"2026-09-15T16:21:39.631497+00:00","sort_order":1},
{"id":2,"name":"قطاع أمين الكلية","is_active":true,"created_at":"2026-09-15T16:21:39.631497+00:00","sort_order":2},
{"id":3,"name":"قطاع خدمة المجتمع وشؤون البيئة","is_active":true,"created_at":"2026-09-15T16:21:39.631497+00:00","sort_order":3},
{"id":4,"name":"قطاع شؤون التعليم والطلاب","is_active":true,"created_at":"2026-09-15T16:21:39.631497+00:00","sort_order":4},
{"id":5,"name":"قطاع شؤون الدراسات العليا","is_active":true,"created_at":"2026-09-15T16:21:39.631497+00:00","sort_order":5}]$json$) as e(j);
commit;
select 'letter_sectors' as imported, count(*) as rows_now from public.letter_sectors;
