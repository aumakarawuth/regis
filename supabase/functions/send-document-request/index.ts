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
const LIFF_ID = Deno.env.get('LIFF_ID') ?? '2011646500-ET0zwCRy';
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

const MASCOT_ICON_URL = 'https://regis-aumakarawuths-projects.vercel.app/assets/mascot-icon.png';

function docRow(label: string) {
  return {
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: '•', color: '#F59E0B', size: 'sm', flex: 0 },
      { type: 'text', text: label, wrap: true, size: 'sm', flex: 5, weight: 'bold' },
    ],
  };
}

const EDIT_SECTION_LABELS: Record<string, string> = {
  personal: 'ข้อมูลส่วนตัว', address: 'ที่อยู่', father: 'ข้อมูลบิดา', mother: 'ข้อมูลมารดา', guardian: 'ข้อมูลผู้ปกครอง',
};
function editSectionLabel(s: string) { return EDIT_SECTION_LABELS[s] || s; }

// Header background as a light-to-dark amber gradient (LINE Flex boxes
// support a `background` gradient object instead of a flat
// `backgroundColor`) instead of the previous solid #F59E0B — gives the
// card some depth instead of a flat color block.
const HEADER_GRADIENT = {
  type: 'linearGradient', angle: '135deg',
  startColor: '#FCD34D', centerColor: '#F59E0B', endColor: '#D97706', centerPosition: '55%',
};

