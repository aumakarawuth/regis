-- ============================================================
-- seed.sql — sample program catalog, mirrors the example rows
-- Programs.gs used to insert into the "programs" sheet on first
-- run (setupProgramsSheet). For local dev / staging only.
-- ============================================================

insert into education_levels (code, name) values
  ('LV1', 'ปวช.'),
  ('LV2', 'ปวส.')
on conflict (code) do nothing;

insert into branches (level_id, code, name, max_students, fee, is_open)
select l.id, v.code, v.name, v.max_students, v.fee, v.is_open
from (values
  ('LV1', 'BR1', 'ช่างยนต์',             30, 300, true),
  ('LV1', 'BR2', 'ช่างไฟฟ้า',            30, 300, true),
  ('LV1', 'BR3', 'การบัญชี',             25, 300, true),
  ('LV1', 'BR4', 'คอมพิวเตอร์ธุรกิจ',    20, 300, true),
  ('LV2', 'BR5', 'ช่างยนต์',             20, 300, false),
  ('LV2', 'BR6', 'เทคโนโลยีสารสนเทศ',    25, 300, true)
) as v(level_code, code, name, max_students, fee, is_open)
join education_levels l on l.code = v.level_code
on conflict (level_id, code) do nothing;

-- round_label must be exactly 'เช้า' / 'บ่าย' / 'ทวิภาคี' — apply.html's
-- step 1 (branch picker) matches a branch's rounds against these three
-- literal words (derived from the "study round" radio buttons), not
-- against a free-form label. Anything else here means selecting a level
-- silently shows zero branches on the apply form.
insert into program_rounds (branch_id, round_label, is_open)
select b.id, v.round_label, true
from (values
  ('BR1', 'เช้า'),
  ('BR1', 'บ่าย'),
  ('BR2', 'เช้า'),
  ('BR3', 'เช้า'),
  ('BR4', 'เช้า'),
  ('BR6', 'เช้า')
) as v(branch_code, round_label)
join branches b on b.code = v.branch_code;
