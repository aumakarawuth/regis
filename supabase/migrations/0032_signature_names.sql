-- 0032_signature_names.sql
-- Per-applicant names typed into the ( ) under the ผู้รับสมัคร /
-- ฝ่ายการเงิน signatures on print.html (saved with "บันทึกการแก้ไข").
alter table students add column if not exists receiver_name text;
alter table students add column if not exists finance_name text;
