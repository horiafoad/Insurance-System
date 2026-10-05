-- ============================================================================
-- RECONCILIATION - run on the NEW project AFTER the import.
-- Compares every table against the OLD project exact counts.
-- Prints counts and problem NAMES only. No row content, no passwords.
-- ============================================================================

-- table                       old     new     diff    status
  select 'users' as t, 8::bigint as old_n, (select count(*) from public.users) as new_n
  union all
  select 'letter_sectors' as t, 5::bigint as old_n, (select count(*) from public.letter_sectors) as new_n
  union all
  select 'letter_departments' as t, 24::bigint as old_n, (select count(*) from public.letter_departments) as new_n
  union all
  select 'letter_senders' as t, 4::bigint as old_n, (select count(*) from public.letter_senders) as new_n
  union all
  select 'letter_templates' as t, 2::bigint as old_n, (select count(*) from public.letter_templates) as new_n
  union all
  select 'letters' as t, 16::bigint as old_n, (select count(*) from public.letters) as new_n
  union all
  select 'letter_movements' as t, 66::bigint as old_n, (select count(*) from public.letter_movements) as new_n
  union all
  select 'letter_number_counter' as t, 1::bigint as old_n, (select count(*) from public.letter_number_counter) as new_n
  union all
  select 'issues' as t, 27::bigint as old_n, (select count(*) from public.issues) as new_n
  union all
  select 'issue_details' as t, 10::bigint as old_n, (select count(*) from public.issue_details) as new_n
  union all
  select 'case_documents' as t, 0::bigint as old_n, (select count(*) from public.case_documents) as new_n
  union all
  select 'archive_qr_codes' as t, 240::bigint as old_n, (select count(*) from public.archive_qr_codes) as new_n
  union all
  select 'executive_orders' as t, 765::bigint as old_n, (select count(*) from public.executive_orders) as new_n
  union all
  select 'executive_order_persons' as t, 708::bigint as old_n, (select count(*) from public.executive_order_persons) as new_n
  union all
  select 'salary_import_files' as t, 0::bigint as old_n, (select count(*) from public.salary_import_files) as new_n
  union all
  select 'employee_salary_archive' as t, 154::bigint as old_n, (select count(*) from public.employee_salary_archive) as new_n
  union all
  select 'employee_salary_imports' as t, 0::bigint as old_n, (select count(*) from public.employee_salary_imports) as new_n
  union all
  select 'claims' as t, 367::bigint as old_n, (select count(*) from public.claims) as new_n
  union all
  select 'tasks' as t, 6::bigint as old_n, (select count(*) from public.tasks) as new_n
  union all
  select 'service_requests' as t, 32::bigint as old_n, (select count(*) from public.service_requests) as new_n
  union all
  select 'performance_evaluations' as t, 0::bigint as old_n, (select count(*) from public.performance_evaluations) as new_n
  union all
  select 'training_courses' as t, 0::bigint as old_n, (select count(*) from public.training_courses) as new_n
  union all
  select 'course_registrations' as t, 0::bigint as old_n, (select count(*) from public.course_registrations) as new_n
  union all
  select 'employee_tasks' as t, 10::bigint as old_n, (select count(*) from public.employee_tasks) as new_n
  union all
  select 'notifications' as t, 54::bigint as old_n, (select count(*) from public.notifications) as new_n
  union all
  select 'public_feedback' as t, 2::bigint as old_n, (select count(*) from public.public_feedback) as new_n
  union all
  select 'push_subscriptions' as t, 4::bigint as old_n, (select count(*) from public.push_subscriptions) as new_n
  union all
  select 'support_requests' as t, 3::bigint as old_n, (select count(*) from public.support_requests) as new_n
  union all
  select 'scanner_inbox' as t, 2::bigint as old_n, (select count(*) from public.scanner_inbox) as new_n
;

-- summary line: every status must read ok

