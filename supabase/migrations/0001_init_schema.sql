-- ============================================================
-- 0001_init_schema.sql
-- Regis (student enrollment system) — Google Sheets -> Supabase
--
-- Source of truth for the old schema: Code.gs / Students.gs /
-- Programs.gs / Documents.gs / Admin.gs (Google Apps Script + Sheets).
--
-- Design changes vs. the old Sheets model:
--   * "programs" sheet mixed level+branch+round in one flat row and
--     enrollments referenced it inconsistently (programId vs branchId
--     vs roundId — see the "FIX:" comments in the old code). This is
--     normalized here into education_levels -> branches -> program_rounds,
--     with enrollments pointing at exactly one program_round.
--   * UUID primary keys instead of 8-char ids from Utilities.getUuid().
--   * legacy_id kept on every migrated table so the data-migration
--     script can map old Sheets row ids -> new UUIDs, then be dropped
--     after cutover (see 0002_drop_legacy_ids.sql, added post-migration).
--   * Row Level Security replaces the shared ADMIN_PASSWORDS token.
-- ============================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------
create type application_status as enum ('pending', 'verified', 'rejected');
create type parent_type as enum ('father', 'mother');

-- ----------------------------------------------------------------
-- Reference data: Thai address (provinces / districts / subdistricts)
-- Seed from https://github.com/kongvut/thai-province-data or
-- earthchie/jquery.Thailand.js (same source the old code pointed to).
-- ----------------------------------------------------------------
create table provinces (
  id         uuid primary key default gen_random_uuid(),
  legacy_id  text unique,
  name       text not null
);

create table districts (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  province_id uuid not null references provinces(id),
  name        text not null
);
create index idx_districts_province on districts(province_id);

create table subdistricts (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  district_id uuid not null references districts(id),
  name        text not null,
  zipcode     text
);
create index idx_subdistricts_district on subdistricts(district_id);

-- ----------------------------------------------------------------
-- Programs: level -> branch -> round (replaces the flat "programs" sheet)
-- ----------------------------------------------------------------
create table education_levels (
  id         uuid primary key default gen_random_uuid(),
  legacy_id  text unique,          -- e.g. 'LV1'
  code       text not null unique, -- e.g. 'LV1'
  name       text not null         -- e.g. 'ปวช.'
);

create table branches (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,          -- e.g. 'BR1'
  level_id    uuid not null references education_levels(id),
  code        text not null,        -- e.g. 'BR1'
  name        text not null,        -- e.g. 'ช่างยนต์'
  max_students int not null default 0,
  fee         numeric(10,2) not null default 0,
  is_open     boolean not null default true,
  unique (level_id, code)
);
create index idx_branches_level on branches(level_id);

-- One row per enrollable round of a branch — this is what the old
-- "programs" sheet row / enrollments.programId actually meant.
create table program_rounds (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,          -- old programs.id
  branch_id    uuid not null references branches(id),
  round_label  text not null,        -- e.g. 'รอบที่ 1 (มี.ค. - เม.ย.)'
  is_open      boolean not null default true,
  created_at   timestamptz not null default now()
);
create index idx_program_rounds_branch on program_rounds(branch_id);

