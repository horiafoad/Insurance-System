-- =============================================================================
-- IMPORT into the NEW project only | table = scanner_inbox | rows = 2
-- exact count from OLD project: 2
-- order position: 18 of 29 (parents first)
-- Safe to paste.
-- =============================================================================
begin;
insert into public.scanner_inbox
select (jsonb_populate_record(null::public.scanner_inbox, e.j)).*
from jsonb_array_elements($json$[{"id":1,"file_path":"1789469687642-efcxh-scan.pdf","file_url":"https://jpybzalxcezxhokzmwdx.supabase.co/storage/v1/object/public/scanner-inbox/1789469687642-efcxh-scan.pdf","file_name":"هدى عمر جابر القاضي.pdf","file_mime":"application/pdf","file_size":327839,"status":"done","scanned_at":"2026-09-15T10:54:50.719+00:00","processed_at":"2026-09-15T14:49:20.64+00:00","processed_by":"horia foad","created_at":"2026-09-15T10:54:50.728629+00:00"},
{"id":2,"file_path":"1789469689652-jqvtu-scan.pdf","file_url":"https://jpybzalxcezxhokzmwdx.supabase.co/storage/v1/object/public/scanner-inbox/1789469689652-jqvtu-scan.pdf","file_name":"هدى عمر جابر القاضي.pdf","file_mime":"application/pdf","file_size":327839,"status":"done","scanned_at":"2026-09-15T10:54:56.235+00:00","processed_at":"2026-09-15T10:55:00+00:00","processed_by":"cleanup-dup","created_at":"2026-09-15T10:54:58.254877+00:00"}]$json$) as e(j);
commit;
select 'scanner_inbox' as imported, count(*) as rows_now from public.scanner_inbox;
