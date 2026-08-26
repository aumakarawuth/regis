-- ============================================================
-- 0010_dashboard_notifications.sql
--
-- Backs the admin dashboard's notification bell:
--   * "ใบสมัครใหม่" / "ยังไม่ได้จัดการ" read straight off existing
--     students columns (applied_at, status, assigned_staff_id) —
--     no schema change needed for those.
--   * "ใบสมัครซ้ำ" (duplicate applications, by citizen ID) needs a new
--     log table. students.id_card is `not null unique`, and
--     submit_application() already refuses a second insert with the
--     same id_card — so a duplicate *row* can never exist. What can
--     happen (and previously went completely unrecorded) is someone
--     *attempting* to re-submit with an ID card that's already on
--     file. This logs those attempts so admin can see them instead of
--     the applicant just silently hitting an error.
-- ============================================================

create table duplicate_attempt_log (
  id                    uuid primary key default gen_random_uuid(),
  id_card               text not null,
  attempted_first_name  text,
  attempted_last_name   text,
  attempted_phone       text,
  existing_student_id   uuid references students(id) on delete set null,
  attempted_at          timestamptz not null default now(),
  is_reviewed           boolean not null default false
);
create index idx_duplicate_attempt_log_reviewed on duplicate_attempt_log(is_reviewed);

alter table duplicate_attempt_log enable row level security;

create policy "admin manage duplicate_attempt_log" on duplicate_attempt_log
  for all using (is_admin()) with check (is_admin());
create policy "staff view duplicate_attempt_log" on duplicate_attempt_log
  for select using (is_staff());
create policy "staff dismiss duplicate_attempt_log" on duplicate_attempt_log
  for update using (is_staff()) with check (is_staff());

-- submit_application(): identical to 0003's version, except the
-- duplicate-id-card rejection branch now also logs the attempt.
create or replace function submit_application(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_student_id      uuid;
  v_application_no  text;
  v_id_card         text := payload->'personal'->>'idCard';
  v_program_round_id uuid;
  v_parent          jsonb;
  v_guardian        jsonb;
  v_existing_id     uuid;
begin
  if coalesce(v_id_card, '') = '' then
    return jsonb_build_object('success', false, 'message', 'กรุณากรอกเลขบัตรประชาชน');
  end if;

  select id into v_existing_id from students where id_card = v_id_card limit 1;
  if v_existing_id is not null then
    insert into duplicate_attempt_log (id_card, attempted_first_name, attempted_last_name, attempted_phone, existing_student_id)
    values (
      v_id_card,
      payload->'personal'->>'firstName',
      payload->'personal'->>'lastName',
      payload->'personal'->>'phone',
      v_existing_id
    );
    return jsonb_build_object('success', false, 'message', 'เลขบัตรประชาชนนี้ถูกใช้งานแล้ว');
  end if;

  begin
    v_program_round_id := nullif(payload->'program'->>'programId', '')::uuid;
  exception when invalid_text_representation then
    v_program_round_id := null;
  end;

  if v_program_round_id is null or not exists (select 1 from program_rounds where id = v_program_round_id) then
    return jsonb_build_object('success', false, 'message', 'ไม่พบหลักสูตร/รอบที่เลือก กรุณาเลือกใหม่');
  end if;

  v_application_no := next_application_no();

  insert into students (
    application_no, line_user_id, display_name, id_card, prefix, first_name, last_name,
    birth_date, phone, education, old_school, education_province, status
  ) values (
    v_application_no,
    nullif(payload->>'lineUserId', ''),
    nullif(payload->>'displayName', ''),
    v_id_card,
    payload->'personal'->>'prefix',
    coalesce(payload->'personal'->>'firstName', ''),
    coalesce(payload->'personal'->>'lastName', ''),
    nullif(payload->'personal'->>'birthDate', '')::date,
    payload->'personal'->>'phone',
    payload->'personal'->>'education',
    payload->'personal'->>'oldSchool',
    payload->'personal'->>'educationProvince',
    'pending'
  ) returning id into v_student_id;

  insert into addresses (student_id, province_text, district_text, subdistrict_text, zipcode, detail)
  values (
    v_student_id,
    payload->'address'->>'province',
    payload->'address'->>'district',
    payload->'address'->>'subDistrict',
    payload->'address'->>'zipcode',
    payload->'address'->>'detail'
  );

  for v_parent in select * from jsonb_array_elements(coalesce(payload->'parents', '[]'::jsonb))
  loop
    if v_parent->>'type' in ('father', 'mother') then
      insert into parents (student_id, type, id_card, prefix, first_name, last_name, phone, occupation, is_deceased)
      values (
        v_student_id,
        (v_parent->>'type')::parent_type,
        v_parent->>'idCard',
        v_parent->>'prefix',
        v_parent->>'firstName',
        v_parent->>'lastName',
        v_parent->>'phone',
        v_parent->>'occupation',
        coalesce((v_parent->>'isDeceased')::boolean, false)
      );
    end if;
  end loop;

  v_guardian := payload->'guardian';
  if v_guardian is not null and coalesce(v_guardian->>'firstName', '') <> '' then
    insert into guardians (student_id, id_card, prefix, first_name, last_name, phone, relation)
    values (
      v_student_id,
      v_guardian->>'idCard',
      v_guardian->>'prefix',
      v_guardian->>'firstName',
      v_guardian->>'lastName',
      v_guardian->>'phone',
      v_guardian->>'relation'
    );
  end if;

  insert into enrollments (student_id, program_round_id, application_no, status)
  values (v_student_id, v_program_round_id, v_application_no, 'pending');

  return jsonb_build_object(
    'success', true,
    'applicationNo', v_application_no,
    'studentId', v_student_id
  );
end;
$$;

grant execute on function submit_application(jsonb) to anon, authenticated;
