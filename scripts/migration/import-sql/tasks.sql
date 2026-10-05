-- =============================================================================
-- IMPORT into the NEW project only | table = tasks | rows = 6
-- exact count from OLD project: 6
-- order position: 14 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.tasks
select (jsonb_populate_record(null::public.tasks, e.j)).*
from jsonb_array_elements($json$[{"id":1,"title":"خطاب موجه للتاميناات","type":"insurance","responsible":"صفاء عبد الوهاب ","received_date":"2026-09-02","due_date":"2026-09-02","status":"in_progress","reviewed":false,"uploaded":false,"notes":null,"created_at":"2026-09-02T14:48:47.627394+00:00","updated_at":"2026-09-02T14:48:47.627394+00:00"},
{"id":2,"title":"استعجال من الجامعه اجور متغيره عن سنه 2022,2023 ,2024","type":"variable_wages","responsible":"صفاء عبد  الوهاب ","received_date":"2026-08-25","due_date":null,"status":"completed","reviewed":false,"uploaded":true,"notes":"تم استلامه من الارشيف وجاري التنفيذ ","created_at":"2026-09-02T15:33:12.871724+00:00","updated_at":"2026-09-02T15:33:12.871724+00:00"},
{"id":3,"title":"خطاب اجور متغيره ","type":"salaries","responsible":"حوريه ","received_date":"2026-09-07","due_date":null,"status":"in_progress","reviewed":false,"uploaded":false,"notes":null,"created_at":"2026-09-07T19:03:37.406403+00:00","updated_at":"2026-09-07T19:03:37.406403+00:00"},
{"id":4,"title":"خطاب اجور متغيره ","type":"salaries","responsible":"حوريه ","received_date":"2026-09-07","due_date":null,"status":"in_progress","reviewed":false,"uploaded":false,"notes":null,"created_at":"2026-09-07T19:03:37.430378+00:00","updated_at":"2026-09-07T19:03:37.430378+00:00"},
{"id":5,"title":"خطاب اجور متغيره ","type":"salaries","responsible":"حوريه ","received_date":"2026-09-07","due_date":null,"status":"completed","reviewed":false,"uploaded":false,"notes":null,"created_at":"2026-09-07T19:03:37.431546+00:00","updated_at":"2026-09-07T19:03:37.431546+00:00"},
{"id":6,"title":"خطاب اجور متغيره ","type":"salaries","responsible":"حوريه ","received_date":"2026-09-07","due_date":null,"status":"in_progress","reviewed":false,"uploaded":false,"notes":null,"created_at":"2026-09-07T19:03:37.440306+00:00","updated_at":"2026-09-07T19:03:37.440306+00:00"}]$json$) as e(j);
commit;
select 'tasks' as imported, count(*) as rows_now from public.tasks;
