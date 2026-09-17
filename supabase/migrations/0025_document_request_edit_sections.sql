-- ============================================================
-- 0025_document_request_edit_sections.sql
--
-- document_requests previously only ever asked for missing/incomplete
-- *documents* (a photo re-upload). Staff also need to ask an applicant
-- to fix *data* they already typed in (e.g. "กรุณาอัปเดตเลขบัตร ปชช.
-- พ่อ", "แก้ไขโรงเรียนเดิม") without that meaning "upload a file".
--
-- edit_sections names which apply.html step(s) the request is about
-- (e.g. {'personal','address'}) — index.html uses it to deep-link the
-- applicant straight to those step(s) in apply.html's edit mode
-- (?mode=edit&sections=...&reqId=...) instead of the document-upload
-- flow. A request can carry doc_types, edit_sections, or both.
-- ============================================================

alter table document_requests add column if not exists edit_sections text[];

create or replace function get_document_requests(p_line_user_id text)
returns table (
  id uuid,
  student_id uuid,
  doc_types text[],
  edit_sections text[],
  note text,
  requested_at timestamptz
)
language sql
security definer
as $$
  select dr.id, dr.student_id, dr.doc_types, dr.edit_sections, dr.note, dr.requested_at
  from document_requests dr
  join students s on s.id = dr.student_id
  where s.line_user_id = p_line_user_id
    and dr.status = 'pending'
  order by dr.requested_at desc;
$$;

grant execute on function get_document_requests(text) to anon, authenticated;
