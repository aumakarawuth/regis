-- 0029_storage_upload_not_owner_scoped.sql
--
-- Fixes "อัปโหลดล้มเหลว: new row violates row-level security policy" when a
-- student re-uploads a requested document (e.g. ทะเบียนบ้าน) from
-- index.html on a return visit.
--
-- Root cause: 0005_storage_owner_scoped.sql scoped documents/payment-slips
-- INSERT and UPDATE to `owner = auth.uid()`. That works for the *first*
-- upload (done during apply.html's submission, in one continuous
-- anonymous session), but a student re-opening the LINE app later — to
-- upload a doc staff asked for after review — gets a brand-new anonymous
-- Supabase Auth identity (signInAnonymously() is not durable across
-- visits/devices/cleared storage), whose uid never matches the `owner`
-- already stamped on the existing storage object from the original
-- upload. The re-upload's UPSERT then fails the owner check every time,
-- permanently blocking that student from ever re-submitting that file.
--
-- The `documents`/`payments` TABLE rows already have wide-open
-- "public insert"/"public update" policies (studentId's UUID is the only
-- real gatekeeping there) — this just brings storage's write policies in
-- line with that same, already-accepted trust model. Read/select stays
-- owner-scoped (0005) since anon uploaders never need to read their own
-- files back — only admin/staff (via is_admin()/is_staff(), unaffected
-- by this change) do, through print.js's signed URLs.

drop policy if exists "own upload documents" on storage.objects;
drop policy if exists "own update documents" on storage.objects;
drop policy if exists "own upload payment slips" on storage.objects;
drop policy if exists "own update payment slips" on storage.objects;

create policy "authenticated upload documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

create policy "authenticated update documents"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

create policy "authenticated upload payment slips"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'payment-slips');

create policy "authenticated update payment slips"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'payment-slips')
  with check (bucket_id = 'payment-slips');
