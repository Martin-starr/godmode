-- 013 — dash v1 (Anlegg · Logg · Data): Ecowitt sensor store, channel map,
-- manual-log columns. Additive only; every statement is re-runnable.
--
-- Applied to production (Supabase ftjxpivxeavxdgcfpsba) 2026-10-28 through
-- the Supabase MCP (runs as postgres). Local: psql "$DASH_DATABASE_URL" -1 -f …
--
-- Why public and not dash: the manual log already lives in public.logs
-- (written by the phone logger, read by the old dashboard through
-- dash.readings_all). The new pages write there too, so the sensor tables
-- sit next to it and share its access pattern (authenticated read/write,
-- plus the dashboard's own dash_app role, which until now could only reach
-- public.logs through the postgres-owned view).

-- ── 1. Sensor readings (Ecowitt cloud API → one row per channel per ts) ──
create table if not exists public.sensor_readings (
  id bigint generated always as identity primary key,
  ts timestamptz not null,
  channel smallint not null,            -- 1..7 for WH52, 0 = GW1200 indoor
  soil_temp_c numeric,
  soil_moisture_vol_pct numeric,
  ec_us_cm numeric,
  indoor_temp_c numeric,
  indoor_rh_pct numeric,
  pressure_hpa numeric,
  raw jsonb,
  source text not null default 'ecowitt',
  unique (ts, channel)
);
create index if not exists sensor_readings_channel_ts_idx
  on public.sensor_readings (channel, ts desc);

-- ── 2. Channel → system map (filled in by Martin under Mer → Kanaler) ──
create table if not exists public.sensor_channels (
  channel smallint primary key,
  system_id uuid references public.systems(id),
  label text,
  updated_at timestamptz default now()
);
-- 'bed'        = a worm bed (system_id set)
-- 'hygiene'    = the hygienisering / prekompost tank (no system row)
-- 'room'       = GW1200 indoor climate (channel 0)
-- 'unassigned' = not mapped yet; shown as "CHn (ikke tildelt)"
alter table public.sensor_channels
  add column if not exists role text not null default 'unassigned'
  check (role in ('unassigned', 'bed', 'hygiene', 'room'));

insert into public.sensor_channels (channel, role, label) values
  (0, 'room', 'Rom (GW1200)'),
  (1, 'unassigned', null), (2, 'unassigned', null), (3, 'unassigned', null),
  (4, 'unassigned', null), (5, 'unassigned', null), (6, 'unassigned', null),
  (7, 'unassigned', null)
on conflict (channel) do nothing;

-- ── 3. Manual log: timestamp, harvest, handheld moisture ──
alter table public.logs
  add column if not exists logged_at timestamptz default now(),
  add column if not exists harvest_liters numeric,
  add column if not exists moisture_handheld numeric;

-- Existing rows only carried a date. Pin them to 12:00 Europe/Oslo on that
-- date so the column is never NULL and never pretends to be more precise
-- than the record was. Rows written by the new Logg (source 'mobil-v2') carry
-- the real moment and are left alone.
update public.logs
   set logged_at = ((date + time '12:00') at time zone 'Europe/Oslo')
 where source is distinct from 'mobil-v2';

-- Every moisture value logged so far came from a handheld pin meter.
update public.logs
   set moisture_handheld = moisture
 where moisture_handheld is null and moisture is not null
   and source is distinct from 'mobil-v2';

-- Wedge 2 is physically removed. Inactive, not deleted: 122 log rows refer to it.
update public.systems set active = false where name = 'Wedge 2';

-- ── 4. Access: dash_app (the dashboard's role) + authenticated (phone app) ──
grant usage on schema public to dash_app;
grant select on public.systems to dash_app;
grant select, insert, update, delete on public.logs to dash_app;
grant select, insert, update, delete on public.sensor_readings to dash_app;
grant select, insert, update, delete on public.sensor_channels to dash_app;
grant select, insert, update, delete on public.sensor_readings to authenticated;
grant select, insert, update, delete on public.sensor_channels to authenticated;
do $$
declare s text;
begin
  s := pg_get_serial_sequence('public.sensor_readings', 'id');
  if s is not null then
    execute format('grant usage, select on sequence %s to dash_app', s);
    execute format('grant usage, select on sequence %s to authenticated', s);
  end if;
end $$;

alter table public.sensor_readings enable row level security;
alter table public.sensor_channels enable row level security;

-- Policies are created only when missing. Nothing here removes an existing
-- policy: the Supabase MCP stops to ask a human before any removal statement,
-- and no human is there when this runs.
do $$
begin
  perform 1 from pg_policies where schemaname = 'public' and tablename = 'sensor_readings' and policyname = 'sensor_readings viewable by authenticated';
  if not found then
    create policy "sensor_readings viewable by authenticated" on public.sensor_readings for select to authenticated using (true);
  end if;
  perform 1 from pg_policies where schemaname = 'public' and tablename = 'sensor_readings' and policyname = 'sensor_readings writable by authenticated';
  if not found then
    create policy "sensor_readings writable by authenticated" on public.sensor_readings for all to authenticated using (true) with check (true);
  end if;
  perform 1 from pg_policies where schemaname = 'public' and tablename = 'sensor_readings' and policyname = 'sensor_readings all by dash_app';
  if not found then
    create policy "sensor_readings all by dash_app" on public.sensor_readings for all to dash_app using (true) with check (true);
  end if;
  perform 1 from pg_policies where schemaname = 'public' and tablename = 'sensor_channels' and policyname = 'sensor_channels viewable by authenticated';
  if not found then
    create policy "sensor_channels viewable by authenticated" on public.sensor_channels for select to authenticated using (true);
  end if;
  perform 1 from pg_policies where schemaname = 'public' and tablename = 'sensor_channels' and policyname = 'sensor_channels writable by authenticated';
  if not found then
    create policy "sensor_channels writable by authenticated" on public.sensor_channels for all to authenticated using (true) with check (true);
  end if;
  perform 1 from pg_policies where schemaname = 'public' and tablename = 'sensor_channels' and policyname = 'sensor_channels all by dash_app';
  if not found then
    create policy "sensor_channels all by dash_app" on public.sensor_channels for all to dash_app using (true) with check (true);
  end if;
  -- public.logs / public.systems already have RLS on with authenticated/anon
  -- policies keyed off auth.role(); a direct Postgres connection carries no
  -- JWT, so dash_app needs its own policy to read and write the manual log.
  perform 1 from pg_policies where schemaname = 'public' and tablename = 'logs' and policyname = 'logs all by dash_app';
  if not found then
    create policy "logs all by dash_app" on public.logs for all to dash_app using (true) with check (true);
  end if;
  perform 1 from pg_policies where schemaname = 'public' and tablename = 'systems' and policyname = 'systems readable by dash_app';
  if not found then
    create policy "systems readable by dash_app" on public.systems for select to dash_app using (true);
  end if;
end $$;
