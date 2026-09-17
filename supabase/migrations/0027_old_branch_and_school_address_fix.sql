-- ============================================================
-- 0027_old_branch_and_school_address_fix.sql
--
-- 1. ปวส.-level applicants who graduated ปวช. now also name which ปวช.
--    สาขา (branch/major) they graduated in — apply.html's new
--    "สาขาเดิม" field, required only when education = 'ปวช.'. Stored on
--    students.old_branch so print.js can show it in the "จบการศึกษา"
--    row instead of re-printing the literal string "ปวช." into that
--    blank (which is what it did before: _fld(isPvchGrad ? s.education
--    : '', ...) — s.education only ever held "ปวช." itself, never an
--    actual branch name, so the printed form showed "ปวช. สาขา (ระบุ)
--    ปวช." — a redundant duplicate, never real data).
--
-- 2. Unrelated to the above but reported together: the fill-in page's
--    "3. จบการศึกษา" row's ตำบล/อำเภอ/จังหวัด (old school's location)
--    was wired to addr.subDistrict/district/province — the STUDENT'S
--    HOME address, not the old school's. Nothing about the old school's
--    subdistrict/district was ever collected, so those two now print
--    blank; จังหวัด now uses students.education_province ("จังหวัดที่
--    ศึกษา", already collected by apply.html but never actually
--    rendered anywhere) instead of the home address's province.
--    (This part is a js/print.js-only fix — no schema change needed.)
-- ============================================================

alter table students add column if not exists old_branch text;

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
    birth_date, phone, education, old_school, old_branch, education_province, status
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
    nullif(payload->'personal'->>'oldBranch', ''),
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

create or replace function update_application(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_student_id      uuid;
  v_id_card         text := payload->'personal'->>'idCard';
  v_program_round_id uuid;
  v_parent          jsonb;
  v_guardian        jsonb;
  v_other_id        uuid;
begin
  select id into v_student_id from students where line_user_id = nullif(payload->>'lineUserId', '') limit 1;
  if v_student_id is null then
    return jsonb_build_object('success', false, 'message', 'ไม่พบใบสมัครของคุณ');
  end if;

  if coalesce(v_id_card, '') = '' then
    return jsonb_build_object('success', false, 'message', 'กรุณากรอกเลขบัตรประชาชน');
  end if;

  select id into v_other_id from students where id_card = v_id_card and id <> v_student_id limit 1;
  if v_other_id is not null then
    return jsonb_build_object('success', false, 'message', 'เลขบัตรประชาชนนี้ถูกใช้งานแล้ว');
  end if;

  begin
    v_program_round_id := nullif(payload->'program'->>'programId', '')::uuid;
  exception when invalid_text_representation then
    v_program_round_id := null;
  end;
  if v_program_round_id is null or not exists (select 1 from program_rounds where id = v_program_round_id) then
    v_program_round_id := (select program_round_id from enrollments where student_id = v_student_id);
  end if;

  update students set
    id_card = v_id_card,
    prefix = payload->'personal'->>'prefix',
    first_name = coalesce(payload->'personal'->>'firstName', ''),
    last_name = coalesce(payload->'personal'->>'lastName', ''),
    first_name_en = nullif(payload->'personal'->>'firstNameEn', ''),
    last_name_en = nullif(payload->'personal'->>'lastNameEn', ''),
    nationality = nullif(payload->'personal'->>'nationality', ''),
    ethnicity = nullif(payload->'personal'->>'ethnicity', ''),
    religion = nullif(payload->'personal'->>'religion', ''),
    weight = nullif(payload->'personal'->>'weight', ''),
    height = nullif(payload->'personal'->>'height', ''),
    blood_type = nullif(payload->'personal'->>'bloodType', ''),
    birth_date = nullif(payload->'personal'->>'birthDate', '')::date,
    phone = payload->'personal'->>'phone',
    education = payload->'personal'->>'education',
    old_school = payload->'personal'->>'oldSchool',
    old_branch = nullif(payload->'personal'->>'oldBranch', ''),
    education_province = payload->'personal'->>'educationProvince',
    status = 'pending'
  where id = v_student_id;

  insert into addresses (student_id, province_text, district_text, subdistrict_text, zipcode, detail)
  values (
    v_student_id,
    payload->'address'->>'province',
    payload->'address'->>'district',
    payload->'address'->>'subDistrict',
    payload->'address'->>'zipcode',
    payload->'address'->>'detail'
  )
  on conflict (student_id) do update set
    province_text = excluded.province_text,
    district_text = excluded.district_text,
    subdistrict_text = excluded.subdistrict_text,
    zipcode = excluded.zipcode,
    detail = excluded.detail;

  delete from parents where student_id = v_student_id;
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

  delete from guardians where student_id = v_student_id;
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

  update enrollments set
    program_round_id = coalesce(v_program_round_id, program_round_id),
    status = 'pending'
  where student_id = v_student_id;

  return jsonb_build_object('success', true, 'studentId', v_student_id);
end;
$$;

grant execute on function update_application(jsonb) to anon, authenticated;

create or replace function get_application_for_edit(p_line_user_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'studentId', s.id,
    'applicationNo', s.application_no,
    'personal', jsonb_build_object(
      'idCard', s.id_card, 'prefix', s.prefix, 'firstName', s.first_name, 'lastName', s.last_name,
      'firstNameEn', s.first_name_en, 'lastNameEn', s.last_name_en, 'birthDate', s.birth_date,
      'nationality', s.nationality, 'ethnicity', s.ethnicity, 'religion', s.religion,
      'weight', s.weight, 'height', s.height, 'bloodType', s.blood_type, 'phone', s.phone,
      'education', s.education, 'oldSchool', s.old_school, 'oldBranch', s.old_branch,
      'educationProvince', s.education_province
    ),
    'address', jsonb_build_object(
      'province', a.province_text, 'district', a.district_text, 'subDistrict', a.subdistrict_text,
      'zipcode', a.zipcode, 'detail', a.detail
    ),
    'parents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', p.type, 'idCard', p.id_card, 'prefix', p.prefix, 'firstName', p.first_name,
        'lastName', p.last_name, 'firstNameEn', p.first_name_en, 'lastNameEn', p.last_name_en,
        'phone', p.phone, 'occupation', p.occupation, 'isDeceased', p.is_deceased,
        'unknownInfo', p.unknown_info
      ))
      from parents p where p.student_id = s.id
    ), '[]'::jsonb),
    'guardian', (
      select jsonb_build_object(
        'idCard', g.id_card, 'prefix', g.prefix, 'firstName', g.first_name, 'lastName', g.last_name,
        'phone', g.phone, 'relation', g.relation, 'address', g.address
      )
      from guardians g where g.student_id = s.id limit 1
    ),
    'program', jsonb_build_object(
      'programId', e.program_round_id,
      'roundLabel', pr.round_label,
      'levelId', el.code,
      'branchId', b.code,
      'studyCategory', e.study_category,
      'workLocation', e.work_location
    )
  )
  into v_result
  from students s
  left join addresses a on a.student_id = s.id
  left join enrollments e on e.student_id = s.id
  left join program_rounds pr on pr.id = e.program_round_id
  left join branches b on b.id = pr.branch_id
  left join education_levels el on el.id = b.level_id
  where s.line_user_id = p_line_user_id
  limit 1;

  return v_result;
end;
$$;

grant execute on function get_application_for_edit(text) to anon, authenticated;
