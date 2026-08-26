-- ============================================================
-- 0006_document_requests.sql
--
-- Lets admin staff flag which documents are missing/incomplete for an
-- applicant and notify them over LINE (Flex Message, sent by the
-- send-document-request Edge Function) with a link back into the LIFF
-- app to upload just those documents.
--
-- Kept separate from students/enrollments.status (pending/verified/
-- rejected) — document completeness is tracked independently of
-- overall application review status.
-- ============================================================

create table document_requests (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  doc_types     text[] not null,
  note          text,
  status        text not null default 'pending' check (status in ('pending', 'resolved')),
  requested_by  uuid references auth.users(id),
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz
);
create index idx_document_requests_student on document_requests(student_id);

alter table document_requests enable row level security;

create policy "admin manage document_requests"
  on document_requests for all
  using (is_admin())
  with check (is_admin());

-- ----------------------------------------------------------------
-- get_document_requests(line_user_id) — the applicant's own pending
-- document requests, so index.html can prompt them to upload what's
-- missing. security definer so an anon/authenticated applicant can
-- call it without needing a direct table policy (same pattern as
-- get_application_status).
-- ----------------------------------------------------------------
create or replace function get_document_requests(p_line_user_id text)
returns table (
  id uuid,
  student_id uuid,
  doc_types text[],
  note text,
  requested_at timestamptz
)
language sql
security definer
as $$
  select dr.id, dr.student_id, dr.doc_types, dr.note, dr.requested_at
  from document_requests dr
  join students s on s.id = dr.student_id
  where s.line_user_id = p_line_user_id
    and dr.status = 'pending'
  order by dr.requested_at desc;
$$;

grant execute on function get_document_requests(text) to anon, authenticated;

-- ----------------------------------------------------------------
-- resolve_document_request(request_id) — applicant marks their own
-- request resolved after uploading everything asked for. This just
-- clears the "needs documents" prompt; admin still separately
-- verifies each document via documents.is_verified.
-- ----------------------------------------------------------------
create or replace function resolve_document_request(p_request_id uuid)
returns void
language sql
security definer
as $$
  update document_requests set status = 'resolved', resolved_at = now() where id = p_request_id;
$$;

grant execute on function resolve_document_request(uuid) to anon, authenticated;
