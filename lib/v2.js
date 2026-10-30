// Shared server helpers for the v1 dashboard API (app/api/v2/*).
//
// Rules inherited from the rest of the app: queries run one after another
// (concurrent queries on one pooled connection wedge Supavisor), numeric
// columns arrive as strings from postgres.js and are turned into numbers
// here, and nothing fabricates a 0 for a missing measurement.

import { DATE_ONLY, dayStart, addDaysIso, todayOslo, isoDateOslo } from "./time.js";

export const HYGIENE_LABEL = "Hygienisering (prekompost)";

// The sensors started reporting 15 Sep 2026; the first manual log is from
// 7 Jul 2025. The Data page's "alt" preset reaches back to that first log.
export const SENSOR_START = "2026-09-15";
export const FIRST_LOG = "2025-07-07";
export const MAX_RANGE_DAYS = 400;

// Range from a query string: ISO dates, from ≤ to, to no later than today,
// and at most MAX_RANGE_DAYS long — except that the lower bound may always
// reach the first log, so "alt" keeps showing every log there is.
// Returns { from, to, query: { from, to } } or { error }.
export function parseRange(sp) {
  const rawFrom = sp.get("from") || SENSOR_START;
  const rawTo = sp.get("to") || todayOslo();
  if (!DATE_ONLY.test(rawFrom) || !DATE_ONLY.test(rawTo)) return { error: "Datoene må være på formen ÅÅÅÅ-MM-DD." };
  // A month 13 or a 30 Feb rolls over instead of failing; the round trip catches it.
  if (isoDateOslo(dayStart(rawFrom)) !== rawFrom || isoDateOslo(dayStart(rawTo)) !== rawTo) return { error: "Ugyldig dato." };
  if (rawFrom > rawTo) return { error: "Fra-datoen må være før Til-datoen." };
  const today = todayOslo();
  const to = rawTo > today ? today : rawTo;
  const cap = addDaysIso(to, -MAX_RANGE_DAYS);
  const floor = cap < FIRST_LOG ? cap : FIRST_LOG;
  let from = rawFrom < floor ? floor : rawFrom;
  if (from > to) from = to;
  return { from, to, query: { from: rawFrom, to: rawTo } };
}
export const ROOM_LABEL = "Rom (GW1200)";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const n = (v) => (v === null || v === undefined ? null : Number(v));

export async function listSystems(sql, { activeOnly = true } = {}) {
  const rows = activeOnly
    ? await sql`select id, name, category, sort_order, active from public.systems where active order by sort_order, name`
    : await sql`select id, name, category, sort_order, active from public.systems order by sort_order, name`;
  return rows;
}

export async function listChannels(sql) {
  return sql`select c.channel, c.system_id, c.label, c.role, c.updated_at, s.name as system_name, s.active as system_active
    from public.sensor_channels c
    left join public.systems s on s.id = c.system_id
    order by c.channel`;
}

export function channelTitle(ch) {
  if (!ch) return null;
  if (ch.role === "bed" && ch.system_name) return ch.system_name;
  if (ch.role === "hygiene") return ch.label || HYGIENE_LABEL;
  if (ch.role === "room") return ROOM_LABEL;
  // A probe not placed in a bed but given a name (e.g. "Testsonde") is shown
  // by that name; only a nameless one reads as not assigned.
  return ch.label ? ch.label + " · CH" + ch.channel : "CH" + ch.channel + " (ikke tildelt)";
}

// Chart resolution for a time span: fine enough to see, coarse enough to
// read on a phone. Minutes per bucket.
export function bucketMinutes(from, to) {
  const days = (to.getTime() - from.getTime()) / 86400e3;
  if (days <= 2) return 30;
  if (days <= 10) return 60;
  if (days <= 50) return 180;
  if (days <= 200) return 720;
  return 1440;
}

// Bucketed averages for one channel: rows {t, temp, ec, moisture}.
// Buckets start at `from` (whole seconds) and step by `minutes`, so a range
// that begins at an Oslo midnight gets buckets that begin there too. Day
// buckets are Oslo calendar days, whatever the DST offset that day.
const DAY = 1440;
const anchorSec = (d) => Math.floor(d.getTime() / 1000);

export async function bucketRows(sql, channel, from, to, minutes) {
  if (minutes >= DAY) {
    return sql`select (date_trunc('day', ts at time zone 'Europe/Oslo') at time zone 'Europe/Oslo') as t,
        avg(soil_temp_c) as temp, avg(ec_us_cm) as ec, avg(soil_moisture_vol_pct) as moisture
      from public.sensor_readings
      where channel = ${channel} and ts >= ${from} and ts <= ${to}
      group by 1 order by 1`;
  }
  const step = minutes * 60;
  const base = anchorSec(from);
  return sql`select to_timestamp(floor((extract(epoch from ts) - ${base}) / ${step}) * ${step} + ${base}) as t,
      avg(soil_temp_c) as temp, avg(ec_us_cm) as ec, avg(soil_moisture_vol_pct) as moisture
    from public.sensor_readings
    where channel = ${channel} and ts >= ${from} and ts <= ${to}
    group by 1 order by 1`;
}

// Rows {t, <field>} → a full grid between from and to at the bucket size,
// with null where no sample exists, so a quiet sensor shows a gap, not a slope.
export function bucketGrid(rows, from, to, field, minutes = 60) {
  const by = new Map();
  for (const r of rows) by.set(new Date(r.t).getTime(), n(r[field]));
  const pick = (t) => {
    const v = by.get(t);
    return v == null || Number.isNaN(v) ? null : v;
  };
  const out = [];
  const end = to.getTime();
  if (minutes >= DAY) {
    let iso = isoDateOslo(from);
    for (let i = 0; i < 100000; i++) {
      const t = dayStart(iso).getTime();
      if (t > end) break;
      out.push({ t, v: pick(t) });
      iso = addDaysIso(iso, 1);
    }
    return out;
  }
  const S = minutes * 60e3;
  for (let t = anchorSec(from) * 1000; t <= end; t += S) out.push({ t, v: pick(t) });
  return out;
}

// Kept for the 7-day sparkline.
export const hourlyGrid = (rows, from, to, field) => bucketGrid(rows, from, to, field, 60);

export function readingOut(r) {
  if (!r) return null;
  return {
    channel: r.channel,
    ts: r.ts,
    temp: n(r.soil_temp_c),
    ec: n(r.ec_us_cm),
    moisture: n(r.soil_moisture_vol_pct),
    indoor_temp: n(r.indoor_temp_c),
    indoor_rh: n(r.indoor_rh_pct),
    pressure: n(r.pressure_hpa),
    source: r.source,
  };
}

export function logOut(l) {
  return {
    id: l.id,
    system: l.system,
    date: typeof l.date === "string" ? l.date.slice(0, 10) : l.date instanceof Date ? l.date.toISOString().slice(0, 10) : l.date,
    logged_at: l.logged_at,
    created_at: l.created_at,
    temperature: n(l.temperature),
    ph: n(l.ph),
    moisture_handheld: n(l.moisture_handheld ?? l.moisture),
    feed_liters: n(l.feed_amount_liters),
    harvest_liters: n(l.harvest_liters),
    notes: l.notes || "",
    created_by: l.created_by || "",
    source: l.source || "",
  };
}
