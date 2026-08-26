-- ============================================================
-- 0004_staff_and_reports.sql
--
-- Staff (ครูแนะแนว/เจ้าหน้าที่) + application ownership + a follow-up
-- log, so each application has a clear owner and admin can see who is
-- actually working their list (count + recency of follow_ups) versus
-- who isn't.
-- ============================================================

create table staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null default 'แนะแนว',
  phone      text,
  email      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table students add column assigned_staff_id uuid references staff(id);
create index idx_students_assigned_staff on students(assigned_staff_id);

-- One row per follow-up action (call/LINE/visit/etc.) a staff member
-- logs against a student. This is the raw material for the KPI view —
-- count per staff, and how recently each one has actually touched their
-- assigned list.
create table follow_ups (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  staff_id    uuid not null references staff(id),
  note        text not null,
  created_at  timestamptz not null default now()
);
create index idx_follow_ups_student on follow_ups(student_id);
create index idx_follow_ups_staff on follow_ups(staff_id);

alter table staff enable row level security;
alter table follow_ups enable row level security;

create policy "admin manage staff" on staff for all using (is_admin()) with check (is_admin());
create policy "admin manage follow_ups" on follow_ups for all using (is_admin()) with check (is_admin());
