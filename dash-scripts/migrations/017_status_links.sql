-- 017: links to the public status page (5 Nov 2026).
--
-- One row per link handed out (NIBIO, Mattilsynet …). The token is the
-- address; revoking sets revoked_at and the page answers 404 from then
-- on. Views and last_seen_at say who looked, and when. Nothing is deleted.
create table if not exists dash.status_links (
  token text primary key,
  label text not null,
  created_by text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  views integer not null default 0,
  last_seen_at timestamptz
);
grant select, insert, update on dash.status_links to dash_app;
