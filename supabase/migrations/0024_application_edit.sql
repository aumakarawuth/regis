-- ============================================================
-- 0024_application_edit.sql
--
-- Adds an "edit my submitted application" path for applicants.
-- Previously the only way to change something after submitting was
-- to go through apply.html again — which called submit_application(),
-- and that INSERTs a new students row, tripping its own duplicate
-- id_card check ("เลขบัตรประชาชนนี้ถูกใช้งานแล้ว") against the
-- applicant's own existing row.
--
-- get_application_for_edit(line_user_id) returns the applicant's own
-- current application as one jsonb blob (student/address/parents/
-- guardian/enrollment), for apply.html to prefill from — mirrors the
-- shape print.js's _loadStudent() query already uses.
--
-- update_application(payload) replaces submit_application() for a
-- resubmission: same payload shape (minus documents/payment, which
-- the edit flow doesn't touch), but UPDATEs the existing student
-- row (matched by line_user_id) instead of inserting a new one, and
-- resets status back to 'pending' so staff re-review the changes.
-- Parents/guardian rows are replaced wholesale (delete + reinsert)
-- rather than diffed — simpler, and cheap since there's at most 2
-- parent rows + 1 guardian row per student.
-- ============================================================

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
      'education', s.education, 'oldSchool', s.old_school, 'educationProvince', s.education_province
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

  -- Same duplicate check submit_application() does, but excluding the
  -- applicant's own row — this is exactly the check that used to fire
  -- incorrectly when "editing" went through submit_application() instead.
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
