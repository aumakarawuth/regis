// Migrates provinces / districts / subdistricts (Documents.gs's address
// sheets). These are reference tables and are frequently left unpopulated
// in the old system (getProvinces() etc. fall back to an empty array on
// purpose) — this step is a no-op if the sheets are empty, that's expected.
import 'dotenv/config';
import { getSheetsClient } from './lib/google.js';
import { readSheet } from './lib/sheet.js';
import { getSupabaseAdmin } from './lib/supabase.js';

const SHEET_ID = process.env.SHEET_ID;

async function run() {
  const sheets = await getSheetsClient();
  const supabase = getSupabaseAdmin();

  const provinces = await readSheet(sheets, SHEET_ID, 'provinces');
  console.log(`provinces: ${provinces.length} rows`);
  if (provinces.length) {
    const rows = provinces.map(p => ({ legacy_id: String(p.id), name: p.name }));
    const { data, error } = await supabase.from('provinces').upsert(rows, { onConflict: 'legacy_id' }).select('id');
    if (error) throw error;
    console.log(`  -> upserted ${data.length}`);
  }

  const { data: provinceRows, error: pErr } = await supabase.from('provinces').select('id, legacy_id');
  if (pErr) throw pErr;
  const provinceMap = new Map(provinceRows.map(r => [r.legacy_id, r.id]));

  const districts = await readSheet(sheets, SHEET_ID, 'districts');
  console.log(`districts: ${districts.length} rows`);
  if (districts.length) {
    const rows = districts
      .filter(d => provinceMap.has(String(d.provinceId)))
      .map(d => ({
        legacy_id: String(d.id),
        province_id: provinceMap.get(String(d.provinceId)),
        name: d.name,
      }));
    const skipped = districts.length - rows.length;
    if (skipped) console.warn(`  ! skipped ${skipped} districts with unknown provinceId`);
    if (rows.length) {
      const { data, error } = await supabase.from('districts').upsert(rows, { onConflict: 'legacy_id' }).select('id');
      if (error) throw error;
      console.log(`  -> upserted ${data.length}`);
    }
  }

  const { data: districtRows, error: dErr } = await supabase.from('districts').select('id, legacy_id');
  if (dErr) throw dErr;
  const districtMap = new Map(districtRows.map(r => [r.legacy_id, r.id]));

  const subdistricts = await readSheet(sheets, SHEET_ID, 'subdistricts');
  console.log(`subdistricts: ${subdistricts.length} rows`);
  if (subdistricts.length) {
    const rows = subdistricts
      .filter(s => districtMap.has(String(s.districtId)))
      .map(s => ({
        legacy_id: String(s.id),
        district_id: districtMap.get(String(s.districtId)),
        name: s.name,
        zipcode: s.zipcode ? String(s.zipcode) : null,
      }));
    const skipped = subdistricts.length - rows.length;
    if (skipped) console.warn(`  ! skipped ${skipped} subdistricts with unknown districtId`);
    if (rows.length) {
      const { data, error } = await supabase.from('subdistricts').upsert(rows, { onConflict: 'legacy_id' }).select('id');
      if (error) throw error;
      console.log(`  -> upserted ${data.length}`);
    }
  }

  console.log('Reference data migration done.');
}

run().catch(err => { console.error(err); process.exit(1); });
