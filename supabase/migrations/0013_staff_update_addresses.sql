-- ============================================================
-- 0013_staff_update_addresses.sql
--
-- admin.js's detail panel now lets staff correct a student's
-- province inline (part of the new "click ข้อมูลการสมัคร to edit"
-- feature). Staff already have update access on students
-- (0009_staff_logins.sql's "staff update students" policy) but only
-- ever had SELECT on addresses — matching that same is_staff() check
-- for UPDATE so the inline edit doesn't silently fail under RLS for
-- non-admin staff.
-- ============================================================

create policy "staff update addresses" on addresses for update using (is_staff()) with check (is_staff());
