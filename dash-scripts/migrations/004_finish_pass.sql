-- 004: columns for the July 2026 finish-pass.
--
-- 1. Tasks get an optional priority and due date so Oppgaver can filter/sort
--    on urgency the way the paper list did.
-- 2. Projects get an optional due date for the enlarged card view.
-- 3. dash.readings stops forcing a number into temp/ph/fukt: a missing
--    measurement is NULL, not a fabricated 0 (migration 003 already made the
--    readings_all view NULL-safe for phone rows; this closes the same hole
--    for rows entered in the dashboard itself).
alter table dash.tasks add column if not exists prio text not null default '';
alter table dash.tasks add column if not exists due text not null default '';
alter table dash.projects add column if not exists due text not null default '';
alter table dash.readings alter column temp drop not null;
alter table dash.readings alter column ph drop not null;
alter table dash.readings alter column fukt drop not null;