with r as (  select 'users' as t, 8::bigint as old_n, (select count(*) from public.users) as new_n
  union all
  select 'letter_sectors' as t, 5::bigint as old_n, (select count(*) from public.letter_sectors) as new_n
  union all
  select 'letter_departments' as t, 24::bigint as old_n, (select count(*) from public.letter_departments) as new_n
  union all
  select 'letter_senders' as t, 4::bigint as old_n, (select count(*) from public.letter_senders) as new_n
  union all
  select 'letter_templates' as t, 2::bigint as old_n, (select count(*) from public.letter_templates) as new_n
  union all
  select 'letters' as t, 16::bigint as old_n, (select count(*) from public.letters) as new_n
  union all
  select 'letter_movements' as t, 66::bigint as old_n, (select count(*) from public.letter_movements) as new_n
  union all
  select 'letter_number_counter' as t, 1::bigint as old_n, (select count(*) from public.letter_number_counter) as new_n
  union all
  select 'issues' as t, 27::bigint as old_n, (select count(*) from public.issues) as new_n
  union all
  select 'issue_details' as t, 10::bigint as old_n, (select count(*) from public.issue_details) as new_n
  union all
  select 'case_documents' as t, 0::bigint as old_n, (select count(*) from public.case_documents) as new_n
  union all
  select 'archive_qr_codes' as t, 240::bigint as old_n, (select count(*) from public.archive_qr_codes) as new_n
  union all
  select 'executive_orders' as t, 765::bigint as old_n, (select count(*) from public.executive_orders) as new_n
  union all
  select 'executive_order_persons' as t, 708::bigint as old_n, (select count(*) from public.executive_order_persons) as new_n
  union all
  select 'salary_import_files' as t, 0::bigint as old_n, (select count(*) from public.salary_import_files) as new_n
  union all
  select 'employee_salary_archive' as t, 154::bigint as old_n, (select count(*) from public.employee_salary_archive) as new_n
  union all
  select 'employee_salary_imports' as t, 0::bigint as old_n, (select count(*) from public.employee_salary_imports) as new_n
  union all
  select 'claims' as t, 367::bigint as old_n, (select count(*) from public.claims) as new_n
  union all
  select 'tasks' as t, 6::bigint as old_n, (select count(*) from public.tasks) as new_n
  union all
  select 'service_requests' as t, 32::bigint as old_n, (select count(*) from public.service_requests) as new_n
  union all
  select 'performance_evaluations' as t, 0::bigint as old_n, (select count(*) from public.performance_evaluations) as new_n
  union all
  select 'training_courses' as t, 0::bigint as old_n, (select count(*) from public.training_courses) as new_n
  union all
  select 'course_registrations' as t, 0::bigint as old_n, (select count(*) from public.course_registrations) as new_n
  union all
  select 'employee_tasks' as t, 10::bigint as old_n, (select count(*) from public.employee_tasks) as new_n
  union all
  select 'notifications' as t, 54::bigint as old_n, (select count(*) from public.notifications) as new_n
  union all
  select 'public_feedback' as t, 2::bigint as old_n, (select count(*) from public.public_feedback) as new_n
  union all
  select 'push_subscriptions' as t, 4::bigint as old_n, (select count(*) from public.push_subscriptions) as new_n
  union all
  select 'support_requests' as t, 3::bigint as old_n, (select count(*) from public.support_requests) as new_n
  union all
  select 'scanner_inbox' as t, 2::bigint as old_n, (select count(*) from public.scanner_inbox) as new_n)
select case when count(*) filter (where old_n = new_n) = count(*) then 'ALL OK' else 'MISMATCH' end as reconciliation,
       count(*) as tables_checked,
       sum(old_n) as total_old_rows,
       sum(new_n) as total_new_rows,
       count(*) filter (where old_n <> new_n) as tables_with_wrong_count
from r;

