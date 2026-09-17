-- 0028_old_school_subdistrict_district.sql
--
-- apply.html never collects the old school's ตำบล/แขวง and อำเภอ/เขต (only
-- its จังหวัด, via "จังหวัดที่ศึกษา"), but the printed ปวส. form has boxes
-- for them so staff can hand-fill them on print.html directly. These need
-- to be real, savable columns (not just blank print.js placeholders) so
-- print.js's editable fields have somewhere to write to.

alter table students add column if not exists old_school_subdistrict text;
alter table students add column if not exists old_school_district text;
