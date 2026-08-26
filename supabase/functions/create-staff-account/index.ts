// create-staff-account — admin creates a real login (email + password)
// for a roster row in the staff table, so that person can log into
// admin.html with restricted (non-admin) access. Runs server-side
// because creating an auth user needs the service role key, which must
// never reach the browser.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  // Caller must be a logged-in full admin — never trust the request
  // body alone for a privileged action like this.
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return json({ success: false, message: 'ไม่ได้เข้าสู่ระบบ' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!adminRow) return json({ success: false, message: 'ไม่มีสิทธิ์แอดมิน' }, 403);

  const { staffId, email, password } = await req.json().catch(() => ({}));
  if (!staffId || !email || !password) {
    return json({ success: false, message: 'staffId, email, password required' }, 400);
  }
  if (password.length < 6) {
    return json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, 400);
  }

  const { data: staffRow, error: staffErr } = await supabase.from('staff').select('id, user_id, name').eq('id', staffId).maybeSingle();
  if (staffErr || !staffRow) return json({ success: false, message: 'ไม่พบเจ้าหน้าที่คนนี้' }, 404);
  if (staffRow.user_id) return json({ success: false, message: 'เจ้าหน้าที่คนนี้มีบัญชี login อยู่แล้ว' }, 400);

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr || !created?.user) {
    return json({ success: false, message: `สร้างบัญชีล้มเหลว: ${createErr?.message || 'unknown error'}` }, 500);
  }

  const { error: linkErr } = await supabase.from('staff').update({ user_id: created.user.id, email }).eq('id', staffId);
  if (linkErr) return json({ success: false, message: `เชื่อมบัญชีล้มเหลว: ${linkErr.message}` }, 500);

  return json({ success: true });
});
