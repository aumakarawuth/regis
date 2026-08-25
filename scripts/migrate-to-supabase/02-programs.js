// Splits the flat "programs" sheet (level+branch+round in one row) into
// education_levels -> branches -> program_rounds. See the design note at
// the top of supabase/migrations/0001_init_schema.sql for why.
import 'dotenv/config';
import { getSheetsClient } from './lib/google.js';
import { readSheet } from './lib/sheet.js';
import { getSupabaseAdmin, toBool } from './lib/supabase.js';

const SHEET_ID = process.env.SHEET_ID;

async function run() {
  const sheets = await getSheetsClient();
  const supabase = getSupabaseAdmin();

  const programs = await readSheet(sheets, SHEET_ID, 'programs');
  console.log(`programs: ${programs.length} rows`);

  // 1. education_levels — dedupe by levelId
  const levelsByCode = new Map();
  for (const p of programs) {
    if (!p.levelId) continue;
    if (!levelsByCode.has(p.levelId)) {
      levelsByCode.set(p.levelId, { legacy_id: p.levelId, code: p.levelId, name: p.level });
    }
  }
  const { data: levelRows, error: lErr } = await supabase
    .from('education_levels')
    .upsert([...levelsByCode.values()], { onConflict: 'legacy_id' })
    .select('id, legacy_id');
  if (lErr) throw lErr;
  const levelMap = new Map(levelRows.map(r => [r.legacy_id, r.id]));
  console.log(`  -> ${levelRows.length} education_levels`);

  // 2. branches — dedupe by (levelId, branchId). legacy_id uses the compound
  // key because branchId codes are only guaranteed unique within a level.
  const branchesByKey = new Map();
  for (const p of programs) {
    if (!p.levelId || !p.branchId) continue;
    const key = `${p.levelId}::${p.branchId}`;
    const isOpen = toBool(p.isOpen);
    if (!branchesByKey.has(key)) {
      branchesByKey.set(key, {
        legacy_id: key,
        level_id: levelMap.get(p.levelId),
        code: p.branchId,
        name: p.branch,
        max_students: Number(p.maxStudents) || 0,
        fee: Number(p.fee) || 0,
        is_open: isOpen,
      });
    } else if (isOpen) {
      branchesByKey.get(key).is_open = true;
    }
  }
  const { data: branchRows, error: bErr } = await supabase
    .from('branches')
    .upsert([...branchesByKey.values()], { onConflict: 'legacy_id' })
    .select('id, legacy_id, code, level_id');
  if (bErr) throw bErr;
  // branchId alone (not the compound key) is what enrollments/programs rows
  // reference, so also index by that for step 3 below.
  const branchByCode = new Map(branchRows.map(r => [`${r.level_id}::${r.code}`, r.id]));
  console.log(`  -> ${branchRows.length} branches`);

  // 3. program_rounds — one row per original programs row
  const roundRows = programs
    .filter(p => p.id && p.levelId && p.branchId && branchByCode.has(`${levelMap.get(p.levelId)}::${p.branchId}`))
    .map(p => ({
      legacy_id: String(p.id),
      branch_id: branchByCode.get(`${levelMap.get(p.levelId)}::${p.branchId}`),
      round_label: p.round,
      is_open: toBool(p.isOpen),
    }));
  const skipped = programs.length - roundRows.length;
  if (skipped) console.warn(`  ! skipped ${skipped} program rows with missing id/level/branch`);
  const { data: insertedRounds, error: rErr } = await supabase
    .from('program_rounds')
    .upsert(roundRows, { onConflict: 'legacy_id' })
    .select('id');
  if (rErr) throw rErr;
  console.log(`  -> ${insertedRounds.length} program_rounds`);

  console.log('Program catalog migration done.');
}

run().catch(err => { console.error(err); process.exit(1); });
