-- ============================================================
-- 0026_push_notifications.sql
--
-- Web Push subscriptions for the admin dashboard's "🔔 เปิดการแจ้งเตือน"
-- button (js/admin.js) — lets a logged-in admin/staff device receive a
-- browser push notification the moment a new application comes in,
-- even with the dashboard tab closed (that's the whole point of using
-- a Service Worker + Push API instead of, say, polling from an open tab).
--
-- Each browser/device that opts in stores one row here (endpoint is the
-- push service's unique per-subscription URL). A Postgres trigger on
-- students' insert calls the notify-new-application Edge Function, which
-- reads every row here and sends a Web Push message to each.
--
-- The trigger can't carry a real user JWT (it fires from a plain SQL
-- INSERT, not a browser session), so the Edge Function is deployed with
-- verify_jwt=false and instead checks a shared secret header the trigger
-- sends — same trust boundary as Supabase's own dashboard-managed
-- Database Webhooks. The secret lives in Supabase Vault (not this file —
-- this is a public repo, so a literal here would leak it into git
-- history) as a secret named 'notify_webhook_secret', created once via:
--   select vault.create_secret('<random-value>', 'notify_webhook_secret');
-- and read back below through vault.decrypted_secrets. current_setting()
-- doesn't work here — Supabase's pooled connection role can't ALTER
-- DATABASE to set a custom GUC (permission denied), which Vault sidesteps.
-- ============================================================

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_key    text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index idx_push_subscriptions_user on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- A signed-in admin/staff manages only their own device subscriptions —
-- the notify function itself runs as service_role and bypasses RLS to
-- read every row.
create policy "manage own subscription" on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create extension if not exists pg_net;

create or replace function notify_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_webhook_secret' limit 1;

  perform net.http_post(
    url := 'https://bfkklmixuqpwkjzglbpf.supabase.co/functions/v1/notify-new-application',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object(
      'studentId', new.id,
      'applicationNo', new.application_no,
      'firstName', new.first_name,
      'lastName', new.last_name
    )
  );
  return new;
end;
$$;

create trigger trg_notify_new_application
  after insert on students
  for each row execute function notify_new_application();
