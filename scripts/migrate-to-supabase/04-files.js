// Downloads each document/payment-slip file from Google Drive and re-uploads
// it into Supabase Storage, then writes the documents/payments row pointing
// at the new storage_path. Must run after 03-students.js. Safe to re-run —
// storage upload uses upsert:true and DB rows upsert on legacy_id.
import 'dotenv/config';
import path from 'node:path';
import { getSheetsClient, getDriveClient } from './lib/google.js';
import { readSheet } from './lib/sheet.js';
import { getSupabaseAdmin, toBool } from './lib/supabase.js';

const SHEET_ID = process.env.SHEET_ID;

function extFromName(name, fallbackMime) {
  const ext = path.extname(name || '').replace('.', '');
  if (ext) return ext;
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
  return map[fallbackMime] || 'bin';
}

async function downloadDriveFile(drive, fileId) {
  const meta = await drive.files.get({ fileId, fields: 'name, mimeType' });
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return { name: meta.data.name, mimeType: meta.data.mimeType, buffer: Buffer.from(res.data) };
}

async function migrateRows({ supabase, drive, rows, studentMap, bucket, table, buildPath, buildRow, label }) {
  let ok = 0, failed = 0, skipped = 0;
  for (const row of rows) {
    const studentId = studentMap.get(String(row.studentId));
    if (!studentId || !row.driveFileId) { skipped++; continue; }
    try {
      const file = await downloadDriveFile(drive, row.driveFileId);
      const ext = extFromName(file.name, file.mimeType);
      const storagePath = buildPath(studentId, row, ext);

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file.buffer, { contentType: file.mimeType, upsert: true });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase
        .from(table)
        .upsert(buildRow(studentId, row, storagePath), { onConflict: 'legacy_id' });
      if (dbErr) throw dbErr;
      ok++;
    } catch (err) {
      failed++;
      console.error(`  ! ${label} ${row.id} (drive file ${row.driveFileId}) failed: ${err.message}`);
    }
  }
  console.log(`  -> ${label}: ${ok} migrated, ${failed} failed, ${skipped} skipped (no student/file)`);
  return { ok, failed, skipped };
}

async function run() {
  const sheets = await getSheetsClient();
  const drive = await getDriveClient();
  const supabase = getSupabaseAdmin();

  const { data: studentRows, error } = await supabase.from('students').select('id, legacy_id');
  if (error) throw error;
  const studentMap = new Map(studentRows.map(r => [r.legacy_id, r.id]));

  const documents = await readSheet(sheets, SHEET_ID, 'documents');
  console.log(`documents: ${documents.length} rows`);
  const docResult = await migrateRows({
    supabase, drive, studentMap,
    rows: documents,
    bucket: 'documents',
    table: 'documents',
    buildPath: (studentId, row, ext) => `${studentId}/${row.type}.${ext}`,
    buildRow: (studentId, row, storagePath) => ({
      legacy_id: String(row.id),
      student_id: studentId,
      doc_type: row.type,
      storage_path: storagePath,
      uploaded_at: row.uploadedAt || new Date().toISOString(),
      is_verified: toBool(row.isVerified),
    }),
    label: 'document',
  });

  const payments = (await readSheet(sheets, SHEET_ID, 'payments')).map(r => ({ ...r, driveFileId: r.slipDriveId }));
  console.log(`payments: ${payments.length} rows`);
  const paymentResult = await migrateRows({
    supabase, drive, studentMap,
    rows: payments,
    bucket: 'payment-slips',
    table: 'payments',
    buildPath: (studentId, row, ext) => `${studentId}/${row.id}.${ext}`,
    buildRow: (studentId, row, storagePath) => ({
      legacy_id: String(row.id),
      student_id: studentId,
      amount: Number(row.amount) || 0,
      method: row.method || 'promptpay',
      storage_path: storagePath,
      paid_at: row.paidAt || new Date().toISOString(),
      is_verified: toBool(row.isVerified),
    }),
    label: 'payment',
  });

  if (docResult.failed || paymentResult.failed) {
    console.warn('\nSome files failed to migrate — re-run this script (upsert is safe) or check the errors above.');
  }
  console.log('File migration done.');
}

run().catch(err => { console.error(err); process.exit(1); });
