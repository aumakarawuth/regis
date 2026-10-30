-- 0030_receipts.sql
--
-- Finance-issued receipt images that admin/staff upload from admin.html's
-- student detail panel and push to the applicant over LINE (see the
-- send-receipt edge function). Private bucket: the edge function hands
-- LINE a long-lived signed URL, so the file itself is never public.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "staff upload receipts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts' and (is_admin() or is_staff()));

create policy "staff read receipts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'receipts' and (is_admin() or is_staff()));

create policy "admin delete receipts"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'receipts' and is_admin());

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  storage_path text not null,
  note text,
  sent_by uuid references auth.users(id),
  sent_at timestamptz not null default now(),
  line_sent boolean not null default false
);
create index if not exists receipts_student_id_idx on receipts(student_id);

alter table receipts enable row level security;
create policy "admin full access receipts" on receipts for all using (is_admin()) with check (is_admin());
create policy "staff view receipts" on receipts for select using (is_staff());
