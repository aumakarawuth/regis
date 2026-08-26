-- ============================================================
-- 0009_staff_logins.sql
--
-- Lets staff (not just full admins) log into admin.html with their own
-- account. Staff get read/manage access to applications and related
-- data, but never delete access — only admin_users accounts can delete
-- a student/application record. Catalog management (branches, rounds,
-- education levels), the admin_users table itself, and the staff
-- roster (adding/editing/deactivating staff, creating staff logins)
-- all stay admin-only, unchanged.
-- ============================================================

alter table staff add column if not exists user_id uuid references auth.users(id) unique;

create or replace function is_staff()
returns boolean as $$
  select exists (select 1 from staff where user_id = auth.uid() and is_active = true);
$$ language sql stable security definer;

-- ---- students / addresses / parents / guardians / enrollments / documents / payments ----
-- Existing "admin full access" (for all — includes delete) policies are
-- untouched. These add select+update for staff, with no insert (public
-- application form already inserts) and no delete.
create policy "staff view students" on students for select using (is_staff());
create policy "staff update students" on students for update using (is_staff()) with check (is_staff());

create policy "staff view addresses" on addresses for select using (is_staff());
create policy "staff view parents" on parents for select using (is_staff());
create policy "staff view guardians" on guardians for select using (is_staff());

create policy "staff view enrollments" on enrollments for select using (is_staff());
create policy "staff update enrollments" on enrollments for update using (is_staff()) with check (is_staff());

create policy "staff view documents" on documents for select using (is_staff());
create policy "staff update documents" on documents for update using (is_staff()) with check (is_staff());

create policy "staff view payments" on payments for select using (is_staff());

-- ---- staff roster (read-only for staff — needed for the assign/
-- follow-up dropdowns; adding/editing staff and creating logins stays
-- admin-only via the existing "admin manage staff" policy) ----
create policy "staff view staff" on staff for select using (is_staff());

-- ---- follow_ups (staff log their own follow-up notes) ----
create policy "staff view follow_ups" on follow_ups for select using (is_staff());
create policy "staff insert follow_ups" on follow_ups for insert with check (is_staff());

-- ---- document_requests (staff can ask applicants for missing docs too) ----
create policy "staff view document_requests" on document_requests for select using (is_staff());
create policy "staff insert document_requests" on document_requests for insert with check (is_staff());
create policy "staff update document_requests" on document_requests for update using (is_staff()) with check (is_staff());

-- ---- storage (document/payment-slip thumbnails in the detail panel) ----
create policy "staff read documents"
  on storage.objects for select
  using (bucket_id = 'documents' and is_staff());

create policy "staff read payment slips"
  on storage.objects for select
  using (bucket_id = 'payment-slips' and is_staff());
