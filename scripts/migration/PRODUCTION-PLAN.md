# Production migration plan — `frlbqxpbtzgvvrqedgqx`

Status: **prepared, not executed.** Nothing in this document has been run.
The new project is untouched: no table, no row, no file.

Source of data: the verified local export in `scripts/export-old-data/`
(29 tables / 2,510 rows, previously reconciled against the OLD project with
0 mismatches, 0 duplicates and 0 orphan foreign keys).

---

## 1. What will be moved

| Item | Value | How |
|---|---|---|
| Target project | `frlbqxpbtzgvvrqedgqx` | `--new-ref`, passed on the command line |
| Schema | 43 tables, 596 statements | `01-new-project-schema.sql` + generated parity |
| Data | 29 tables / 2,510 rows | `scripts/export-old-data/ndjson/*.ndjson` |
| Passwords | 8 `users.password` hashes, byte-exact | carried inside `users.ndjson`, never printed |
| Storage | none | Supabase Storage is retired; files live in Cloudflare R2 |

The 29 tables and their exact row counts:

| Table | Rows | Table | Rows |
|---|---|---|---|
| `archive_qr_codes` | 240 | `letter_departments` | 24 |
| `claims` | 367 | `letter_movements` | 66 |
| `employee_salary_archive` | 154 | `letter_number_counter` | 1 |
| `employee_tasks` | 10 | `letter_sectors` | 5 |
| `executive_order_persons` | 708 | `letter_senders` | 4 |
| `executive_orders` | 765 | `letter_templates` | 2 |
| `issue_details` | 10 | `letters` | 16 |
| `issues` | 27 | `notifications` | 54 |
| `public_feedback` | 2 | `push_subscriptions` | 4 |
| `scanner_inbox` | 2 | `service_requests` | 32 |
| `support_requests` | 3 | `tasks` | 6 |
| `users` | 8 | | |

Seven tables are legitimately empty and are created but not filled:
`case_documents`, `course_registrations`, `employee_salary_imports`,
`performance_evaluations`, `salary_import_files`, `training_courses`.

Three further tables exist only in the target schema because the app writes to
them and they never existed in the source: `faculty_salary_archive`,
`faculty_salary_imports`, `faculty_salary_pages`. They are created empty. No
data is invented for them.

## 2. What will not be touched

- **OLD `jpybzalxcezxhokzmwdx`** — read-only. `readonly-guard.mjs` aborts on any
  write-shaped statement against it.
- **NEW `lchjchemghjddthwiwcu`** — not read, not written. It stays exactly as it
  is; the earlier migration is not repeated.
- **`.env`** — unchanged. The target is passed with `--new-ref`, which takes
  precedence over the `.env` lookup, so no file edit is needed to run.
- **Application code, GitHub, R2 configuration** — untouched in this phase.
- **No payment, no plan change, no project or organization deletion.**

## 3. Risks and conflicts

**R1 — the progress ledgers are not project-scoped. This is the one that will
silently corrupt a run.** `.schema-progress.json` (8 entries) and
`.import-progress.json` (29 entries) still hold the state of the *previous*
project. Left alone, the driver would consider every statement and every table
already applied and do nothing at all, then report success. The fix is to run
with `--fresh` for the schema phase and `--reset-import` for the import phase,
or to move the two files aside first. I will move them aside into
`.bak-20260929` rather than pass flags, so the previous run stays auditable.

**R2 — `03-column-parity.sql` is generated against a specific project.** It
cannot be copied as-is. The sequence must be: apply the base schema, generate
parity against `frlbqxpbtzgvvrqedgqx`, then apply the parity statements.

**R3 — no token for the new project exists yet.** Every token on this machine
returns 403 for `frlbqxpbtzgvvrqedgqx`; it belongs to a different account. The
run needs `SUPABASE_ACCESS_TOKEN` from the environment, never from chat and
never committed.

**R4 — `03-column-parity.sql` is validated by a test.** The parity generator has
a `schema-audit` test that must pass before the schema phase is trusted.

**R5 — RLS posture is inherited from the verified export.** 42 of 43 tables are
readable and writable by `anon`, and `users` carries
`anon_manage_users FOR ALL TO anon`. This reproduces what already worked, so it
will not block the migration, but it must not reach production unchanged. It is
a separate, deliberate decision and is not part of this run.

**R6 — `functions deploy` still targets the OLD ref.** `supabase/.temp/linked-project.json`
points at `jpybzalxcezxhokzmwdx`. Until `supabase link` is run against the new
ref, a deploy would hit the OLD database. Linking is a later step and needs the
database password, which is not required for the migration itself because the
Management API runs every statement.

## 4. Commands, in order

Environment, set locally, never pasted into chat or committed:

```
SUPABASE_ACCESS_TOKEN   personal access token of the account that owns frlbqxpbtzgvvrqedgqx
```

Then:

```
# 0. read-only discovery and safety check
node scripts/migration/discover-production.mjs --ref frlbqxpbtzgvvrqedgqx

# 1. clear the previous project's progress ledgers (backed up, not deleted)
#    (manual step: rename .schema-progress.json and .import-progress.json to .bak)

# 2. base schema, 43 tables
node scripts/migration/auto-migrate.mjs --phase schema --new-ref frlbqxpbtzgvvrqedgqx

# 3. generate column parity against the new project, then apply it
node scripts/migration/build-column-parity.mjs --new-ref frlbqxpbtzgvvrqedgqx
node scripts/migration/auto-migrate.mjs --phase schema --new-ref frlbqxpbtzgvvrqedgqx

# 4. data, 29 tables / 2,510 rows, parents first, triggers suspended
node scripts/migration/auto-migrate.mjs --phase import --new-ref frlbqxpbtzgvvrqedgqx

# 5. verification
node scripts/migration/verify-columns.mjs --new-ref frlbqxpbtzgvvrqedgqx
node scripts/migration/verify-passwords.mjs
node scripts/migration/auto-migrate.mjs --phase reconcile --new-ref frlbqxpbtzgvvrqedgqx

# 6. the only acceptable result: REST and Auth both 200
node scripts/migration/dataplane-check.mjs
```

`--phase reconcile` must report `mismatches: 0, duplicates: 0, orphans: 0`.
`dataplane-check.mjs` must report 200 on `/auth/v1/health` and on a REST read.

## 5. Later, only after the above is green

Not part of this phase, listed so the order is on record:

1. `supabase link --project-ref frlbqxpbtzgvvrqedgqx` with the database password
   supplied from the environment.
2. Set the four Edge Function secrets by name only: `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
3. Deploy the five functions.
4. Only then point the app at the new project, and only then decide the RLS
   question raised in R5.

## 6. Security notes

- No token, key, password or secret is to be pasted into this conversation, a
  log file or a commit. Secrets go through environment variables only.
- The token shared earlier in this conversation, and the two others held on this
  machine, should be revoked once the migration is finished.
- `.env` has a Git history even though it is currently ignored.
