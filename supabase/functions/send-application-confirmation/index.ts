// send-application-confirmation — pushes a LINE Flex Message confirming
// a submitted application, with a button that reopens the LIFF app to
// check status (index.html already handles that via getApplicationStatus).
//
// Called (fire-and-forget) from apply.html right after submit_application
// succeeds. Runs server-side because it needs LINE_CHANNEL_ACCESS_TOKEN —
// that must never reach the browser, so this can't be done from the
// client the way the rest of the app talks to Supabase directly.
//
// Setup (one-time, cannot be done by the assistant — the token belongs to
// the school's LINE channel):
//   1. LINE Developers Console -> the channel backing this LIFF app ->
//      Messaging API tab -> issue/copy a channel access token.
//      (If the LIFF app lives under a LINE Login-only channel with no
//      Messaging API tab, push messages aren't possible from that
//      channel — the LIFF app needs to be moved under / linked to a
//      channel that has Messaging API enabled.)
//   2. supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=xxxx --project-ref bfkklmixuqpwkjzglbpf
//   3. supabase functions deploy send-application-confirmation --project-ref bfkklmixuqpwkjzglbpf
//   4. The user must have added that channel's Official Account as a
//      LINE friend — LINE silently drops push messages otherwise.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
const LIFF_ID = Deno.env.get('LIFF_ID') ?? '2010194460-OF1oXCTY';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
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

function row(label: string, value: string) {
  return {
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#6B7280', size: 'sm', flex: 2 },
      { type: 'text', text: value, wrap: true, size: 'sm', flex: 4, weight: 'bold' },
    ],
  };
}

function buildFlex(applicationNo: string, branchName: string, roundName: string) {
  return {
    type: 'flex',
    altText: `สมัครเรียนสำเร็จ — เลขที่ใบสมัคร ${applicationNo}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#00B900', paddingAll: '20px',
        contents: [
          { type: 'text', text: '✅ สมัครเรียนสำเร็จ', color: '#ffffff', weight: 'bold', size: 'lg' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
        contents: [
          { type: 'text', text: 'เลขที่ใบสมัคร', color: '#6B7280', size: 'xs' },
          { type: 'text', text: applicationNo, weight: 'bold', size: 'xl', color: '#00B900' },
          { type: 'separator', margin: 'md' },
          row('สาขา', branchName),
          row('รอบ', roundName),
          row('สถานะ', 'รอตรวจสอบเอกสาร'),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          {
            type: 'button', style: 'primary', color: '#00B900', height: 'sm',
            action: { type: 'uri', label: '🔍 ตรวจสอบสถานะ', uri: `https://liff.line.me/${LIFF_ID}` },
          },
        ],
      },
    },
  };
}

Deno.serve(async (req) => {
  // Browsers preflight cross-origin POSTs with an OPTIONS request first;
  // apply.html calls this from *.vercel.app, so without an explicit 2xx +
  // CORS headers here, the preflight fails and the browser never sends
  // the real POST at all (this is why the function had zero invocations
  // despite the client-side invoke() call being correct).
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);
  if (!LINE_CHANNEL_ACCESS_TOKEN) return json({ success: false, message: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, 500);

  const { studentId } = await req.json().catch(() => ({}));
  if (!studentId) return json({ success: false, message: 'studentId required' }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: student, error } = await supabase
    .from('students')
    .select('line_user_id, application_no, enrollments(program_rounds(round_label, branches(name)))')
    .eq('id', studentId)
    .single();

  if (error || !student) return json({ success: false, message: 'student not found' }, 404);
  if (!student.line_user_id) return json({ success: true, skipped: true, message: 'no lineUserId on this application' });

  const enroll = Array.isArray(student.enrollments) ? student.enrollments[0] : student.enrollments;
  const branchName = enroll?.program_rounds?.branches?.name || '-';
  const roundName = enroll?.program_rounds?.round_label || '-';

  const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: student.line_user_id,
      messages: [buildFlex(student.application_no, branchName, roundName)],
    }),
  });

  if (!lineRes.ok) {
    const text = await lineRes.text();
    return json({ success: false, message: `LINE API error (${lineRes.status}): ${text}` }, 502);
  }
  return json({ success: true });
});
