-- =============================================================================
-- IMPORT into the NEW project only | table = letter_departments | rows = 24
-- exact count from OLD project: 24
-- order position: 3 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.letter_departments
select (jsonb_populate_record(null::public.letter_departments, e.j)).*
from jsonb_array_elements($json$[{"id":1,"name":"القيد والحفظ","is_active":false,"created_at":"2026-09-10T08:32:36.223331+00:00","sector_id":4},
{"id":10,"name":"اداره الدفع الالكتروني","is_active":true,"created_at":"2026-09-16T06:38:36.029307+00:00","sector_id":2},
{"id":11,"name":"اداره المخازن","is_active":true,"created_at":"2026-09-16T06:38:45.776167+00:00","sector_id":2},
{"id":12,"name":"اداره شئون العاملين","is_active":true,"created_at":"2026-09-16T06:38:58.351851+00:00","sector_id":2},
{"id":13,"name":"قسم القيد والحفظ","is_active":true,"created_at":"2026-09-16T06:39:12.70515+00:00","sector_id":2},
{"id":14,"name":"قسم المطبعه","is_active":true,"created_at":"2026-09-16T06:39:22.853768+00:00","sector_id":2},
{"id":15,"name":"الشئون القانونيه","is_active":true,"created_at":"2026-09-16T06:40:03.454363+00:00","sector_id":1},
{"id":16,"name":"المراكز البحثيه","is_active":true,"created_at":"2026-09-16T06:40:14.027518+00:00","sector_id":1},
{"id":17,"name":"مركز نظم المعلومات","is_active":true,"created_at":"2026-09-16T06:40:24.507996+00:00","sector_id":1},
{"id":18,"name":"وحده التطوير والجوده","is_active":true,"created_at":"2026-09-16T06:40:42.007968+00:00","sector_id":1},
{"id":19,"name":"ورشة لوبان","is_active":true,"created_at":"2026-09-16T06:40:48.327536+00:00","sector_id":1},
{"id":2,"name":"الحسابات العامة","is_active":true,"created_at":"2026-09-10T08:32:36.223331+00:00","sector_id":2},
{"id":20,"name":"اداره الامن الاداري","is_active":true,"created_at":"2026-09-16T06:41:32.352733+00:00","sector_id":3},
{"id":21,"name":"اداره المشتريات","is_active":true,"created_at":"2026-09-16T06:41:37.910776+00:00","sector_id":3},
{"id":22,"name":"شئون هيئه التدريس","is_active":true,"created_at":"2026-09-16T06:42:14.642735+00:00","sector_id":5},
{"id":23,"name":"اداره المشتريات والتعاقدات","is_active":true,"created_at":"2026-09-16T06:43:17.296542+00:00","sector_id":5},
{"id":24,"name":"شؤؤن الطلبه","is_active":true,"created_at":"2026-09-16T06:43:33.731302+00:00","sector_id":4},
{"id":3,"name":"حسابات خاصة","is_active":true,"created_at":"2026-09-10T08:32:36.223331+00:00","sector_id":2},
{"id":4,"name":"اداره الاستحقاقات","is_active":true,"created_at":"2026-09-10T08:32:36.223331+00:00","sector_id":2},
{"id":5,"name":"شئون هيئة التدريس","is_active":true,"created_at":"2026-09-10T08:32:36.223331+00:00","sector_id":1},
{"id":6,"name":"مكتب أمين الكلية","is_active":true,"created_at":"2026-09-10T08:32:36.223331+00:00","sector_id":2},
{"id":7,"name":"علاقات ثقافية","is_active":true,"created_at":"2026-09-10T08:32:36.223331+00:00","sector_id":3},
{"id":8,"name":"مكتب عميد الكليه","is_active":true,"created_at":"2026-09-15T18:25:20.703575+00:00","sector_id":1},
{"id":9,"name":"اداره الحسابات","is_active":true,"created_at":"2026-09-16T06:38:18.531807+00:00","sector_id":2}]$json$) as e(j);
commit;
select 'letter_departments' as imported, count(*) as rows_now from public.letter_departments;
