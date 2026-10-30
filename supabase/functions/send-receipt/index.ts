// send-receipt — admin/staff upload a receipt image issued by finance
// (to the private `receipts` bucket, from js/admin.js) and this pushes
// it to the applicant on LINE as an image message, plus a short text
// with the application number and optional note.
//
// Same setup as send-document-request (LINE_CHANNEL_ACCESS_TOKEN etc.).
// LINE fetches the image from a URL, so we hand it a long-lived signed
// URL for the private object rather than making the bucket public.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year — LINE re-fetches when the chat is reopened

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);
  if (!LINE_CHANNEL_ACCESS_TOKEN) return json({ success: false, message: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return json({ success: false, message: 'ไม่ได้เข้าสู่ระบบ' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!adminRow) {
    const { data: staffRow } = await supabase.from('staff').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
    if (!staffRow) return json({ success: false, message: 'ไม่มีสิทธิ์แอดมิน' }, 403);
  }

  const { studentId, storagePath, note } = await req.json().catch(() => ({}));
  if (!studentId || typeof storagePath !== 'string' || !storagePath.startsWith(`${studentId}/`)) {
    return json({ success: false, message: 'studentId and storagePath required' }, 400);
  }
  const noteText = typeof note === 'string' ? note.trim() : '';

  const { data: student, error } = await supabase
    .from('students')
    .select('line_user_id, application_no')
    .eq('id', studentId)
    .single();
  if (error || !student) return json({ success: false, message: 'student not found' }, 404);

  const { data: inserted, error: insertErr } = await supabase.from('receipts').insert({
    student_id: studentId,
    storage_path: storagePath,
    note: noteText || null,
    sent_by: user.id,
  }).select('id').single();
  if (insertErr) return json({ success: false, message: `บันทึกใบเสร็จล้มเหลว: ${insertErr.message}` }, 500);

  if (!student.line_user_id) {
    return json({ success: true, skipped: true, message: 'บันทึกใบเสร็จแล้ว แต่ผู้สมัครไม่มี LINE user id จึงส่งไม่ได้' });
  }

  const { data: signed, error: signErr } = await supabase.storage.from('receipts').createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (signErr || !signed?.signedUrl) return json({ success: false, message: 'สร้างลิงก์รูปใบเสร็จไม่สำเร็จ' }, 500);

  const text = `🧾 ใบเสร็จรับเงิน\nเลขที่ใบสมัคร ${student.application_no}` + (noteText ? `\n\n${noteText}` : '');
  const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: student.line_user_id,
      messages: [
        { type: 'text', text },
        { type: 'image', originalContentUrl: signed.signedUrl, previewImageUrl: signed.signedUrl },
      ],
    }),
  });

  if (!lineRes.ok) {
    const body = await lineRes.text();
    console.error('LINE push failed', lineRes.status, body, 'url length', signed.signedUrl.length);
    return json({ success: false, message: `LINE API error (${lineRes.status}): ${body}` }, 502);
  }
  await supabase.from('receipts').update({ line_sent: true }).eq('id', inserted.id);
  return json({ success: true });
});
