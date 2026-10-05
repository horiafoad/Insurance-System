# After Supabase lifts the restriction

Run this the moment support confirms the quota restriction on organization
`arwdiosmftarsdfrhybv` has been lifted, and the data plane returns 200 again.

Nothing here has been run. No DDL, no DML, no file was written to any project.

---

## 0. Confirm the restriction is actually gone

```
node scripts/migration/check-production-org.mjs --ref frlbqxpbtzgvvrqedgqx
```

`/auth/v1/health` and the REST read must both be **200**, not 402.
If it is still 402, stop: nothing below will work.

## 1. Set the token, locally, never in chat

The production token is already stored at
`%USERPROFILE%\.supabase\access-token.production`, outside the repository.

## 2. Move the previous progress ledgers aside

The ledgers hold the state of the earlier project and are not project-scoped.
Left in place they make the driver skip every statement and every table and then
report success, so they must not be reused.

```
Rename-Item scripts\migration\.schema-progress.json  .schema-progress.json.bak
Rename-Item scripts\migration\.import-progress.json  .import-progress.json.bak
```

Both are already gitignored, and the `.bak` copies stay on disk for audit.

## 3. Schema, in two passes

The parity file is generated per project, so the base has to land first.

```
node scripts/migration/auto-migrate.mjs --phase schema --new-ref frlbqxpbtzgvvrqedgqx
node scripts/migration/build-column-parity.mjs      --new-ref frlbqxpbtzgvvrqedgqx
node scripts/migration/auto-migrate.mjs --phase schema --new-ref frlbqxpbtzgvvrqedgqx
```

Expected: 43 tables. The first pass may warn that `03-column-parity.sql` is
missing, which is expected at that point.

## 4. Data

```
node scripts/migration/auto-migrate.mjs --phase import --new-ref frlbqxpbtzgvvrqedgqx
```

29 tables, 2,510 rows, parents first, user triggers suspended during the load.

## 5. Verification, all of it required

```
node scripts/migration/verify-columns.mjs   --new-ref frlbqxpbtzgvvrqedgqx
node scripts/migration/verify-passwords.mjs
node scripts/migration/auto-migrate.mjs --phase reconcile --new-ref frlbqxpbtzgvvrqedgqx
node scripts/migration/check-production-org.mjs --ref frlbqxpbtzgvvrqedgqx
```

Required results:

| Check | Required |
|---|---|
| table counts | 29/29 match the export |
| mismatches | 0 |
| duplicates | 0 |
| orphan foreign keys | 0 |
| column parity | every exported column present |
| passwords | 8/8 hashes identical to the export |
| `/auth/v1/health` | 200 |
| REST read | 200 |

## 6. Only then, the app

Not part of the migration, and deliberately separated from it:

1. `supabase link --project-ref frlbqxpbtzgvvrqedgqx`, with the database password
   supplied from the environment. Until this runs, `linked-project.json` still
   points at the OLD project and a deploy would hit the wrong database.
2. Set the four Edge Function secrets by name only: `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
3. Deploy the five functions.
4. Point `.env` at the new project.
5. Decide the RLS question: 42 of 43 tables are currently readable and writable
   by `anon`, and `users` carries `anon_manage_users FOR ALL TO anon`. That is
   what was migrated, and it works, but it should not go to production unchanged.

## Rollback

Nothing in this sequence is destructive. To abandon it, delete the
`frlbqxpbtzgvvrqedgqx` project from the dashboard, or simply leave it unused.
OLD and NEW are never written to at any point, and `readonly-guard.mjs` aborts
if a write-shaped statement is ever aimed at OLD.
