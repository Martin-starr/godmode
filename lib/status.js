// Everything the public status page shows, in one place. Read-only, the
// same tables and the same §19 code as the dashboard; nothing is retyped.
import { listSystems, listChannels, readingOut, channelTitle } from "./v2.js";
import { latestPerChannel } from "./ecowitt.js";
import { newestRecord } from "./hygiene-record.js";
import { isoDateOslo, addDaysIso } from "./time.js";

// A probe that has not reported for this long is shown as silent, not as
// an old number.
export const STALE_MS = 2 * 3600e3;
// The log-discipline window: five weeks, like the monthly documentation check.
export const LOG_DAYS = 35;
export const CURVE_DAYS = 7;

const n = (v) => (v == null ? null : Number(v));

// Working days (Monday–Saturday) in the window, the days a log is expected.
function workingDays(from, to) {
  let d = from;
  let count = 0;
  while (d <= to) {
    if (new Date(d + "T12:00:00Z").getUTCDay() !== 0) count++;
    d = addDaysIso(d, 1);
  }
  return count;
}

export async function statusPayload(sql) {
  const now = new Date();
  const today = isoDateOslo(now);
  const systems = await listSystems(sql);
  const channels = await listChannels(sql);
  const latest = (await latestPerChannel(sql)).map(readingOut);
  const targets = Object.fromEntries((await sql`select metric, min, max from dash.targets`).map((t) => [t.metric, { min: n(t.min), max: n(t.max) }]));
  const ph = await sql`select distinct on (system) system, ph, date
    from dash.readings_all where ph is not null order by system, date desc`;
  const curveFrom = new Date(Math.floor((now.getTime() - CURVE_DAYS * 86400e3) / 3600e3) * 3600e3);
  const curve = await sql`select channel, date_trunc('hour', ts) as t, avg(soil_temp_c)::float8 as v
    from public.sensor_readings
    where channel >= 1 and ts >= ${curveFrom} and soil_temp_c is not null
    group by 1, 2 order by 1, 2`;
  const since = addDaysIso(today, -(LOG_DAYS - 1));
  const logg = await sql`select system, count(distinct date)::int as days, coalesce(sum(for_l), 0)::float8 as liters,
      count(*) filter (where avvik = 1)::int as avvik, max(date) as last
    from dash.readings_all where date >= ${since} group by system`;
  const [{ last_ts }] = await sql`select max(ts) as last_ts from public.sensor_readings where channel >= 1`;
  const hyg = await newestRecord(sql);

  const latestBy = new Map(latest.map((r) => [r.channel, r]));
  const curveBy = new Map();
  for (const r of curve) {
    if (!curveBy.has(r.channel)) curveBy.set(r.channel, []);
    curveBy.get(r.channel).push([new Date(r.t).getTime(), Math.round(r.v * 10) / 10]);
  }
  const phBy = new Map(ph.map((r) => [r.system, r]));
  const loggBy = new Map(logg.map((r) => [r.system, r]));
  const stale = (r) => !r || now.getTime() - new Date(r.ts).getTime() > STALE_MS;

  const beds = systems.map((s) => {
    const ch = channels.find((c) => c.role === "bed" && c.system_id === s.id) || null;
    const r = ch ? latestBy.get(ch.channel) || null : null;
    const p = phBy.get(s.name) || null;
    const l = loggBy.get(s.name) || null;
    return {
      name: s.name,
      channel: ch ? ch.channel : null,
      temp: r ? r.temp : null,
      moisture: r ? r.moisture : null,
      ec: r ? r.ec : null,
      ts: r ? r.ts : null,
      stale: stale(r),
      ph: p ? { value: n(p.ph), date: p.date } : null,
      curve: ch ? curveBy.get(ch.channel) || [] : [],
      logg: { days: l ? l.days : 0, liters: l ? l.liters : 0, avvik: l ? l.avvik : 0, last: l ? l.last : null },
    };
  });

  const room = latestBy.get(0) || null;
  const hygieneProbes = channels
    .filter((c) => c.role === "hygiene")
    .map((c) => ({ channel: c.channel, name: channelTitle(c), reading: latestBy.get(c.channel) || null, stale: stale(latestBy.get(c.channel)) }));

  return {
    generated_at: now.toISOString(),
    sensors_last_ts: last_ts ? new Date(last_ts).toISOString() : null,
    sensors_stale: !last_ts || now.getTime() - new Date(last_ts).getTime() > STALE_MS,
    targets,
    beds,
    room: room ? { temp: room.indoor_temp, rh: room.indoor_rh, ts: room.ts, stale: stale(room) } : null,
    hygieneProbes,
    curve: { from: curveFrom.getTime(), to: now.getTime(), days: CURVE_DAYS },
    logg: { from: since, to: today, days: LOG_DAYS, working_days: workingDays(since, today) },
    hygiene: hyg,
  };
}
