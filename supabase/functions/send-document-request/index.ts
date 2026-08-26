// send-document-request — admin picks which documents are missing or
// incomplete for an applicant (optionally with a note) and this pushes
// a LINE Flex Message listing exactly what's needed, with a button
// back into the LIFF app to upload it. Called from js/admin.js's
// student detail panel.
//
// Runs server-side for the same reason as send-application-confirmation:
// needs LINE_CHANNEL_ACCESS_TOKEN, which must never reach the browser.
// Reuses that function's setup (same token/project) — nothing new to
// configure if send-application-confirmation is already working.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
const LIFF_ID = Deno.env.get('LIFF_ID') ?? '2010194460-OF1oXCTY';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

const DOC_LABELS: Record<string, string> = {
  id_card_front: 'บัตร ปชช. ด้านหน้า',
  id_card_back: 'บัตร ปชช. ด้านหลัง',
  house_reg: 'ทะเบียนบ้าน',
  edu_cert: 'วุฒิการศึกษา',
  edu_cert_front: 'วุฒิการศึกษา ด้านหน้า',
  edu_cert_back: 'วุฒิการศึกษา ด้านหลัง',
  payment_slip: 'สลิปโอนเงิน',
};
function docLabel(t: string) { return DOC_LABELS[t] || t; }

function docRow(label: string) {
  return {
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: '•', color: '#F59E0B', size: 'sm', flex: 0 },
      { type: 'text', text: label, wrap: true, size: 'sm', flex: 5, weight: 'bold' },
    ],
  };
}

function buildFlex(applicationNo: string, docTypes: string[], note: string | null) {
  const body: any[] = [
    { type: 'text', text: 'เลขที่ใบสมัคร', color: '#6B7280', size: 'xs' },
    { type: 'text', text: applicationNo, weight: 'bold', size: 'lg', color: '#F59E0B' },
    { type: 'separator', margin: 'md' },
    { type: 'text', text: 'กรุณาอัปโหลดเอกสารเพิ่มเติม', size: 'sm', color: '#6B7280', margin: 'md' },
    { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'sm', contents: docTypes.map(t => docRow(docLabel(t))) },
  ];
  if (note && note.trim()) {
    body.push({ type: 'separator', margin: 'md' });
    body.push({ type: 'text', text: 'หมายเหตุจากเจ้าหน้าที่', size: 'xs', color: '#6B7280', margin: 'md' });
    body.push({ type: 'text', text: note, wrap: true, size: 'sm' });
  }

  return {
    type: 'flex',
    altText: `ขอเอกสารเพิ่มเติม — เลขที่ใบสมัคร ${applicationNo}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#F59E0B', paddingAll: '20px',
        contents: [
          { type: 'text', text: '📋 ขอเอกสารเพิ่มเติม', color: '#ffffff', weight: 'bold', size: 'lg' },
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px', contents: body },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          {
            type: 'button', style: 'primary', color: '#F59E0B', height: 'sm',
            action: { type: 'uri', label: '📤 อัปโหลดเอกสาร', uri: `https://liff.line.me/${LIFF_ID}` },
          },
        ],
      },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);
  if (!LINE_CHANNEL_ACCESS_TOKEN) return json({ success: false, message: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, 500);

  // Caller must be a logged-in admin — verified against admin_users with
  // the service role, using the identity from the caller's own JWT
  // (never trust a studentId/docTypes body alone for this).
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return json({ success: false, message: 'ไม่ได้เข้าสู่ระบบ' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!adminRow) return json({ success: false, message: 'ไม่มีสิทธิ์แอดมิน' }, 403);

  const { studentId, docTypes, note } = await req.json().catch(() => ({}));
  if (!studentId || !Array.isArray(docTypes) || docTypes.length === 0) {
    return json({ success: false, message: 'studentId and docTypes required' }, 400);
  }

  const { data: student, error } = await supabase
    .from('students')
    .select('line_user_id, application_no')
    .eq('id', studentId)
    .single();
  if (error || !student) return json({ success: false, message: 'student not found' }, 404);

  const { error: insertErr } = await supabase.from('document_requests').insert({
    student_id: studentId,
    doc_types: docTypes,
    note: note || null,
    requested_by: user.id,
  });
  if (insertErr) return json({ success: false, message: `บันทึกคำขอล้มเหลว: ${insertErr.message}` }, 500);

  if (!student.line_user_id) {
    return json({ success: true, skipped: true, message: 'บันทึกคำขอแล้ว แต่ผู้สมัครไม่มี LINE user id จึงส่งข้อความไม่ได้' });
  }

  const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: student.line_user_id,
      messages: [buildFlex(student.application_no, docTypes, note)],
    }),
  });

  if (!lineRes.ok) {
    const text = await lineRes.text();
    return json({ success: false, message: `LINE API error (${lineRes.status}): ${text}` }, 502);
  }
  return json({ success: true });
});