-- duplicate primary keys (expect 0 rows) -------------------------

  select 'users' as table_name, 'id' as key_col, count(*) as dup_groups from public.users group by "id" having count(*) > 1
  union all
  select 'letter_sectors' as table_name, 'id' as key_col, count(*) as dup_groups from public.letter_sectors group by "id" having count(*) > 1
  union all
  select 'letter_departments' as table_name, 'id' as key_col, count(*) as dup_groups from public.letter_departments group by "id" having count(*) > 1
  union all
  select 'letter_senders' as table_name, 'id' as key_col, count(*) as dup_groups from public.letter_senders group by "id" having count(*) > 1
  union all
  select 'letter_templates' as table_name, 'id' as key_col, count(*) as dup_groups from public.letter_templates group by "id" having count(*) > 1
  union all
  select 'letters' as table_name, 'id' as key_col, count(*) as dup_groups from public.letters group by "id" having count(*) > 1
  union all
  select 'letter_movements' as table_name, 'id' as key_col, count(*) as dup_groups from public.letter_movements group by "id" having count(*) > 1
  union all
  select 'letter_number_counter' as table_name, 'id' as key_col, count(*) as dup_groups from public.letter_number_counter group by "id" having count(*) > 1
  union all
  select 'issues' as table_name, 'id' as key_col, count(*) as dup_groups from public.issues group by "id" having count(*) > 1
  union all
  select 'issue_details' as table_name, 'id' as key_col, count(*) as dup_groups from public.issue_details group by "id" having count(*) > 1
  union all
  select 'case_documents' as table_name, 'id' as key_col, count(*) as dup_groups from public.case_documents group by "id" having count(*) > 1
  union all
  select 'archive_qr_codes' as table_name, 'id' as key_col, count(*) as dup_groups from public.archive_qr_codes group by "id" having count(*) > 1
  union all
  select 'executive_orders' as table_name, 'id' as key_col, count(*) as dup_groups from public.executive_orders group by "id" having count(*) > 1
  union all
  select 'executive_order_persons' as table_name, 'id' as key_col, count(*) as dup_groups from public.executive_order_persons group by "id" having count(*) > 1
  union all
  select 'salary_import_files' as table_name, 'id' as key_col, count(*) as dup_groups from public.salary_import_files group by "id" having count(*) > 1
  union all
  select 'employee_salary_archive' as table_name, 'id' as key_col, count(*) as dup_groups from public.employee_salary_archive group by "id" having count(*) > 1
  union all
  select 'employee_salary_imports' as table_name, 'id' as key_col, count(*) as dup_groups from public.employee_salary_imports group by "id" having count(*) > 1
  union all
  select 'claims' as table_name, 'id' as key_col, count(*) as dup_groups from public.claims group by "id" having count(*) > 1
  union all
  select 'tasks' as table_name, 'id' as key_col, count(*) as dup_groups from public.tasks group by "id" having count(*) > 1
  union all
  select 'service_requests' as table_name, 'id' as key_col, count(*) as dup_groups from public.service_requests group by "id" having count(*) > 1
  union all
  select 'performance_evaluations' as table_name, 'id' as key_col, count(*) as dup_groups from public.performance_evaluations group by "id" having count(*) > 1
  union all
  select 'training_courses' as table_name, 'id' as key_col, count(*) as dup_groups from public.training_courses group by "id" having count(*) > 1
  union all
  select 'course_registrations' as table_name, 'id' as key_col, count(*) as dup_groups from public.course_registrations group by "id" having count(*) > 1
  union all
  select 'employee_tasks' as table_name, 'id' as key_col, count(*) as dup_groups from public.employee_tasks group by "id" having count(*) > 1
  union all
  select 'notifications' as table_name, 'id' as key_col, count(*) as dup_groups from public.notifications group by "id" having count(*) > 1
  union all
  select 'public_feedback' as table_name, 'id' as key_col, count(*) as dup_groups from public.public_feedback group by "id" having count(*) > 1
  union all
  select 'push_subscriptions' as table_name, 'id' as key_col, count(*) as dup_groups from public.push_subscriptions group by "id" having count(*) > 1
  union all
  select 'support_requests' as table_name, 'id' as key_col, count(*) as dup_groups from public.support_requests group by "id" having count(*) > 1
  union all
  select 'scanner_inbox' as table_name, 'id' as key_col, count(*) as dup_groups from public.scanner_inbox group by "id" having count(*) > 1;

