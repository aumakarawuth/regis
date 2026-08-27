-- Enables Realtime (postgres_changes) events on the tables the admin
-- dashboard subscribes to for live notifications (js/admin.js
-- _subscribeRealtime). RLS still applies to what a client actually
-- receives, this just lets the changes be broadcast at all.
alter publication supabase_realtime add table students;
alter publication supabase_realtime add table duplicate_attempt_log;
