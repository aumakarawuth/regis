// Migrates students, addresses, parents, guardians, enrollments — in that
// order, since everything else FKs onto students(id). Must run after
// 01-reference-data.js and 02-programs.js.
import 'dotenv/config';
import { getSheetsClient } from './lib/google.js';
import { readSheet } from './lib/sheet.js';
import { getSupabaseAdmin, toBool, orNull } from './lib/supabase.js';

const SHEET_ID = process.env.SHEET_ID;
const STATUS_VALUES = new Set(['pending', 'verified', 'rejected']);
const sanitizeStatus = s => (STATUS_VALUES.has(s) ? s : 'pending');

async function run() {
  const sheets = await getSheetsClient();
  const supabase = getSupabaseAdmin();

  // ---- students ----
  const students = await readSheet(sheets, SHEET_ID, 'students');
  console.log(`students: ${students.length} rows`);
  const studentRows = students
    .filter(s => s.id && s.idCard) // id_card is NOT NULL + unique in the new schema
    .map(s => ({
      legacy_id: String(s.id),
      application_no: s.applicationNo || `LEGACY-${s.id}`,
      line_user_id: orNull(s.lineUserId),
      display_name: orNull(s.displayName),
      id_card: String(s.idCard),
      prefix: orNull(s.prefix),
      first_name: s.firstName || '',
      last_name: s.lastName || '',
      birth_date: orNull(s.birthDate),
      phone: orNull(s.phone),
      education: orNull(s.education),
      old_school: orNull(s.oldSchool),
      education_province: orNull(s.educationProvince),
      status: sanitizeStatus(s.status),
      applied_at: s.applyDate || new Date().toISOString(),
    }));
  const skippedStudents = students.length - studentRows.length;
  if (skippedStudents) console.warn(`  ! skipped ${skippedStudents} students missing id/idCard`);

  const { data: insertedStudents, error: sErr } = await supabase
    .from('students')
    .upsert(studentRows, { onConflict: 'legacy_id' })
    .select('id');
  if (sErr) throw sErr;
  console.log(`  -> upserted ${insertedStudents.length}`);

  const { data: studentRowsAll, error: sAllErr } = await supabase.from('students').select('id, legacy_id');
  if (sAllErr) throw sAllErr;
  const studentMap = new Map(studentRowsAll.map(r => [r.legacy_id, r.id]));

  // ---- reference maps for best-effort address text matching ----
  const [{ data: provinces }, { data: districts }, { data: subdistricts }] = await Promise.all([
    supabase.from('provinces').select('id, name'),
    supabase.from('districts').select('id, name, province_id'),
    supabase.from('subdistricts').select('id, name, district_id'),
  ]);
  const provinceMap = new Map((provinces || []).map(p => [p.name.trim(), p.id]));
  const districtMap = new Map((districts || []).map(d => [`${d.province_id}::${d.name.trim()}`, d.id]));
  const subdistrictMap = new Map((subdistricts || []).map(s => [`${s.district_id}::${s.name.trim()}`, s.id]));

  // ---- addresses ----
  const addresses = await readSheet(sheets, SHEET_ID, 'addresses');
  console.log(`addresses: ${addresses.length} rows`);
  const addressRows = addresses
    .filter(a => studentMap.has(String(a.studentId)))
    .map(a => {
      const provinceId = provinceMap.get(String(a.province || '').trim());
      const districtId = provinceId ? districtMap.get(`${provinceId}::${String(a.district || '').trim()}`) : undefined;
      const subdistrictId = districtId ? subdistrictMap.get(`${districtId}::${String(a.subDistrict || '').trim()}`) : undefined;
      return {
        legacy_id: String(a.id),
        student_id: studentMap.get(String(a.studentId)),
        province_id: provinceId || null,
        district_id: districtId || null,
        subdistrict_id: subdistrictId || null,
        province_text: orNull(a.province),
        district_text: orNull(a.district),
        subdistrict_text: orNull(a.subDistrict),
        zipcode: orNull(a.zipcode),
        detail: orNull(a.detail),
      };
    });
  if (addressRows.length) {
    const { data, error } = await supabase.from('addresses').upsert(addressRows, { onConflict: 'legacy_id' }).select('id');
    if (error) throw error;
    console.log(`  -> upserted ${data.length}`);
  }

  // ---- parents ----
  const parents = await readSheet(sheets, SHEET_ID, 'parents');
  console.log(`parents: ${parents.length} rows`);
  const PARENT_TYPES = new Set(['father', 'mother']);
  const parentRows = parents.filter(p => studentMap.has(String(p.studentId)) && PARENT_TYPES.has(p.type));
  const skippedParents = parents.length - parentRows.length;
  if (skippedParents) console.warn(`  ! skipped ${skippedParents} parents (unknown student or unrecognised type)`);
  if (parentRows.length) {
    const rows = parentRows.map(p => ({
      legacy_id: String(p.id),
      student_id: studentMap.get(String(p.studentId)),
      type: p.type,
      id_card: orNull(p.idCard),
      prefix: orNull(p.prefix),
      first_name: orNull(p.firstName),
      last_name: orNull(p.lastName),
      phone: orNull(p.phone),
      occupation: orNull(p.occupation),
      is_deceased: toBool(p.isDeceased),
    }));
    const { data, error } = await supabase.from('parents').upsert(rows, { onConflict: 'legacy_id' }).select('id');
    if (error) throw error;
    console.log(`  -> upserted ${data.length}`);
  }

  // ---- guardians ----
  const guardians = await readSheet(sheets, SHEET_ID, 'guardians');
  console.log(`guardians: ${guardians.length} rows`);
  const guardianRows = guardians.filter(g => studentMap.has(String(g.studentId)));
  if (guardianRows.length) {
    const rows = guardianRows.map(g => ({
      legacy_id: String(g.id),
      student_id: studentMap.get(String(g.studentId)),
      id_card: orNull(g.idCard),
      prefix: orNull(g.prefix),
      first_name: orNull(g.firstName),
      last_name: orNull(g.lastName),
      phone: orNull(g.phone),
      relation: orNull(g.relation),
    }));
    const { data, error } = await supabase.from('guardians').upsert(rows, { onConflict: 'legacy_id' }).select('id');
    if (error) throw error;
    console.log(`  -> upserted ${data.length}`);
  }

  // ---- enrollments ----
  const { data: roundRows, error: prErr } = await supabase.from('program_rounds').select('id, legacy_id');
  if (prErr) throw prErr;
  const roundMap = new Map(roundRows.map(r => [r.legacy_id, r.id]));

  const enrollments = await readSheet(sheets, SHEET_ID, 'enrollments');
  console.log(`enrollments: ${enrollments.length} rows`);
  const enrollmentRows = [];
  let unresolvedRounds = 0;
  for (const e of enrollments) {
    if (!studentMap.has(String(e.studentId))) continue;
    // roundId is what Students.gs treats as authoritative (matchedProg.id);
    // programId is the fallback it also used to write. Try both.
    const programRoundId = roundMap.get(String(e.roundId)) || roundMap.get(String(e.programId));
    if (!programRoundId) {
      unresolvedRounds++;
      continue;
    }
    enrollmentRows.push({
      legacy_id: String(e.id),
      student_id: studentMap.get(String(e.studentId)),
      program_round_id: programRoundId,
      application_no: e.applicationNo || '',
      status: sanitizeStatus(e.status),
      applied_at: e.applyDate || new Date().toISOString(),
    });
  }
  if (unresolvedRounds) {
    console.warn(`  ! ${unresolvedRounds} enrollments could not be matched to a program_round — needs manual review`);
  }
  if (enrollmentRows.length) {
    const { data, error } = await supabase.from('enrollments').upsert(enrollmentRows, { onConflict: 'legacy_id' }).select('id');
    if (error) throw error;
    console.log(`  -> upserted ${data.length}`);
  }

  console.log('Student data migration done.');
}

run().catch(err => { console.error(err); process.exit(1); });
