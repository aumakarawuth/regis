-- ============================================================
-- 0013_document_upsert_and_staff_payment_verify.sql
--
-- Fixes found in a full audit of the app:
--
-- 1. Re-uploading a document/payment slip (e.g. responding to an admin's
--    "ขอเอกสารเพิ่มเติม" request, or resubmitting after a rejection) always
--    INSERTed a new `documents`/`payments` row while the storage object at
--    the same path was overwritten (upsert:true) — leaving duplicate DB
--    rows pointing at one file, with an old (possibly already-verified)
--    row now describing the wrong photo. Add a unique constraint per
--    (student_id, doc_type) / student_id so the client can upsert instead
--    of insert, and resetting is_verified on conflict.
--
-- 2. The storage-level re-upload could itself fail RLS: 0005 only granted
--    INSERT + SELECT to the owner, not UPDATE, and overwriting an existing
--    object (upsert:true) is an UPDATE. Add owner-scoped UPDATE policies.
--
-- 3. Staff could see and click the payment-slip "ตรวจสอบ" (verify) button
--    in the admin detail panel, but 0009 only granted staff SELECT on
--    payments (not UPDATE) — the update silently affected zero rows,
--    so the button appeared to succeed while nothing was actually saved.
-- ============================================================

-- ---- 1. Unique constraints so the client can upsert instead of insert ----
alter table documents add constraint documents_student_doctype_unique unique (student_id, doc_type);
alter table payments add constraint payments_student_unique unique (student_id);

-- ---- 2. Storage: allow the owner to overwrite (upsert) their own upload ----
create policy "own update documents"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents' and owner = auth.uid())
  with check (bucket_id = 'documents' and owner = auth.uid());

create policy "own update payment slips"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'payment-slips' and owner = auth.uid())
  with check (bucket_id = 'payment-slips' and owner = auth.uid());

-- ---- 3. Staff can verify a payment slip, not just view it ----
create policy "staff update payments" on payments for update using (is_staff()) with check (is_staff());
