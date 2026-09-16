-- ============================================================
-- 0022_admission_year_setting.sql
--
-- application_no (APP-<พ.ศ.>-0001) always embedded whatever the server
-- clock's current Buddhist year happened to be — there was no way for
-- an admin to open next year's admissions early (e.g. starting ปี 2570
-- applications while it's still calendar-ปี 2569) without every new
-- application_no coming out stamped with the wrong year.
--
-- app_config is a singleton settings row (enforced via the boolean
-- primary key + check constraint trick) holding the year admins want
-- new applications stamped with. next_application_no() now reads from
-- it instead of computing the year from now().
-- ============================================================

create table app_config (
  id boolean primary key default true,
  constraint app_config_singleton check (id),
  current_admission_year int not null default (extract(year from now())::int + 543)
);
insert into app_config (id) values (true);

alter table app_config enable row level security;
create policy "admin full access" on app_config for all using (is_admin()) with check (is_admin());
create policy "staff view app_config" on app_config for select using (is_staff());

create or replace function next_application_no()
returns text as $$
declare
  v_year int;
begin
  select current_admission_year into v_year from app_config limit 1;
  return 'APP-' || v_year || '-' || lpad(nextval('application_no_seq')::text, 4, '0');
end;
$$ language plpgsql;
