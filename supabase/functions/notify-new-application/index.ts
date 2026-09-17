// notify-new-application — Web Push fan-out to every admin/staff device
// that opted in (js/admin.js's "🔔 เปิดการแจ้งเตือน" button), fired by
// supabase/migrations/0026_push_notifications.sql's AFTER INSERT trigger
// on students the instant a new application lands.
//
// Deployed with verify_jwt=false: the trigger that calls this fires from
// a plain SQL INSERT with no browser session, so it can't carry a real
// user JWT. Instead this checks the x-webhook-secret header against the
// same value the trigger reads from Supabase Vault — same trust model
// Supabase's own dashboard-managed Database Webhooks use.
//
// Setup (one-time, cannot be done by the assistant):
//   1. Generate a VAPID keypair (e.g. `npx web-push generate-vapid-keys`).
//   2. supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... --project-ref bfkklmixuqpwkjzglbpf
//   3. Put the same VAPID_PUBLIC_KEY in js/config.js's CONFIG.VAPID_PUBLIC_KEY
//      (public key only — safe to ship to the browser, that's the point of VAPID).
//   4. supabase functions deploy notify-new-application --project-ref bfkklmixuqpwkjzglbpf

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const WEBHOOK_SECRET = Deno.env.get('NOTIFY_WEBHOOK_SECRET');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
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
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ success: false, message: 'VAPID keys not configured' }, 500);
  if (!WEBHOOK_SECRET) return json({ success: false, message: 'NOTIFY_WEBHOOK_SECRET not configured' }, 500);

  // Only the students-insert trigger (supabase/migrations/0026) should
  // ever be able to fan out a push — anyone else hitting this endpoint
  // could otherwise spam every admin device with fake "new application"
  // notifications.
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return json({ success: false, message: 'Forbidden' }, 403);
  }

  const payload = await req.json().catch(() => ({}));
  const applicantName = `${payload.firstName || ''} ${payload.lastName || ''}`.trim() || 'ผู้สมัครใหม่';
  const applicationNo = payload.applicationNo || '';

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: subs, error } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth_key');
  if (error) return json({ success: false, message: error.message }, 500);
  if (!subs || subs.length === 0) return json({ success: true, sent: 0 });

  webpush.setVapidDetails('https://regis-mocha-ten.vercel.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const notificationPayload = JSON.stringify({
    title: '📝 มีใบสมัครใหม่',
    body: `${applicantName} — เลขที่ใบสมัคร ${applicationNo}`,
    url: '/admin.html',
  });

  let sent = 0;
  const staleEndpoints: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        notificationPayload,
      );
      sent++;
    } catch (err) {
      // 404/410 means the browser unsubscribed or the push service
      // considers this endpoint dead — clean it up instead of retrying
      // it forever on every future application.
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) staleEndpoints.push(s.endpoint);
      else console.error('web-push send failed:', err);
    }
  }));

  if (staleEndpoints.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
  }

  return json({ success: true, sent, removed: staleEndpoints.length });
});
