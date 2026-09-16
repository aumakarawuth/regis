-- ============================================================
-- 0018_branch_study_category_toggle.sql
--
-- Whether a branch shows the ทวิภาคี (work-location) sub-field is
-- already an admin-side per-branch toggle (0017/#90). The หมวดการเรียน
-- step itself (เรียน จ-ศ / เรียนไปทำงานไป) was still shown
-- unconditionally for every branch (รอบเช้า only) — add the same kind
-- of toggle for it, defaulting to on so nothing changes until an admin
-- turns it off for a branch.
-- ============================================================

alter table branches add column if not exists show_study_category boolean not null default true;
