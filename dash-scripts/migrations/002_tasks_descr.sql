-- Applied to production (Supabase ftjxpivxeavxdgcfpsba) 2026-07-11.
-- Free-text description on tasks (richer cards on Oppgaver).
alter table dash.tasks add column if not exists descr text not null default '';
