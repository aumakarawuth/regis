# Migrate: Google Sheets/Drive -> Supabase

One-time migration script for the existing data. Reads directly from the
Google Sheet + Drive (via the Sheets/Drive APIs), writes into Supabase using
the service_role key (bypasses RLS). Safe to re-run — every step upserts on
`legacy_id`, so re-running only fills gaps / retries failures.

## 1. Apply the schema first

In the Supabase SQL editor (or `supabase db push` with the CLI), run in order:

1. `supabase/migrations/0001_init_schema.sql`
2. `supabase/migrations/0002_storage.sql`

Do **not** run `supabase/seed.sql` before this migration — that file is
sample data for local dev only and would collide with the real catalog
`02-programs.js` imports from the Sheet.

## 2. Google service account

1. In Google Cloud Console: create a project (or reuse one), enable the
   **Google Sheets API** and **Google Drive API**.
2. Create a Service Account, then create + download a JSON key for it.
3. Share access with the service account's email (`...@...iam.gserviceaccount.com`):
   - The spreadsheet itself (`SHEET_ID` below) — **Viewer**.
   - The Drive root folder (`DRIVE_FOLDER_ROOT` in `js/config.js`) — **Viewer**.

## 3. Supabase service role key

Project Settings -> API -> `service_role` key (not `anon`). Keep it out of
git and never ship it client-side.

## 4. Configure

```
cp .env.example .env
npm install
```

Fill in `.env`:
- `SHEET_ID` — already defaults to the id from `Code.gs`.
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` — path to the JSON key from step 2.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from step 3.

## 5. Run

Order matters — each step depends on rows the previous one inserted:

```
npm run migrate:reference   # provinces / districts / subdistricts
npm run migrate:programs    # education_levels / branches / program_rounds
npm run migrate:students    # students / addresses / parents / guardians / enrollments
npm run migrate:files       # documents / payments (downloads from Drive, uploads to Storage)
```

or `npm run migrate:all` to run all four in sequence.

## What to check afterward

Each step logs counts and warns about anything it skipped. Things worth a
manual look before cutover:

- **"skipped N enrollments could not be matched to a program_round"** — the
  old `enrollments.roundId`/`programId` didn't resolve against any
  `program_rounds.legacy_id`. Check `02-programs.js` ran first and that the
  `programs` sheet still has the row those enrollments pointed at.
- **Addresses with `province_id`/`district_id`/`subdistrict_id` null but
  `province_text`/`district_text`/`subdistrict_text` filled** — the old
  address was free-typed text that didn't match anything in the
  provinces/districts/subdistricts reference tables (often because those
  reference sheets were never populated). The raw text is preserved either
  way; decide whether the new frontend needs these backfilled against a
  proper Thai address dataset.
- **`04-files.js` failures** — usually a Drive file that was deleted/moved
  or a permission issue. Re-running the script retries only what's missing;
  it does not re-download files that already succeeded (storage upload uses
  `upsert: true`, but the DB row check is by `legacy_id`, so a failed run
  can simply be re-run in full).

After this script, verify row counts against the Sheets (e.g. `students`
count) and spot-check a few students end-to-end (address, parents, documents,
payment) before switching the live app over to Supabase.
