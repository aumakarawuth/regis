-- ============================================================
-- 0014_parent_unknown_info.sql
--
-- apply.html's parent step lets an applicant tick "ไม่ทราบข้อมูล"
-- (unknown info) as an alternative to "ถึงแก่กรรมแล้ว" (deceased) to skip
-- a parent's details, and _validateParent() already treats both the
-- same way client-side. But submit_application() only ever wrote
-- is_deceased — a parent marked "unknown" was inserted as a normal row
-- with blank name/id_card, indistinguishable from a data-entry mistake.
-- Add the column and carry the flag through.
-- ============================================================

alter table parents add column if not exists unknown_info boolean not null default false;

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
    first_name_en, last_name_en, nationality, ethnicity, religion, weight, height, blood_type,
    birth_date, phone, education, old_school, education_province, status
  ) values (
    v_application_no,
    nullif(payload->>'lineUserId', ''),
    nullif(payload->>'displayName', ''),
    v_id_card,
    payload->'personal'->>'prefix',
    coalesce(payload->'personal'->>'firstName', ''),
    coalesce(payload->'personal'->>'lastName', ''),
    nullif(payload->'personal'->>'firstNameEn', ''),
    nullif(payload->'personal'->>'lastNameEn', ''),
    nullif(payload->'personal'->>'nationality', ''),
    nullif(payload->'personal'->>'ethnicity', ''),
    nullif(payload->'personal'->>'religion', ''),
    nullif(payload->'personal'->>'weight', ''),
    nullif(payload->'personal'->>'height', ''),
    nullif(payload->'personal'->>'bloodType', ''),
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
      insert into parents (student_id, type, id_card, prefix, first_name, last_name, first_name_en, last_name_en, phone, occupation, is_deceased, unknown_info)
      values (
        v_student_id,
        (v_parent->>'type')::parent_type,
        v_parent->>'idCard',
        v_parent->>'prefix',
        v_parent->>'firstName',
        v_parent->>'lastName',
        nullif(v_parent->>'firstNameEn', ''),
        nullif(v_parent->>'lastNameEn', ''),
        v_parent->>'phone',
        v_parent->>'occupation',
        coalesce((v_parent->>'isDeceased')::boolean, false),
        coalesce((v_parent->>'unknownInfo')::boolean, false)
      );
    end if;
  end loop;

  v_guardian := payload->'guardian';
  if v_guardian is not null and coalesce(v_guardian->>'firstName', '') <> '' then
    insert into guardians (student_id, id_card, prefix, first_name, last_name, phone, relation, address)
    values (
      v_student_id,
      v_guardian->>'idCard',
      v_guardian->>'prefix',
      v_guardian->>'firstName',
      v_guardian->>'lastName',
      v_guardian->>'phone',
      v_guardian->>'relation',
      v_guardian->>'address'
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
