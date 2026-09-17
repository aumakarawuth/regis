-- ============================================================
-- 0023_guardian_occupation.sql
--
-- print.js's "อาชีพ" field for ผู้ปกครอง (guardian) was already
-- printed on the form and made editable back in #103, wired to
-- guardians.occupation — but that column never actually existed
-- (guardians was never given one, unlike parents, which has had
-- occupation since 0001_init_schema.sql). Any edit to that field on
-- print.html failed with "Could not find the 'occupation' column of
-- 'guardians' in the schema cache".
--
-- apply.html never collects a guardian's occupation at submission
-- time either, so this column starts out always blank — same as
-- every other staff-filled-in-later field on the form — but at least
-- now the edit actually saves.
-- ============================================================

alter table guardians add column occupation text;
