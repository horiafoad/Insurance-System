-- =============================================================================
-- IMPORT into the NEW project only | table = letter_templates | rows = 2
-- exact count from OLD project: 2
-- order position: 5 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.letter_templates
select (jsonb_populate_record(null::public.letter_templates, e.j)).*
from jsonb_array_elements($json$[{"id":2,"name":"خطاب مفرادات مرتب","letter_type":"مفرادات مرتب","department_name":"الاستحقاقات","title":"مفرادات مرتب","fixed_text":"مفرادات مرتب باسم {{                 }}\n\nعن شهر {{                  }}\nموجه الي {{                  }}","variable_fields":[{"key": "مفرادات مرتب باسنم", "type": "textarea", "label": "اسم الموظف", "placeholder": "مفرادات مرتب باسم"}, {"key": "عن شهر", "type": "text", "label": "الشهر المطلوب عنه مفرادات المرتب", "placeholder": ""}, {"key": "موجه الي", "type": "textarea", "label": "موجه ل", "placeholder": ""}],"is_active":true,"created_at":"2026-09-12T19:13:30.486189+00:00","updated_at":"2026-09-15T16:10:07.741+00:00","default_route":[{"id": 4, "name": "الاستحقاقات"}, {"id": 6, "name": "مكتب أمين الكلية"}, {"id": 1, "name": "القيد والحفظ"}]},
{"id":3,"name":"اجور متغيره","letter_type":"خطاب اجور متغيره","department_name":"الاستحقاقات","title":"اجور متغيره","fixed_text":"خطاب اجور متغيره الي قسم الموارد البشريه بالجامعه \nباسم {{        KEY        }}","variable_fields":[{"key": "بايم", "type": "textarea", "label": "اسم الموظف", "placeholder": "اكتب اسم الموظف"}],"is_active":true,"created_at":"2026-09-15T14:58:59.29058+00:00","updated_at":"2026-09-15T17:52:50.932+00:00","default_route":[{"id": 1, "name": "القيد والحفظ"}, {"id": 6, "name": "مكتب أمين الكلية"}, {"id": 4, "name": "الاستحقاقات"}, {"id": 6, "name": "مكتب أمين الكلية"}, {"id": 6, "name": "مكتب أمين الكلية"}, {"id": 4, "name": "الاستحقاقات"}, {"id": 1, "name": "القيد والحفظ"}]}]$json$) as e(j);
commit;
select 'letter_templates' as imported, count(*) as rows_now from public.letter_templates;
