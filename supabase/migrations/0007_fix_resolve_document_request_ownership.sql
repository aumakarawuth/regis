-- ============================================================
-- 0007_fix_resolve_document_request_ownership.sql
--
-- resolve_document_request(uuid) had no ownership check — since it's
-- security definer and granted to anon/authenticated, anyone who
-- obtained or guessed a request id could silently mark ANY applicant's
-- document request resolved, hiding it from admin follow-up. Now
-- requires the caller's line_user_id to match the request's student,
-- same scoping already used by get_document_requests.
-- ============================================================

drop function if exists resolve_document_request(uuid);

create or replace function resolve_document_request(p_request_id uuid, p_line_user_id text)
returns void
language sql
security definer
as $$
  update document_requests dr
  set status = 'resolved', resolved_at = now()
  where dr.id = p_request_id
    and exists (
      select 1 from students s
      where s.id = dr.student_id and s.line_user_id = p_line_user_id
    );
$$;

grant execute on function resolve_document_request(uuid, text) to anon, authenticated;
