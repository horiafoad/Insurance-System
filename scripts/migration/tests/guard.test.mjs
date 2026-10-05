// Tests the REAL guard module that auto-migrate.mjs enforces, so the
// verified behaviour and the enforced behaviour cannot drift apart.
import { assertReadOnly, OLD_REF } from '../readonly-guard.mjs';

const NEW = 'abcdefghijklmnop';
const r = (ref, sql) => {
  const res = assertReadOnly(ref, sql);
  return res.ok ? 'allowed' : 'REFUSED -> ' + res.bad.join(', ');
};

let pass = 0, fail = 0;
const t = (name, want, got) => {
  const ok = got.startsWith(want);
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(48)} ${got}`);
};

console.log('=== reads aimed at the OLD project (must be allowed) ===');
t('real all-in-one export', 'allowed', r(OLD_REF,
  "select string_agg('###TABLE '||t, E'\\n') as ndjson_all from ( select 'users' as t, coalesce(string_agg(row_to_json(x)::text,E'\\n'),'EMPTY') from public.users x ) s;"));
t('plain SELECT', 'allowed', r(OLD_REF, 'select 1;'));
t('column named updated_at', 'allowed', r(OLD_REF, 'select updated_at, id from public.letters;'));
t('write verb inside a comment', 'allowed', r(OLD_REF, '-- create table foo\n-- delete from bar\nselect 1;'));
t('write verb inside a string literal', 'allowed', r(OLD_REF, "select 'please delete this row' as note;"));
t('write verb inside a JSON payload', 'allowed', r(OLD_REF, 'select \'[{"action":"delete","op":"update"}]\'::jsonb as j;'));
t('write verb inside a dollar-quoted body', 'allowed', r(OLD_REF, 'select $$ delete from public.users $$ as s;'));
t('table.column reference to a create column', 'allowed', r(OLD_REF, 'select t.create_date from public.tasks t;'));
t('read with a CTE', 'allowed', r(OLD_REF, 'with c as (select 1 as n) select * from c;'));

console.log('\n=== writes aimed at the OLD project (must all be refused) ===');
t('INSERT', 'REFUSED', r(OLD_REF, "insert into public.users (username) values ('x');"));
t('UPDATE', 'REFUSED', r(OLD_REF, "update public.users set role='admin';"));
t('DELETE', 'REFUSED', r(OLD_REF, 'delete from public.letters;'));
t('DROP TABLE', 'REFUSED', r(OLD_REF, 'drop table public.letters;'));
t('ALTER TABLE', 'REFUSED', r(OLD_REF, 'alter table public.letters add column x int;'));
t('TRUNCATE', 'REFUSED', r(OLD_REF, 'truncate public.letters;'));
t('CREATE TABLE', 'REFUSED', r(OLD_REF, 'create table public.x (id int);'));
t('GRANT / REVOKE', 'REFUSED', r(OLD_REF, 'grant all on public.users to anon;'));
t('password = EXCLUDED.password upsert', 'REFUSED', r(OLD_REF, "insert into public.users select 1 on conflict do update set password=excluded.password;"));
t('data-modifying CTE (was the bypass)', 'REFUSED', r(OLD_REF, "with t as (select 1) insert into public.users select 1 on conflict do update set password=excluded.password;"));
t('data-modifying CTE, plain UPDATE', 'REFUSED', r(OLD_REF, 'with t as (select 1) update public.users set role=\'admin\';'));
t('data-modifying CTE, plain DELETE', 'REFUSED', r(OLD_REF, 'with d as (select id from public.letters) delete from public.letters where id in (select id from d);'));
t('archive_old_data()', 'REFUSED', r(OLD_REF, 'select archive_old_data();'));
t('archive_old_data() via a CTE', 'REFUSED', r(OLD_REF, 'with c as (select archive_old_data() as x) select * from c;'));
t('write hidden after a SELECT', 'REFUSED', r(OLD_REF, 'select 1; drop table public.users;'));
t('CREATE FUNCTION whose body deletes', 'REFUSED', r(OLD_REF, "create function f() returns void as $$ begin delete from public.users; end $$ language plpgsql;"));
t('session_replication_role = replica', 'REFUSED', r(OLD_REF, 'set session_replication_role = replica; select 1;'));
t('SELECT..INTO (creates a table)', 'REFUSED', r(OLD_REF, 'select 1 into public.newtable;'));

console.log('\n=== the same writes aimed at the NEW project (must be allowed) ===');
t('INSERT into NEW', 'allowed', r(NEW, "insert into public.users (username) values ('x');"));
t('schema DDL into NEW', 'allowed', r(NEW, 'create table if not exists public.t (id int);'));
t('jsonb_populate_record import into NEW', 'allowed', r(NEW, "insert into public.users select (jsonb_populate_record(null::public.users, e.j)).* from jsonb_array_elements($json$[{}]$json$) as e(j);"));

console.log('\n=== archive_old_data stays callable on the NEW project only ===');
t('archive fn on NEW', 'allowed', r(NEW, 'select archive_old_data();'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
