-- ============================================================
-- 0021_public_select_documents_payments.sql
--
-- 0016 gave documents/payments a public UPDATE policy so an upsert's
-- ON CONFLICT DO UPDATE path (re-uploading a doc_type/payment slip
-- that already has a row — e.g. answering an admin's "ขอเอกสารเพิ่มเติม"
-- request) could actually update the existing row. That was only half
-- the fix: Postgres also requires the conflict *target* row to satisfy
-- the table's SELECT policy before an INSERT ... ON CONFLICT DO UPDATE
-- can touch it, and documents/payments only ever had "staff view ..."
-- (is_staff()) — no permissive policy for the unauthenticated/anon
-- upload path. So re-uploading a doc_type that already existed still
-- failed with the exact same "new row violates row-level security
-- policy" error, even after 0016.
--
-- Verified directly: as anon, an upsert hitting an existing row failed
-- until a public SELECT policy was added, then succeeded (including
-- RETURNING the updated row).
--
-- Same security shape as the existing public insert/update policies:
-- anyone who knows a student_id can already write here by design (the
-- unauthenticated applicant-facing upload path) — allowing select
-- doesn't widen anything beyond what insert/update already allow.
-- ============================================================

create policy "public select documents" on documents for select using (true);
create policy "public select payments" on payments for select using (true);
