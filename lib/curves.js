// The curves behind the Brief's chart and the public status page: one
// averaged sensor series per bed, or one manual-log series per system,
// for a period picked by the same buttons (7D … ALL).
import { SENSOR_START, FIRST_LOG } from "./v2.js";
import { dayStart, isoDateOslo, addDaysIso } from "./time.js";

export const RANGES = ["7D", "14D", "30D", "60D", "YTD", "ALL"];
export const RANGE_LABEL = { "7D": "siste 7 dager", "14D": "siste 14 dager", "30D": "siste 30 dager", "60D": "siste 60 dager", YTD: "i år", ALL: "hele historikken" };

export function rangeDays(range) {
  if (range === "7D") return 7;
  if (range === "14D") return 14;
  if (range === "30D") return 30;
  if (range === "60D") return 60;
  if (range === "YTD") {
    const today = isoDateOslo();
    return Math.max(7, Math.round((Date.parse(today) - Date.parse(today.slice(0, 4) + "-01-01")) / 86400e3) + 1);
  }
  // ALL is the last year, as on the Brief; the sensor curve floors itself at
  // SENSOR_START anyway.
  return 365;
}

const SENSOR_COLS = { temp: "soil_temp_c", fukt: "soil_moisture_vol_pct", ec: "ec_us_cm" };

// Sensor curves per bed. Hours for a fortnight, quarter-days up to two
// months, Oslo calendar days beyond that; the bucket size follows the span
// actually shown (after the floor at SENSOR_START), so "alt" is never
// coarser than "60 d" for the same weeks of data.
export async function bedCurves(sql, { days, metric }) {
  const col = SENSOR_COLS[metric];
  if (!col) throw new Error("Ugyldig måling.");
  const now = new Date();
  const floor = dayStart(SENSOR_START);
  let from = new Date(now.getTime() - days * 86400e3);
  if (from < floor) from = floor;
  const spanDays = (now.getTime() - from.getTime()) / 86400e3;
  const minutes = spanDays <= 14 ? 60 : spanDays <= 60 ? 360 : 1440;
  const c = sql(col);
  const rows = minutes === 1440
    ? await sql`select s.name, extract(epoch from ((r.ts at time zone 'Europe/Oslo')::date::timestamp at time zone 'Europe/Oslo')) * 1000 as t,
          avg(r.${c})::float8 as v
        from public.sensor_readings r
        join public.sensor_channels c on c.channel = r.channel and c.role = 'bed'
        join public.systems s on s.id = c.system_id
        where r.ts >= ${from} and r.${c} is not null
        group by 1, 2 order by 1, 2`
    : await sql`select s.name, floor(extract(epoch from r.ts) / ${minutes * 60}) * ${minutes * 60000} as t,
          avg(r.${c})::float8 as v
        from public.sensor_readings r
        join public.sensor_channels c on c.channel = r.channel and c.role = 'bed'
        join public.systems s on s.id = c.system_id
        where r.ts >= ${from} and r.${c} is not null
        group by 1, 2 order by 1, 2`;
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.name)) by.set(r.name, []);
    by.get(r.name).push([Number(r.t), Math.round(Number(r.v) * 10) / 10]);
  }
  return { from: from.getTime(), to: now.getTime(), bucketMinutes: minutes, series: [...by.entries()].map(([name, points]) => ({ name, points })) };
}

const LOG_COLS = { temp: "temp", ph: "ph", fukt: "fukt" };

// Manual-log curves per system: one point per logged day, at noon Oslo.
export async function logCurves(sql, { days, metric, systems }) {
  const col = LOG_COLS[metric];
  if (!col) throw new Error("Ugyldig måling.");
  const today = isoDateOslo();
  let since = addDaysIso(today, -(days - 1));
  if (since < FIRST_LOG) since = FIRST_LOG;
  const c = sql(col);
  const rows = await sql`select system, date, avg(${c})::float8 as v
    from dash.readings_all
    where ${c} is not null and date >= ${since} and date <= ${today} and system = any(${systems})
    group by 1, 2 order by 1, 2`;
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.system)) by.set(r.system, []);
    by.get(r.system).push([dayStart(r.date).getTime() + 12 * 3600e3, Math.round(Number(r.v) * 10) / 10]);
  }
  return {
    from: dayStart(since).getTime(),
    // Today's point sits at noon; before noon the axis still reaches it.
    to: Math.max(Date.now(), dayStart(today).getTime() + 12 * 3600e3),
    bucketMinutes: 1440,
    series: systems.filter((s) => by.has(s)).map((name) => ({ name, points: by.get(name) })),
  };
}
