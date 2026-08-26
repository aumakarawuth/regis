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

const SCHOOL_NAME = 'วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์';
const SCHOOL_PHONE = '02-4346155';
const SCHOOL_LINE = '@ctc.bangkok';
const MASCOT_ICON_URL = 'https://regis-aumakarawuths-projects.vercel.app/assets/mascot-icon.png';

const PRIMARY = '#0EA5E9';
const PRIMARY_DARK = '#0284C7';

function row(label: string, value: string) {
  return {
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#6B7280', size: 'sm', flex: 2 },
      { type: 'text', text: value, wrap: true, size: 'sm', flex: 5, weight: 'bold' },
    ],
  };
}

function thaiDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function buildFlex(opts: {
  applicationNo: string;
  applicantName: string;
  levelName: string;
  branchName: string;
  roundName: string;
  appliedAt: string;
}) {
  const { applicationNo, applicantName, levelName, branchName, roundName, appliedAt } = opts;
  return {
    type: 'flex',
    altText: `ใบยืนยันการสมัครเรียน — เลขที่ใบสมัคร ${applicationNo}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'horizontal', backgroundColor: PRIMARY, paddingAll: '16px', alignItems: 'center',
        contents: [
          {
            type: 'box', layout: 'vertical', spacing: 'xs', flex: 4,
            contents: [
              { type: 'text', text: SCHOOL_NAME, color: '#E0F2FE', size: 'xs', weight: 'bold', wrap: true },
              { type: 'text', text: 'ใบยืนยันการสมัครเรียน', color: '#ffffff', weight: 'bold', size: 'lg', wrap: true },
            ],
          },
          {
            type: 'image', url: MASCOT_ICON_URL, flex: 2, size: 'full',
            aspectRatio: '393:276', aspectMode: 'fit', gravity: 'bottom',
          },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
        contents: [
          { type: 'text', text: 'เลขที่ใบสมัคร', color: '#6B7280', size: 'xs' },
          { type: 'text', text: applicationNo, weight: 'bold', size: 'xl', color: PRIMARY_DARK },
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md',
            contents: [
              row('ผู้สมัคร', applicantName),
              row('ระดับ', levelName),
              row('สาขาวิชา', branchName),
              row('รอบ/เวลาเรียน', roundName),
              row('วันที่สมัคร', thaiDate(appliedAt)),
              row('สถานะ', 'รอตรวจสอบเอกสาร'),
            ],
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'text', margin: 'md', wrap: true, size: 'xs', color: '#6B7280',
            text: 'เจ้าหน้าที่จะตรวจสอบเอกสารและติดต่อกลับภายใน 1–2 วันทำการ กรุณาติดตามสถานะผ่านปุ่มด้านล่าง',
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
        contents: [
          {
            type: 'button', style: 'primary', color: PRIMARY, height: 'sm',
            action: { type: 'uri', label: '🔍 ตรวจสอบสถานะการสมัคร', uri: `https://liff.line.me/${LIFF_ID}` },
          },
          {
            type: 'text', align: 'center', size: 'xxs', color: '#9CA3AF',
            text: `สอบถามเพิ่มเติม โทร. ${SCHOOL_PHONE} หรือ LINE ${SCHOOL_LINE}`,
            wrap: true,
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
    .select(`
      line_user_id, application_no, prefix, first_name, last_name, applied_at,
      enrollments(program_rounds(round_label, branches(name, education_levels(name))))
    `)
    .eq('id', studentId)
    .single();

  if (error || !student) return json({ success: false, message: 'student not found' }, 404);
  if (!student.line_user_id) return json({ success: true, skipped: true, message: 'no lineUserId on this application' });

  const enroll = Array.isArray(student.enrollments) ? student.enrollments[0] : student.enrollments;
  const branch = enroll?.program_rounds?.branches;
  const applicantName = `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim();
  const levelName = branch?.education_levels?.name || '-';
  const branchName = branch?.name || '-';
  const roundName = enroll?.program_rounds?.round_label || '-';

  const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: student.line_user_id,
      messages: [buildFlex({
        applicationNo: student.application_no,
        applicantName: applicantName || '-',
        levelName, branchName, roundName,
        appliedAt: student.applied_at,
      })],
    }),
  });

  if (!lineRes.ok) {
    const text = await lineRes.text();
    return json({ success: false, message: `LINE API error (${lineRes.status}): ${text}` }, 502);
  }
  return json({ success: true });
});
