-- ============================================================
-- 0020_staff_update_parents_guardians.sql
--
-- print.html's new inline-edit feature lets any admin/staff account
-- that can view the page (checked via the same is_admin()/is_staff()
-- gate as everywhere else) correct father/mother/guardian info
-- directly on the printed form. Non-admin staff already had UPDATE on
-- students (0009) and addresses (0013), but parents/guardians only
-- ever granted UPDATE to full admins ("admin full access", is_admin())
-- — a staff-only account editing these would hit RLS and fail
-- silently the same way documents/payments did before 0016.
-- ============================================================

create policy "staff update parents" on parents for update using (is_staff()) with check (is_staff());
create policy "staff update guardians" on guardians for update using (is_staff()) with check (is_staff());
