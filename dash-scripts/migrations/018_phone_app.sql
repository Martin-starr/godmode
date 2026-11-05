-- 018: the phone app (5 Nov 2026).
--
-- 1. public.logs.avvik — the person logging can flag an entry as a
--    deviation. The readings_all view counts it as one, alongside the
--    computed out-of-target check.
-- 2. public.log_photos — a photo taken with the entry (resized on the phone
--    to ~1280 px JPEG before upload). Stored in the database, next to the
--    log it belongs to; deleted with it.
-- 3. dash.alerts — what the app has told Martin about (push notifications
--    and the Varsler screen). One row per event, deduplicated by key.
-- 4. dash.push_subscriptions — the phones that asked for notifications.

alter table public.logs add column if not exists avvik boolean not null default false;

create table if not exists public.log_photos (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.logs(id) on delete cascade,
  content_type text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists log_photos_log_id_idx on public.log_photos (log_id);
grant select, insert, delete on public.log_photos to dash_app;

create table if not exists dash.alerts (
  id bigint generated always as identity primary key,
  key text not null unique,
  kind text not null,
  title text not null,
  body text not null default '',
  href text,
  fired_at timestamptz not null default now()
);
grant select, insert on dash.alerts to dash_app;

create table if not exists dash.push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  keys jsonb not null,
  user_name text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures integer not null default 0
);
grant select, insert, update, delete on dash.push_subscriptions to dash_app;

-- readings_all: an entry flagged by hand counts as a deviation too.
create or replace view dash.readings_all as
with t as (
  select
    (select min from dash.targets where metric = 'temp') as temp_min,
    (select max from dash.targets where metric = 'temp') as temp_max,
    (select min from dash.targets where metric = 'ph')   as ph_min,
    (select max from dash.targets where metric = 'ph')   as ph_max,
    (select min from dash.targets where metric = 'fukt') as fukt_min,
    (select max from dash.targets where metric = 'fukt') as fukt_max
)
select
  'd:' || r.id::text                       as id,
  r.id                                     as rid,
  r.system, r.date, r.temp, r.ph, r.fukt, r.for_l, r.notat,
  r.avvik, r.logged_by,
  r.source                                 as source,
  null::timestamptz                        as logged_at,
  (r.source <> 'sheets')                   as editable
from dash.readings r
where r.source <> 'sheets'
   or not exists (select 1 from public.logs l
                  where l.system = r.system and to_char(l.date, 'YYYY-MM-DD') = r.date)
union all
select
  'a:' || l.id::text                       as id,
  null::bigint                             as rid,
  l.system,
  to_char(l.date, 'YYYY-MM-DD')            as date,
  l.temperature::real                      as temp,
  l.ph::real                               as ph,
  l.moisture::real                         as fukt,
  coalesce(l.feed_amount_liters, 0)::real  as for_l,
  coalesce(l.notes, '')                    as notat,
  case when l.avvik
         or (l.temperature is not null and (l.temperature < t.temp_min or l.temperature > t.temp_max))
         or (l.ph          is not null and (l.ph          < t.ph_min   or l.ph          > t.ph_max))
         or (l.moisture    is not null and (l.moisture    < t.fukt_min or l.moisture    > t.fukt_max))
       then 1 else 0 end                   as avvik,
  coalesce(nullif(split_part(l.created_by, '@', 1), ''), 'App') as logged_by,
  'app'                                    as source,
  l.created_at                             as logged_at,
  false                                    as editable
from public.logs l
cross join t;

alter view dash.readings_all owner to postgres;
grant select on dash.readings_all to dash_app;