function buildFlex(applicationNo: string, docTypes: string[], editSections: string[], note: string | null, requestId: string) {
  const hasDocs = docTypes.length > 0;
  const hasEdits = editSections.length > 0;
  const hasGeneral = !hasDocs && !hasEdits;
  const body: any[] = [
    { type: 'text', text: 'เลขที่ใบสมัคร', color: '#9A6A00', size: 'xs' },
    { type: 'text', text: applicationNo, weight: 'bold', size: 'lg', color: '#D97706' },
    { type: 'separator', margin: 'md', color: '#FDE9C2' },
  ];
  if (hasDocs) {
    body.push({ type: 'text', text: 'กรุณาอัปโหลดเอกสารเพิ่มเติม', size: 'sm', color: '#6B7280', margin: 'md' });
    body.push({ type: 'box', layout: 'vertical', spacing: 'sm', margin: 'sm', contents: docTypes.map(t => docRow(docLabel(t))) });
  }
  if (hasEdits) {
    body.push({ type: 'text', text: 'กรุณาแก้ไขข้อมูลต่อไปนี้', size: 'sm', color: '#6B7280', margin: 'md' });
    body.push({ type: 'box', layout: 'vertical', spacing: 'sm', margin: 'sm', contents: editSections.map(s => docRow(editSectionLabel(s))) });
  }
  if (hasGeneral) {
    body.push({ type: 'text', text: 'ข้อความจากเจ้าหน้าที่', size: 'sm', color: '#6B7280', margin: 'md' });
  }
  if (note && note.trim()) {
    if (!hasGeneral) {
      body.push({ type: 'separator', margin: 'md', color: '#FDE9C2' });
      body.push({ type: 'text', text: 'หมายเหตุจากเจ้าหน้าที่', size: 'xs', color: '#6B7280', margin: 'md' });
    }
    // A light gradient card behind the note text instead of plain white
    // — the one place in the body that most benefits from some depth,
    // since it's the actual message staff typed and should stand out.
    body.push({
      type: 'box', layout: 'vertical', margin: hasGeneral ? 'sm' : 'sm', paddingAll: '12px', cornerRadius: 'md',
      background: { type: 'linearGradient', angle: '145deg', startColor: '#FFFBEB', endColor: '#FEF3C7' },
      contents: [{ type: 'text', text: note, wrap: true, size: 'sm', color: '#78350F' }],
    });
  }

  // An edit-sections request deep-links straight into apply.html's edit
  // mode, scoped to just those step(s) — LINE forwards any query params
  // appended after the LIFF id through to the endpoint URL. A doc-types
  // request still just reopens the LIFF app itself; index.html's own
  // "ต้องอัปโหลดเอกสารเพิ่มเติม" card (already wired to docTypes there)
  // handles picking the right upload flow. A general (note-only) request
  // has nothing to fill in on apply.html at all — its button just opens
  // the LIFF app's normal status screen.
  const footerButtons: any[] = [];
  if (hasEdits) {
    const sectionsParam = encodeURIComponent(editSections.join(','));
    footerButtons.push({
      type: 'button', style: 'primary', color: '#F59E0B', height: 'sm',
      action: { type: 'uri', label: '✏️ แก้ไขข้อมูล', uri: `https://liff.line.me/${LIFF_ID}?mode=edit&sections=${sectionsParam}&reqId=${requestId}` },
    });
  }
  if (hasDocs) {
    footerButtons.push({
      type: 'button', style: hasEdits ? 'secondary' : 'primary', color: hasEdits ? undefined : '#F59E0B', height: 'sm',
      action: { type: 'uri', label: '📤 อัปโหลดเอกสาร', uri: `https://liff.line.me/${LIFF_ID}` },
    });
  }
  if (hasGeneral) {
    footerButtons.push({
      type: 'button', style: 'primary', color: '#F59E0B', height: 'sm',
      action: { type: 'uri', label: '📱 เปิดแอปสมัครเรียน', uri: `https://liff.line.me/${LIFF_ID}` },
    });
  }

  return {
    type: 'flex',
    altText: `${hasGeneral ? 'ข้อความจากเจ้าหน้าที่' : (hasEdits && !hasDocs ? 'ขอให้แก้ไขข้อมูล' : 'ขอเอกสารเพิ่มเติม')} — เลขที่ใบสมัคร ${applicationNo}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'horizontal', background: HEADER_GRADIENT, paddingAll: '16px', alignItems: 'center',
        contents: [
          {
            type: 'box', layout: 'vertical', spacing: 'xs', flex: 4,
            contents: [
              { type: 'text', text: 'วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์', color: '#FFF7E6', size: 'xs', weight: 'bold', wrap: true },
              { type: 'text', text: hasGeneral ? '📢 แจ้งเตือนจากเจ้าหน้าที่' : (hasEdits && !hasDocs ? '✏️ กรุณาแก้ไขข้อมูล' : '📋 ขอเอกสารเพิ่มเติม'), color: '#ffffff', weight: 'bold', size: 'lg', wrap: true },
            ],
          },
          {
            type: 'image', url: MASCOT_ICON_URL, flex: 2, size: 'full',
            aspectRatio: '393:276', aspectMode: 'fit', gravity: 'bottom',
          },
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px', contents: body },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
        background: { type: 'linearGradient', angle: '180deg', startColor: '#FFFFFF', endColor: '#FFFBEB' },
        contents: footerButtons,
      },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);
  if (!LINE_CHANNEL_ACCESS_TOKEN) return json({ success: false, message: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, 500);

  // Caller must be a logged-in admin OR active staff — verified against
  // admin_users/staff with the service role, using the identity from the
  // caller's own JWT (never trust a studentId/docTypes body alone for
  // this). admin.js shows this action to staff too (0009_staff_logins.sql
  // grants staff insert/update on document_requests), so staff must pass
  // here as well, not just full admins.
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

  const { studentId, docTypes, editSections, note } = await req.json().catch(() => ({}));
  const docTypesArr = Array.isArray(docTypes) ? docTypes : [];
  const editSectionsArr = Array.isArray(editSections) ? editSections : [];
  const noteText = typeof note === 'string' ? note.trim() : '';
  // A request no longer has to be about documents or an edit-mode
  // deep-link at all — staff can also just send a plain text notice
  // (e.g. "เอกสารของคุณผ่านการตรวจสอบแล้ว") with nothing for the
  // applicant to upload or fix.
  if (!studentId || (docTypesArr.length === 0 && editSectionsArr.length === 0 && !noteText)) {
    return json({ success: false, message: 'studentId and docTypes/editSections/note required' }, 400);
  }

  const { data: student, error } = await supabase
    .from('students')
    .select('line_user_id, application_no')
    .eq('id', studentId)
    .single();
  if (error || !student) return json({ success: false, message: 'student not found' }, 404);

  const { data: inserted, error: insertErr } = await supabase.from('document_requests').insert({
    student_id: studentId,
    doc_types: docTypesArr,
    edit_sections: editSectionsArr.length ? editSectionsArr : null,
    note: note || null,
    requested_by: user.id,
  }).select('id').single();
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
      messages: [buildFlex(student.application_no, docTypesArr, editSectionsArr, note, inserted.id)],
    }),
  });

  if (!lineRes.ok) {
    const text = await lineRes.text();
    return json({ success: false, message: `LINE API error (${lineRes.status}): ${text}` }, 502);
  }
  return json({ success: true });
});
