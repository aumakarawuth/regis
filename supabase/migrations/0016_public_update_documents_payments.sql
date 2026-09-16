-- ============================================================
-- 0016_public_update_documents_payments.sql
--
-- 0013_document_upsert_and_staff_payment_verify.sql switched
-- uploadDocument() from insert to upsert (onConflict student_id,doc_type
-- / student_id) so re-uploading a document — e.g. answering an admin's
-- "ขอเอกสารเพิ่มเติม" request for a doc_type that already has a row —
-- overwrites the old row instead of leaving a stale duplicate, and
-- resets is_verified so staff re-check the new photo.
--
-- But an upsert's ON CONFLICT DO UPDATE path is still gated by the
-- UPDATE policy, and both tables only ever granted UPDATE to staff —
-- documents/payments got "public insert ... with_check (true)" in the
-- original schema, but never a matching public UPDATE, so any upload
-- that landed on an existing row (the exact case 0013 was fixing) failed
-- with "new row violates row-level security policy for table 'documents'".
--
-- Same security shape as the existing public insert policies: anyone
-- who knows a student_id can write here already (by design — this is
-- the unauthenticated applicant-facing upload path), so allowing update
-- doesn't widen anything beyond what insert already allows.
-- ============================================================

create policy "public update documents" on documents for update using (true) with check (true);
create policy "public update payments" on payments for update using (true) with check (true);
