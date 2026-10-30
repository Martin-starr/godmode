-- 015: Center 374 import fixes (30 Oct 2026).
--
-- 1. dash.hygiene_readings.excluded — a reason a reading must not count in
--    the §19 check, set at import time. Readings are never deleted: the raw
--    record stays, the reason says why it was set aside. Implausible values
--    (spikes, a probe out of the mass) are screened at evaluation time in
--    lib/hygiene.js and need no column.
--
-- 2. Repair of import 3 (27sept.CH4.TXT), imported 28 Sep with the old parser:
--    a) The logger clock is Oslo local time but was stored as if UTC, so every
--       reading sat two hours late. Re-read as Oslo wall-clock time.
--    b) The old parser dropped unreadable cells and slid the next channel's
--       value into the empty slot. Minutes where fewer than three channels
--       were stored cannot be trusted channel by channel, so they are set
--       aside (35 minutes on 26–27 Sep).
--    Guarded by the import note so a second run changes nothing.

alter table dash.hygiene_readings add column if not exists excluded text;

do $$
begin
  if exists (select 1 from dash.hygiene_imports where id = 3 and coalesce(note, '') not like '%015%') then
    update dash.hygiene_readings
       set excluded = 'kanalrekkefølge usikker (gammel import)'
     where import_id = 3
       and ts in (select ts from dash.hygiene_readings where import_id = 3 group by ts having count(*) < 3);

    update dash.hygiene_readings
       set ts = (ts at time zone 'UTC') at time zone 'Europe/Oslo'
     where import_id = 3;

    update dash.hygiene_imports
       set note = trim(coalesce(note, '') || ' 015: tid lest om til norsk tid; minutter med usikker kanalrekkefølge satt til side.')
     where id = 3;
  end if;
end $$;
