-- Applied to production (Supabase ftjxpivxeavxdgcfpsba) 2026-07-11.
--
-- dash.readings_all: the dashboard's single read path for production
-- readings. Unions the live phone-logger data in public.logs (written by
-- log.verminord.app) with the dashboard's own dash.readings, so the app
-- stays in sync with zero external sync jobs. Rules:
--   * every public.logs row is included (source 'app', read-only in the UI)
--   * dash.readings rows entered in the dashboard are always included
--   * dash.readings rows imported from Sheets are included only when no
--     public.logs row exists for the same (system, date) — those Sheets rows
--     were themselves copies of phone entries
--   * avvik is auto-computed against dash.targets for app rows; native rows
--     keep their manual flag
--
-- The view is owned by postgres on purpose: view-owner privilege semantics
-- let dash_app read public.logs through it without touching that table's
-- RLS setup. Do NOT set security_invoker=true on this view.

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
                  where l.system = r.system and l.date::text = r.date)
union all
select
  'a:' || l.id::text                       as id,
  null::bigint                             as rid,
  l.system,
  to_char(l.date, 'YYYY-MM-DD')            as date,
  coalesce(l.temperature, 0)::real         as temp,
  coalesce(l.ph, 0)::real                  as ph,
  coalesce(l.moisture, 0)::real            as fukt,
  coalesce(l.feed_amount_liters, 0)::real  as for_l,
  coalesce(l.notes, '')                    as notat,
  case when (l.temperature is not null and (l.temperature < t.temp_min or l.temperature > t.temp_max))
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
