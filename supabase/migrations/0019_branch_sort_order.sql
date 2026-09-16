-- ============================================================
-- 0019_branch_sort_order.sql
--
-- apply.html's branch dropdown had no explicit ordering — branches
-- came back in whatever order Postgres happened to return them, and
-- the level dropdown's order was derived from "first branch seen"
-- rather than the level itself, so ปวช./ปวส. weren't guaranteed to
-- appear in a stable, correct order.
--
-- Adds branches.sort_order so an admin can control branch display
-- order explicitly (edited from the Programs page), and backfills it
-- to match the previous de-facto ordering (by code) so nothing visibly
-- changes until an admin edits it.
-- ============================================================

alter table branches add column if not exists sort_order integer not null default 0;

with ranked as (
  select id, row_number() over (partition by level_id order by code) as rn
  from branches
)
update branches b set sort_order = ranked.rn
from ranked
where ranked.id = b.id;
