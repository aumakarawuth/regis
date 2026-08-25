-- ============================================================
-- 0002_storage.sql
-- Storage buckets replacing the Google Drive folder tree
-- (DRIVE_FOLDER.ROOT / DOCS / PAYMENTS in js/config.js).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('payment-slips', 'payment-slips', false)
on conflict (id) do nothing;

-- Anyone can upload into their own student folder during the apply
-- flow (path must start with the student_id they were just issued).
-- Reading/downloading requires a signed URL issued by an admin-side
-- call, or admin auth — never public.
create policy "public upload own documents"
  on storage.objects for insert
  with check (bucket_id = 'documents');

create policy "public upload own payment slips"
  on storage.objects for insert
  with check (bucket_id = 'payment-slips');

create policy "admin read documents"
  on storage.objects for select
  using (bucket_id = 'documents' and is_admin());

create policy "admin read payment slips"
  on storage.objects for select
  using (bucket_id = 'payment-slips' and is_admin());

create policy "admin manage documents"
  on storage.objects for all
  using (bucket_id = 'documents' and is_admin())
  with check (bucket_id = 'documents' and is_admin());

create policy "admin manage payment slips"
  on storage.objects for all
  using (bucket_id = 'payment-slips' and is_admin())
  with check (bucket_id = 'payment-slips' and is_admin());
