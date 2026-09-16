-- ============================================================
-- 0017_branch_work_location_toggle.sql
--
-- apply.html's หมวดการเรียน step (0085/#85) only showed the
-- กรุงเทพ/ต่างจังหวัด work-location choice for branches whose name
-- contained "ค้าปลีก" — a hardcoded guess at which programs actually
-- offer a work-study track split by location. Per request, this is now
-- an explicit per-branch toggle admin can flip from the Programs page
-- instead of being inferred from the branch name.
--
-- Defaults preserve today's behavior: the two existing retail-business
-- branches (the ones the hardcoded check matched) start toggled on,
-- everything else starts off.
-- ============================================================

alter table branches add column if not exists show_work_location boolean not null default false;

update branches set show_work_location = true where name like '%ค้าปลีก%';