-- orphaned foreign keys (expect 0 rows) -------------------------

  select 'letters' as table_name, 'qr_code_id' as fk_col, 'archive_qr_codes' as missing_parent, count(*) as orphans
   from public.letters c
   where c."qr_code_id" is not null
     and not exists (select 1 from public.archive_qr_codes p where p.id = c."qr_code_id")
  union all
  select 'letters' as table_name, 'sender_id' as fk_col, 'letter_senders' as missing_parent, count(*) as orphans
   from public.letters c
   where c."sender_id" is not null
     and not exists (select 1 from public.letter_senders p where p.id = c."sender_id")
  union all
  select 'letter_movements' as table_name, 'letter_id' as fk_col, 'letters' as missing_parent, count(*) as orphans
   from public.letter_movements c
   where c."letter_id" is not null
     and not exists (select 1 from public.letters p where p.id = c."letter_id")
  union all
  select 'letter_movements' as table_name, 'department_id' as fk_col, 'letter_departments' as missing_parent, count(*) as orphans
   from public.letter_movements c
   where c."department_id" is not null
     and not exists (select 1 from public.letter_departments p where p.id = c."department_id")
  union all
  select 'issue_details' as table_name, 'issue_id' as fk_col, 'issues' as missing_parent, count(*) as orphans
   from public.issue_details c
   where c."issue_id" is not null
     and not exists (select 1 from public.issues p where p.id = c."issue_id")
  union all
  select 'case_documents' as table_name, 'case_id' as fk_col, 'issues' as missing_parent, count(*) as orphans
   from public.case_documents c
   where c."case_id" is not null
     and not exists (select 1 from public.issues p where p.id = c."case_id")
  union all
  select 'case_documents' as table_name, 'case_id' as fk_col, 'issues' as missing_parent, count(*) as orphans
   from public.case_documents c
   where c."case_id" is not null
     and not exists (select 1 from public.issues p where p.id = c."case_id")
  union all
  select 'executive_orders' as table_name, 'person_id' as fk_col, 'executive_order_persons' as missing_parent, count(*) as orphans
   from public.executive_orders c
   where c."person_id" is not null
     and not exists (select 1 from public.executive_order_persons p where p.id = c."person_id")
  union all
  select 'performance_evaluations' as table_name, 'evaluator_id' as fk_col, 'users' as missing_parent, count(*) as orphans
   from public.performance_evaluations c
   where c."evaluator_id" is not null
     and not exists (select 1 from public.users p where p.id = c."evaluator_id")
  union all
  select 'training_courses' as table_name, 'created_by' as fk_col, 'users' as missing_parent, count(*) as orphans
   from public.training_courses c
   where c."created_by" is not null
     and not exists (select 1 from public.users p where p.id = c."created_by")
  union all
  select 'course_registrations' as table_name, 'course_id' as fk_col, 'training_courses' as missing_parent, count(*) as orphans
   from public.course_registrations c
   where c."course_id" is not null
     and not exists (select 1 from public.training_courses p where p.id = c."course_id")
  union all
  select 'course_registrations' as table_name, 'course_id' as fk_col, 'training_courses' as missing_parent, count(*) as orphans
   from public.course_registrations c
   where c."course_id" is not null
     and not exists (select 1 from public.training_courses p where p.id = c."course_id")
  union all
  select 'notifications' as table_name, 'user_id' as fk_col, 'users' as missing_parent, count(*) as orphans
   from public.notifications c
   where c."user_id" is not null
     and not exists (select 1 from public.users p where p.id = c."user_id")
  union all
  select 'push_subscriptions' as table_name, 'user_id' as fk_col, 'users' as missing_parent, count(*) as orphans
   from public.push_subscriptions c
   where c."user_id" is not null
     and not exists (select 1 from public.users p where p.id = c."user_id")
  union all
  select 'support_requests' as table_name, 'user_id' as fk_col, 'users' as missing_parent, count(*) as orphans
   from public.support_requests c
   where c."user_id" is not null
     and not exists (select 1 from public.users p where p.id = c."user_id");

-- null / empty spot checks (informational, not a pass/fail) ------

select 'users rows' as what, count(*) as n from public.users
union all select 'users with null username', count(*) from public.users where username is null
union all select 'users with null password', count(*) from public.users where password is null
union all select 'letters total', count(*) from public.letters
union all select 'letter_movements orphans', count(*) from public.letter_movements m
   where not exists (select 1 from public.letters l where l.id = m.letter_id)
union all select 'archive_qr_codes orphans', count(*) from public.archive_qr_codes a
   where a.letter_id is not null and not exists (select 1 from public.letters l where l.id = a.letter_id);

-- storage columns preserved for the R2 bridge (expect 0 missing) --

select 'rows missing storage_provider' as what, count(*) as n
from public.letters where storage_provider is null;

