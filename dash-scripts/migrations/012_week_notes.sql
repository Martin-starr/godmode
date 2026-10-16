-- One row holding the /week checklist app's data as JSON ({date: {list, ts}}),
-- so the list syncs across devices. Written by app/api/week/route.js as
-- dash_app; the PIN lives in the WEEK_PIN env var. Applied 2026-10-16.
create table if not exists dash.week_notes (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into dash.week_notes (id) values (1) on conflict do nothing;
grant select, insert, update on dash.week_notes to dash_app;
