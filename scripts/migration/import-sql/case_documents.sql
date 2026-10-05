-- =============================================================================
-- IMPORT into the NEW project only | table = case_documents | rows = 0
-- exact count from OLD project: 0
-- order position: 21 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.case_documents
select (jsonb_populate_record(null::public.case_documents, e.j)).*
from jsonb_array_elements($json$[]$json$) as e(j);
commit;
select 'case_documents' as imported, count(*) as rows_now from public.case_documents;
