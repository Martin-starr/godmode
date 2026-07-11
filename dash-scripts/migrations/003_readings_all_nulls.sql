-- Applied to production (Supabase ftjxpivxeavxdgcfpsba) 2026-07-11, after
-- the null-safe UI deploy.
--
-- Two audit findings on the 001 view:
--  1. NULL temp/ph/fukt in public.logs were coalesced to 0 — fabricated
--     measurements on a compliance-facing log (and counted as "utenfor mål").
--     The view now passes NULLs through; the UI shows "—" and skips them in
--     charts and target-range stats.
--  2. The sheets-dedup predicate compared l.date::text, which depends on the
--     session's DateStyle. Now rendered with to_char, immune to config.

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
