-- =============================================================================
-- IMPORT into the NEW project only | table = users | rows = 8
-- exact count from OLD project: 8
-- order position: 1 of 29 (parents first)
-- SENSITIVE: contains real credentials/endpoints. Do not paste into chat.
-- =============================================================================
begin;
insert into public.users
select (jsonb_populate_record(null::public.users, e.j)).*
from jsonb_array_elements($json$[{"id":"0bc81681-1768-4c5b-9962-a2bc37aedc12","username":"hanaa","password":"123456","full_name":"hanaa hashish","role":"user","created_at":"2026-09-16T10:14:36.2093+00:00","updated_at":"2026-09-16T10:14:36.2093+00:00","sector_id":2,"department_id":4,"permissions":["entitlements", "letters", "requests"]},
{"id":"88dd3807-a989-45d9-8188-957d5933ea4d","username":"عبد الله","password":"5903","full_name":"Abdullah El-Saeed","role":"user","created_at":"2026-09-02T17:56:46.481642+00:00","updated_at":"2026-09-02T17:56:46.481642+00:00","sector_id":2,"department_id":4,"permissions":["entitlements"]},
{"id":"a5e70dd7-2d6b-469f-8d1d-eae64c16e23c","username":"gehad","password":"123456","full_name":"Gehad Atef","role":"user","created_at":"2026-09-02T18:00:29.381845+00:00","updated_at":"2026-09-02T18:00:29.381845+00:00","sector_id":null,"department_id":null,"permissions":["entitlements", "requests"]},
{"id":"c0df117a-19d5-4f19-9c1d-0e184ef1b2d2","username":"safaa","password":"123456","full_name":"safaaabdelwahab","role":"user","created_at":"2026-09-02T17:55:27.170271+00:00","updated_at":"2026-09-02T17:55:27.170271+00:00","sector_id":null,"department_id":null,"permissions":null},
{"id":"d24b90d6-c367-4c28-9f48-c8bdc73cb776","username":"horia","password":"2322003","full_name":"horia foad","role":"super_admin","created_at":"2026-08-25T16:11:21.506315+00:00","updated_at":"2026-08-27T14:21:49.032268+00:00","sector_id":null,"department_id":null,"permissions":null},
{"id":"d593b759-d43f-4c9f-a3a1-f8433b03593a","username":"HORIA","password":"123456","full_name":"HORIA FOAD","role":"user","created_at":"2026-09-16T10:22:41.171021+00:00","updated_at":"2026-09-16T10:22:41.171021+00:00","sector_id":1,"department_id":null,"permissions":["letters"]},
{"id":"e726e3df-034f-436e-bfff-56e691aa6c5e","username":"yassmen","password":"123456","full_name":"yassmen","role":"user","created_at":"2026-09-02T17:57:34.040241+00:00","updated_at":"2026-09-02T17:57:34.040241+00:00","sector_id":2,"department_id":4,"permissions":[]},
{"id":"eed4dced-624c-47a4-8a33-15222f1b2a8c","username":"rafaattantawy","password":"165200","full_name":"rafaattantawy","role":"admin","created_at":"2026-08-25T17:07:50.317727+00:00","updated_at":"2026-08-25T17:07:50.317727+00:00","sector_id":2,"department_id":4,"permissions":["letters", "entitlements", "requests", "reports", "user_management", "org_structure", "system_settings"]}]$json$) as e(j);
commit;
select 'users' as imported, count(*) as rows_now from public.users;
