// Everything the public status page shows, in one place. Read-only, the
// same tables and the same §19 code as the dashboard; nothing is retyped.
//
// Before reading, the station is asked for fresh values (lib/ecowitt's
// refreshRealtime, cached five minutes), so "silent" on this page means
// the probe has not reported, not that nobody opened the dashboard. The
// result is kept for a minute per instance so a bot cannot make every hit
// a round of queries.
import { listSystems, listChannels, readingOut, channelTitle } from "./v2.js";
import { latestPerChannel, config, refreshRealtime } from "./ecowitt.js";
import { newestRecord } from "./hygiene-record.js";
import { isoDateOslo, addDaysIso } from "./time.js";
import { bedCurves, logCurves, rangeDays, RANGES } from "./curves.js";

// A probe that has not reported for this long is shown as silent, not as
// an old number.
export const STALE_MS = 2 * 3600e3;
// The log-discipline window: five weeks, like the monthly documentation
// check, counted up to yesterday; today is not over.
export const LOG_DAYS = 35;
const CACHE_MS = 60 * 1000;

const n = (v) => (v == null ? null : Number(v));
let memo = { at: 0, data: null };
const curveMemo = new Map();

// The chart the visitor picked: the Brief's buttons, as query parameters.
// Anything unknown falls back to the default, never to an error.
export function chartChoice(sp) {
  const range = RANGES.includes(sp && sp.range) ? sp.range : "30D";
  const source = sp && sp.source === "manuell" ? "manuell" : "sensor";
  let metric = ["temp", "ph", "fukt"].includes(sp && sp.metric) ? sp.metric : "temp";
  // pH has no probe; a sensor view of it falls back to the manual log.
  if (metric === "ph" && source === "sensor") return { range, source: "manuell", metric };
  return { range, source, metric };
}

export async function chartData(sql, choice, systems) {
  const key = choice.range + ":" + choice.source + ":" + choice.metric;
  const hit = curveMemo.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const days = rangeDays(choice.range);
  const data = choice.source === "sensor"
    ? await bedCurves(sql, { days, metric: choice.metric })
    : await logCurves(sql, { days, metric: choice.metric, systems });
  curveMemo.set(key, { at: Date.now(), data });
  return data;
}

export async function statusPayload(sql) {
  if (memo.data && Date.now() - memo.at < CACHE_MS) return memo.data;
  const cfg = config();
  if (cfg.configured) await refreshRealtime(sql, cfg);
  const data = await build(sql);
  memo = { at: Date.now(), data };
  return data;
}

async function build(sql) {
  const now = new Date();
  const today = isoDateOslo(now);
  const yesterday = addDaysIso(today, -1);
  const since = addDaysIso(yesterday, -(LOG_DAYS - 1));
  const systems = await listSystems(sql);
  const channels = await listChannels(sql);
  const latest = (await latestPerChannel(sql)).map(readingOut);
  const targets = Object.fromEntries((await sql`select metric, min, max from dash.targets`).map((t) => [t.metric, { min: n(t.min), max: n(t.max) }]));
  const ph = await sql`select distinct on (system) system, ph, date
    from dash.readings_all where ph is not null and date >= ${since} and date <= ${today}
    order by system, date desc`;
  // Days logged: Monday–Saturday, up to yesterday. The rest of the row
  // counts everything in the window, Sundays and today included.
  const logg = await sql`select system,
      count(distinct date) filter (where extract(dow from date::date) <> 0 and date <= ${yesterday})::int as days,
      coalesce(sum(for_l), 0)::float8 as liters,
      count(*) filter (where avvik = 1)::int as avvik, max(date) as last
    from dash.readings_all where date >= ${since} and date <= ${today} group by system`;
  const hyg = await newestRecord(sql);

  const latestBy = new Map(latest.map((r) => [r.channel, r]));
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
      logg: { days: l ? l.days : 0, liters: l ? l.liters : 0, avvik: l ? l.avvik : 0, last: l ? l.last : null },
    };
  });

  const room = latestBy.get(0) || null;
  const hygieneProbes = channels
    .filter((c) => c.role === "hygiene")
    .map((c) => ({ channel: c.channel, name: channelTitle(c), reading: latestBy.get(c.channel) || null, stale: stale(latestBy.get(c.channel)) }));
  const bedTs = beds.filter((b) => b.ts).map((b) => new Date(b.ts).getTime());
  const bedsLast = bedTs.length ? new Date(Math.max(...bedTs)).toISOString() : null;

  return {
    generated_at: now.toISOString(),
    beds_last_ts: bedsLast,
    beds_stale: !bedsLast || now.getTime() - new Date(bedsLast).getTime() > STALE_MS,
    targets,
    beds,
    room: room ? { temp: room.indoor_temp, rh: room.indoor_rh, ts: room.ts, stale: stale(room) } : null,
    hygieneProbes,
    logg: { from: since, to: yesterday, days: LOG_DAYS, working_days: workingDays(since, yesterday) },
    hygiene: hyg,
  };
}

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
