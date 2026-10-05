# Migration runbook — OLD -> NEW Supabase

Everything in this file is prepared. The remaining steps need either the Supabase
SQL Editor (a browser you control) or the two new-project values.

The OLD project `jpybzalxcezxhokzmwdx` is only ever READ from. Every statement in
`run-plan/` is a single `select`. Nothing in this toolkit can write to any database.

---

## What already exists

| Artifact | Purpose |
|---|---|
| `01-new-project-schema.sql` | 43 tables, FK-ordered, 103 policies, 26 RLS, 4 realtime. 9 destructive statements removed and listed at its bottom. Run once on the NEW project. |
| `export-old-data/run-plan/*.sql` | 29 read-only export statements, one per table. Run on the OLD project. |
| `build-import-sql.mjs` | Turns the pasted NDJSON into one paste-ready `insert` per table. Refuses to run unless every count matches. |
| `import-sql/<table>.sql` | Generated after step 2. Parents first, see `ORDER.txt`. |
| `02-reconciliation.sql` | Pure `SELECT`. Run on the NEW project after the import. |
| `final-migration-report.txt` | Status of every stage. |

---

## Step 1 — set the two new-project values

Edit `.env` locally and change only these two lines:

```
VITE_SUPABASE_URL=https://<NEW-PROJECT-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<new publishable/anon key>
```

Do not send them in chat. Do not commit `.env` (it is already gitignored).

Also add this line so file writes go to Cloudflare R2 instead of Supabase Storage:

```
VITE_FILE_STORAGE_PROVIDER=r2
```

## Step 2 — create the schema on the NEW project

Paste the whole of `scripts/migration/01-new-project-schema.sql` into the NEW
project's SQL Editor and run it. It is idempotent (`if not exists` /
`drop policy if exists`).

## Step 3 — export all 29 tables from the OLD project (2 runs, not 29)

Two pre-built statements return every table in a **single result cell**:

| File | Tables | Rows | Notes |
|---|---|---|---|
| `export-old-data/run-plan/ALL-IN-ONE-B-rest.sql` | 27 | 2498 | no credentials |
| `export-old-data/run-plan/ALL-IN-ONE-A-sensitive.sql` | 2 | 12 | **contains real passwords and push endpoints** |

For each of the two:

1. open the OLD project's SQL Editor
2. paste the whole file, run it
3. copy the single `ndjson_all` cell
4. save it as `scripts/export-old-data/raw/B-rest.txt` (or `A-sensitive.txt`)

Both files are pure `SELECT` and use `row_to_json(t)::text` over `select t.*`,
so no column name is assumed and none can be dropped. The per-table files in
`run-plan/` are kept as a fallback if a cell gets truncated.

Keep `A-sensitive.txt` local. Never paste it into a chat, a log or a commit.

## Step 4 — split and validate

```
node scripts/migration/split-all-in-one.mjs
```

It splits the cells into `raw/<table>.001.txt` and prints a per-table
`got / expected` table. Every row must read `ok`; a truncated cell shows up as a
`MISMATCH` or as "not valid JSON". Then:

```
node scripts/export-old-data/ingest.mjs
```

Every table must print `ok = yes`. This step prints table names, counts, column
counts and SHA-256 prefixes only — never row content.

## Step 5 — build the import scripts

```
node scripts/migration/build-import-sql.mjs
```

It refuses to emit anything unless all 29 tables are present and match the
authoritative exact counts. It writes `import-sql/<table>.sql`.

## Step 6 — import into the NEW project

Paste and run each `import-sql/<table>.sql` in the order in
`import-sql/ORDER.txt` (parents first, so no foreign key fails). Each file is a
`begin` / `insert` / `commit` triple that ends with a row count.

Fidelity: the export used `row_to_json(t)::text` and the import uses
`jsonb_populate_record(null::public.<table>, ...)`. Those are exact inverses, so
UUIDs, bigints, numerics, JSON, arrays, timestamps and NULLs survive without any
hand-written cast or JavaScript round trip.

## Step 7 — reconcile

Paste `scripts/migration/02-reconciliation.sql` into the NEW project. It must
report:

- `reconciliation = ALL OK`
- `tables_with_wrong_count = 0`
- no rows from the duplicate-PK query
- no rows from the orphan-FK query

## Step 8 — point the app at the new project

Restart the dev server so Vite re-reads `.env`:

```
npm run dev -- --host
```

## Step 9 — re-apply the R2 secrets to the NEW project

`supabase/functions/_shared/r2.ts` reads these from Edge Function secrets, and
secrets are write-only, so they cannot be copied automatically. Set the same four
values you already use on the NEW project, then deploy the functions:

```
supabase functions deploy file-storage
supabase functions deploy auth-login
supabase functions deploy scanner-upload
supabase functions deploy push-notifications
supabase functions deploy send-whatsapp
```

Names only: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`. Never paste their values anywhere.

## Step 10 — the live site

The site is deployed by `.github/workflows/pwa-deploy.yml` to **GitHub Pages**,
not Cloudflare Pages. `src/supabaseClient.js` reads `import.meta.env` at build
time and the workflow injects no variables, so a live cutover needs repository
secrets plus a push to `main`. Both are outside the current rules, so the live
URL was deliberately left untouched.

---

## Known cautions

- **Do not run `archive_old_data()`.** It copies rows older than last year into
  the `*_archive` tables and then deletes them. It is defined in
  `optimize_database_performance.sql` and kept as-is, but nothing in the app calls
  it and its call site is commented out. Calling it after the import would delete
  real rows and break reconciliation.
- **Do not re-run `fix_admin_user.sql` or `fix_database_and_rls.sql`.** Both
  upsert `users.password = EXCLUDED.password`. Their user statements are already
  stripped from the schema bundle; keep them stripped after the import.
- **`faculty_salary_archive`, `faculty_salary_imports`, `faculty_salary_pages`
  do not exist in the OLD project.** They are created empty on the NEW project
  because the app writes to them. There is nothing to migrate, and no data was
  invented for them.
- The old project's `supabase/.temp/linked-project.json` still points at the OLD
  ref. Run `supabase link` against the NEW project before any `supabase db push`
  or `functions deploy`, or the command will target the OLD database.
