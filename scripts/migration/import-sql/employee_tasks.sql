-- =============================================================================
-- IMPORT into the NEW project only | table = employee_tasks | rows = 10
-- exact count from OLD project: 10
-- order position: 16 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.employee_tasks
select (jsonb_populate_record(null::public.employee_tasks, e.j)).*
from jsonb_array_elements($json$[{"id":"028f4565-8c11-4e9e-b43e-f088fed97803","employee_id":4,"title":"إعداد مفردات المرتب","description":"إعداد مفردات المرتب عند الطلب","due_date":"2026-08-29","status":"جديد","priority":"عادي","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"},
{"id":"0cb88d0d-a1de-44b7-9e8e-306480609d1e","employee_id":5,"title":"معالجة طلبات الزمالة","description":"معالجة طلبات الزمالة والاشتراكات","due_date":"2026-08-23","status":"جاري","priority":"عاجل","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"},
{"id":"4ffb4063-6f7f-4592-af05-92cdb222583a","employee_id":2,"title":"معالجة فواتير العلاج","description":"معالجة فواتير العلاج الواردة","due_date":"2026-08-22","status":"جديد","priority":"عادي","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"},
{"id":"804c9da4-4e40-4ca3-92c4-416539ab046a","employee_id":1,"title":"إعداد استمارة مرتبات أغسطس","description":"إعداد واستكمال استمارة مرتبات شهر أغسطس 2026","due_date":"2026-08-20","status":"مكتمل","priority":"عاجل","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"},
{"id":"84cd27df-7899-4899-81fc-9bc7c9ecc5e4","employee_id":4,"title":"متابعة المطالبات القانونية","description":"متابعة حالة المطالبات القانونية","due_date":"2026-08-25","status":"جديد","priority":"مهم","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"},
{"id":"e4be1d46-79bd-4863-9f95-9a231e5e0afc","employee_id":5,"title":"متابعة صندوق الزمالة","description":"متابعة حالة صندوق الزمالة","due_date":"2026-08-27","status":"جديد","priority":"مهم","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"},
{"id":"ec7e357e-f4d1-471d-ae7e-03ff99b0e76c","employee_id":2,"title":"تحديث بيانات التأمينات","description":"تحديث بيانات التأمينات للموظفين","due_date":"2026-08-30","status":"جديد","priority":"مهم","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"},
{"id":"eee73ab0-314b-4a66-aa46-6e52388dd1ed","employee_id":3,"title":"مراجعة طلبات الإجازات","description":"مراجعة طلبات الإجازات الدراسية","due_date":"2026-08-18","status":"مكتمل","priority":"عاجل","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"},
{"id":"f7b27190-c68b-4a3c-8d61-0317ef3356ef","employee_id":3,"title":"إعداد تقرير الإجازات","description":"إعداد تقرير شهري عن الإجازات","due_date":"2026-08-28","status":"جاري","priority":"عادي","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"},
{"id":"fb51a5d9-2689-4236-93b4-96649cf4ffe2","employee_id":1,"title":"مراجعة فواتير أورانج","description":"مراجعة فواتير أورانج للعاملين","due_date":"2026-08-25","status":"جاري","priority":"مهم","created_at":"2026-09-02T14:54:53.365846+00:00","updated_at":"2026-09-02T14:54:53.365846+00:00"}]$json$) as e(j);
commit;
select 'employee_tasks' as imported, count(*) as rows_now from public.employee_tasks;
