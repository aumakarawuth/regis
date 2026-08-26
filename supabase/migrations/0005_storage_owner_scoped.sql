-- ============================================================
-- 0005_storage_owner_scoped.sql
--
-- Fixes every document/payment-slip upload failing with HTTP 400
-- ("new row violates row-level security policy for table objects").
--
-- Root cause: Supabase's Storage API does an INSERT ... RETURNING under
-- the hood, and Postgres requires the newly-inserted row to also satisfy
-- a SELECT policy for RETURNING to succeed. 0002_storage.sql only had a
-- SELECT policy for admins (is_admin()) — an anonymous uploader could
-- pass the INSERT check but could never see the row it just inserted,
-- so RETURNING failed and Postgres rejected the whole insert. Confirmed
-- directly: `set role anon; insert ... returning id;` reproduces the
-- exact error; the same insert without RETURNING succeeds.
--
-- A blanket public SELECT policy would "fix" this by letting anyone
-- holding the anon key list/download every applicant's ID card and
-- house registration photos — not acceptable. Instead, applicants get a
-- real (if anonymous) Supabase Auth identity via
-- supabase.auth.signInAnonymously() (see apply.html), and storage
-- access is scoped to their own uploads via `owner = auth.uid()`.
-- Verified in this project: an authenticated session can insert+read
-- its own row; a different authenticated session sees zero rows for it.
--
-- Requires "Allow anonymous sign-ins" enabled in Supabase Dashboard ->
-- Authentication -> Sign In / Providers — this cannot be toggled via
-- SQL/migrations, it's a project-level auth setting.
-- ============================================================

drop policy if exists "public upload own documents" on storage.objects;
drop policy if exists "public upload own payment slips" on storage.objects;

create policy "own upload documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents' and owner = auth.uid());

create policy "own read documents"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents' and owner = auth.uid());

create policy "own upload payment slips"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'payment-slips' and owner = auth.uid());

create policy "own read payment slips"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'payment-slips' and owner = auth.uid());
