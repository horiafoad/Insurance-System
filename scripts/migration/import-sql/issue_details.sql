-- =============================================================================
-- IMPORT into the NEW project only | table = issue_details | rows = 10
-- exact count from OLD project: 10
-- order position: 20 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.issue_details
select (jsonb_populate_record(null::public.issue_details, e.j)).*
from jsonb_array_elements($json$[{"id":10,"issue_id":54,"row_number":1,"data":{"الاسم": "", "الصافي": 23722, "الاجمالي": 30052.2, "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "8", "الاساسي بعد التغيير": 715.31},"created_at":"2026-09-20T09:24:58.786411+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"},
{"id":11,"issue_id":52,"row_number":1,"data":{"الاسم": "", "الصافي": 80763, "الاجمالي": 102440.36, "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "8", "الاساسي بعد التغيير": 2062.57},"created_at":"2026-09-20T10:31:36.151599+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"},
{"id":12,"issue_id":50,"row_number":1,"data":{"الاسم": "", "الصافي": 59145.92, "الاجمالي": 75007.53, "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "8", "الاساسي بعد التغيير": 1747.23},"created_at":"2026-09-20T10:45:42.378905+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"},
{"id":13,"issue_id":49,"row_number":1,"data":{"الاسم": "", "الصافي": 43471.96, "الاجمالي": 55169.7, "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "8", "الاساسي بعد التغيير": 1866.15},"created_at":"2026-09-20T11:02:08.86681+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"},
{"id":14,"issue_id":53,"row_number":1,"data":{"الاسم": "", "الصافي": "", "الاجمالي": "", "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "", "الاساسي بعد التغيير": ""},"created_at":"2026-09-20T18:08:53.952664+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"},
{"id":15,"issue_id":48,"row_number":1,"data":{"الاسم": "", "الصافي": "", "الاجمالي": "", "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "", "الاساسي بعد التغيير": ""},"created_at":"2026-09-20T18:29:42.191561+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"},
{"id":6,"issue_id":55,"row_number":1,"data":{"الاسم": "", "الصافي": "39239.18", "الاجمالي": "49745.15", "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "00008", "الاساسي بعد التغيير": "1232.01"},"created_at":"2026-09-20T08:43:42.214054+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"},
{"id":7,"issue_id":55,"row_number":1,"data":{"الاسم": "", "الصافي": "39239.18", "الاجمالي": "49745.15", "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "00008", "الاساسي بعد التغيير": "1232.01"},"created_at":"2026-09-20T08:43:42.295665+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"},
{"id":8,"issue_id":55,"row_number":1,"data":{"الاسم": "", "الصافي": "39239.18", "الاجمالي": "49745.15", "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "00008", "الاساسي بعد التغيير": "1232.01"},"created_at":"2026-09-20T08:43:42.475273+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"},
{"id":9,"issue_id":24,"row_number":1,"data":{"الاسم": "", "الصافي": "", "الاجمالي": "", "حاله الصرف": "", "رقم القضيه": "", "تاريخ الصرف": "", "شهر تغير الاساسي": "\\", "الاساسي بعد التغيير": ""},"created_at":"2026-09-20T09:24:42.545899+00:00","pdf_url":null,"pdf_file_name":null,"pdf_uploaded_at":null,"status":"pending"}]$json$) as e(j);
commit;
select 'issue_details' as imported, count(*) as rows_now from public.issue_details;