-- ----------------------------------------------------------------
-- Students
-- ----------------------------------------------------------------
create table students (
  id                  uuid primary key default gen_random_uuid(),
  legacy_id           text unique,
  application_no      text not null unique,
  line_user_id        text,
  display_name        text,
  id_card             text not null unique,
  prefix              text,
  first_name          text not null,
  last_name           text not null,
  birth_date          date,
  phone               text,
  education            text,
  old_school          text,
  education_province  text,
  status              application_status not null default 'pending',
  applied_at          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_students_line_user on students(line_user_id);
create index idx_students_status on students(status);
create trigger trg_students_updated_at
  before update on students for each row execute function set_updated_at();

-- application_no generator: APP-<พ.ศ.>-0001, sequential per year
create sequence application_no_seq;

create or replace function next_application_no()
returns text as $$
declare
  buddhist_year int := extract(year from now())::int + 543;
begin
  return 'APP-' || buddhist_year || '-' || lpad(nextval('application_no_seq')::text, 4, '0');
end;
$$ language plpgsql;

-- ----------------------------------------------------------------
-- Address (1:1 with student)
-- ----------------------------------------------------------------
create table addresses (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  student_id     uuid not null unique references students(id) on delete cascade,
  province_id    uuid references provinces(id),
  district_id    uuid references districts(id),
  subdistrict_id uuid references subdistricts(id),
  zipcode        text,
  detail         text
);

-- ----------------------------------------------------------------
-- Parents (father / mother — 0..2 rows per student)
-- ----------------------------------------------------------------
create table parents (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,
  student_id   uuid not null references students(id) on delete cascade,
  type         parent_type not null,
  id_card      text,
  prefix       text,
  first_name   text,
  last_name    text,
  phone        text,
  occupation   text,
  is_deceased  boolean not null default false,
  unique (student_id, type)
);
create index idx_parents_student on parents(student_id);

-- ----------------------------------------------------------------
-- Guardians (0..1 per student in the old form, kept as many-to-one
-- in case a student ever needs more than one)
-- ----------------------------------------------------------------
create table guardians (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  student_id  uuid not null references students(id) on delete cascade,
  id_card     text,
  prefix      text,
  first_name  text,
  last_name   text,
  phone       text,
  relation    text
);
create index idx_guardians_student on guardians(student_id);

-- ----------------------------------------------------------------
-- Enrollments (one per student — replaces the ambiguous
-- programId/branchId/roundId trio with a single FK)
-- ----------------------------------------------------------------
create table enrollments (
  id               uuid primary key default gen_random_uuid(),
  legacy_id        text unique,
  student_id       uuid not null unique references students(id) on delete cascade,
  program_round_id uuid not null references program_rounds(id),
  application_no   text not null,
  status           application_status not null default 'pending',
  applied_at       timestamptz not null default now()
);
create index idx_enrollments_program_round on enrollments(program_round_id);

-- ----------------------------------------------------------------
-- Documents (files live in Supabase Storage, not Google Drive)
-- storage_path convention: documents/{student_id}/{doc_type}.{ext}
-- ----------------------------------------------------------------
create table documents (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  student_id    uuid not null references students(id) on delete cascade,
  doc_type      text not null, -- 'id_card_front' | 'id_card_back' | 'house_reg' | 'edu_cert' | 'payment_slip' | ...
  storage_path  text not null,
  uploaded_at   timestamptz not null default now(),
  is_verified   boolean not null default false,
  verified_at   timestamptz,
  verified_by   uuid references auth.users(id)
);
create index idx_documents_student on documents(student_id);

-- ----------------------------------------------------------------
-- Payments
-- storage_path convention: payment-slips/{student_id}/{id}.{ext}
-- ----------------------------------------------------------------
create table payments (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  student_id    uuid not null references students(id) on delete cascade,
  amount        numeric(10,2) not null,
  method        text not null default 'promptpay',
  storage_path  text,
  paid_at       timestamptz not null default now(),
  is_verified   boolean not null default false,
  verified_at   timestamptz,
  verified_by   uuid references auth.users(id)
);
create index idx_payments_student on payments(student_id);

-- ----------------------------------------------------------------
-- Admin users — replaces the shared ADMIN_PASSWORDS / ADMIN_TOKENS
-- constant. Maps a real Supabase Auth user to admin access.
-- ----------------------------------------------------------------
create table admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

create or replace function is_admin()
returns boolean as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$ language sql stable security definer;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table provinces enable row level security;
alter table districts enable row level security;
alter table subdistricts enable row level security;
alter table education_levels enable row level security;
alter table branches enable row level security;
alter table program_rounds enable row level security;
alter table students enable row level security;
alter table addresses enable row level security;
alter table parents enable row level security;
alter table guardians enable row level security;
alter table enrollments enable row level security;
alter table documents enable row level security;
alter table payments enable row level security;
alter table admin_users enable row level security;

-- Public (anon) read on reference/catalog data — needed for the
-- apply-form dropdowns.
create policy "public read reference data" on provinces for select using (true);
create policy "public read reference data" on districts for select using (true);
create policy "public read reference data" on subdistricts for select using (true);
create policy "public read reference data" on education_levels for select using (true);
create policy "public read open branches" on branches for select using (true);
create policy "public read open program_rounds" on program_rounds for select using (true);

-- Public (anon) INSERT-only on application data — the apply form
-- writes once; it never reads back other applicants' rows directly
-- (status lookups go through the get_application_status() RPC below).
create policy "public insert own application" on students for insert with check (true);
create policy "public insert address" on addresses for insert with check (true);
create policy "public insert parents" on parents for insert with check (true);
create policy "public insert guardians" on guardians for insert with check (true);
create policy "public insert enrollment" on enrollments for insert with check (true);
create policy "public insert documents" on documents for insert with check (true);
create policy "public insert payments" on payments for insert with check (true);

-- Admins: full read/write on everything.
create policy "admin full access" on students for all using (is_admin()) with check (is_admin());
create policy "admin full access" on addresses for all using (is_admin()) with check (is_admin());
create policy "admin full access" on parents for all using (is_admin()) with check (is_admin());
create policy "admin full access" on guardians for all using (is_admin()) with check (is_admin());
create policy "admin full access" on enrollments for all using (is_admin()) with check (is_admin());
create policy "admin full access" on documents for all using (is_admin()) with check (is_admin());
create policy "admin full access" on payments for all using (is_admin()) with check (is_admin());
create policy "admin manage catalog" on branches for all using (is_admin()) with check (is_admin());
create policy "admin manage catalog" on program_rounds for all using (is_admin()) with check (is_admin());
create policy "admin manage catalog" on education_levels for all using (is_admin()) with check (is_admin());
create policy "admin read admin_users" on admin_users for select using (is_admin());

-- ----------------------------------------------------------------
-- get_application_status(line_user_id) — replaces Students.gs's
-- getApplicationStatus(). SECURITY DEFINER lets an anonymous LIFF
-- user look up *their own* status (matched by LINE user id) without
-- granting broad SELECT on students.
-- ----------------------------------------------------------------
create or replace function get_application_status(p_line_user_id text)
returns table (
  applied boolean,
  application_no text,
  status application_status,
  branch_name text,
  applied_at timestamptz
) as $$
begin
  return query
  select
    true,
    s.application_no,
    s.status,
    b.name,
    s.applied_at
  from students s
  left join enrollments e on e.student_id = s.id
  left join program_rounds pr on pr.id = e.program_round_id
  left join branches b on b.id = pr.branch_id
  where s.line_user_id = p_line_user_id
  limit 1;
end;
$$ language plpgsql security definer stable;

grant execute on function get_application_status(text) to anon, authenticated;
