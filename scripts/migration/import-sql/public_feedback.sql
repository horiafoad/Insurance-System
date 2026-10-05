-- =============================================================================
-- IMPORT into the NEW project only | table = public_feedback | rows = 2
-- exact count from OLD project: 2
-- order position: 17 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.public_feedback
select (jsonb_populate_record(null::public.public_feedback, e.j)).*
from jsonb_array_elements($json$[{"id":"66223f47-04cd-49d7-b748-c519dab71d4c","feedback_type":"شكوى / مقترح","name":"حوريه فواد","phone":"01055662546","rating":null,"message":"تباطئ ف اداء المهام","source_page":"الرئيسية","status":"جديد","created_at":"2026-09-02T17:34:54.927631+00:00"},
{"id":"cc3672f6-ddba-4deb-9fa8-9186a0a48565","feedback_type":"شكوى / مقترح","name":"حوريه","phone":null,"rating":null,"message":"تباطئ","source_page":"الرئيسية","status":"جديد","created_at":"2026-09-03T12:20:39.412275+00:00"}]$json$) as e(j);
commit;
select 'public_feedback' as imported, count(*) as rows_now from public.public_feedback;
