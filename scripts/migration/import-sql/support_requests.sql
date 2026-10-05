-- =============================================================================
-- IMPORT into the NEW project only | table = support_requests | rows = 3
-- exact count from OLD project: 3
-- order position: 27 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.support_requests
select (jsonb_populate_record(null::public.support_requests, e.j)).*
from jsonb_array_elements($json$[{"id":"3646aea7-f2b6-4281-8e5e-8071cd4781d2","user_id":"d24b90d6-c367-4c28-9f48-c8bdc73cb776","employee_name":"horia foad","department_name":"","description":"صفحه الخطابات مش فاتحه","screenshot_url":null,"status":"جاري الدعم","created_at":"2026-09-24T07:17:21.974452+00:00","updated_at":"2026-09-24T07:17:21.974452+00:00","department_id":null,"mesh_device_id":null,"device_name":"Windows - Chrome","assigned_admin_id":"d24b90d6-c367-4c28-9f48-c8bdc73cb776","assigned_admin_name":"horia foad","started_at":"2026-09-24T07:26:40.839+00:00","ended_at":null,"resolution_notes":null},
{"id":"571d26f6-68a0-4266-a9fd-792d8c03522d","user_id":"d24b90d6-c367-4c28-9f48-c8bdc73cb776","employee_name":"horia foad","department_name":"","description":"tist","screenshot_url":null,"status":"جاري الدعم","created_at":"2026-09-21T08:47:44.249888+00:00","updated_at":"2026-09-21T08:47:44.249888+00:00","department_id":null,"mesh_device_id":null,"device_name":"Windows - Chrome","assigned_admin_id":"d24b90d6-c367-4c28-9f48-c8bdc73cb776","assigned_admin_name":"horia foad","started_at":"2026-09-21T08:47:58.436+00:00","ended_at":null,"resolution_notes":null},
{"id":"d0c3df2c-c7d9-4b79-ad06-c2c015cb4b97","user_id":"88dd3807-a989-45d9-8188-957d5933ea4d","employee_name":"Abdullah El-Saeed","department_name":"اداره الاستحقاقات","description":"زر القضايا مش بيحفظ التعديلات","screenshot_url":null,"status":"جاري الدعم","created_at":"2026-09-20T20:00:48.794549+00:00","updated_at":"2026-09-20T20:00:48.794549+00:00","department_id":4,"mesh_device_id":null,"device_name":"Windows - Chrome","assigned_admin_id":"d24b90d6-c367-4c28-9f48-c8bdc73cb776","assigned_admin_name":"horia foad","started_at":"2026-09-20T20:01:16.003+00:00","ended_at":null,"resolution_notes":null}]$json$) as e(j);
commit;
select 'support_requests' as imported, count(*) as rows_now from public.support_requests;
