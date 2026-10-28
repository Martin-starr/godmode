// Shared server helpers for the v1 dashboard API (app/api/v2/*).
//
// Rules inherited from the rest of the app: queries run one after another
// (concurrent queries on one pooled connection wedge Supavisor), numeric
// columns arrive as strings from postgres.js and are turned into numbers
// here, and nothing fabricates a 0 for a missing measurement.

export const HYGIENE_LABEL = "Hygienisering (prekompost)";
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
  return "CH" + ch.channel + " (ikke tildelt)";
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
// Buckets are aligned to the epoch, so to_timestamp(floor(epoch/step)*step).
export async function bucketRows(sql, channel, from, to, minutes) {
  const step = minutes * 60;
  return sql`select to_timestamp(floor(extract(epoch from ts) / ${step}) * ${step}) as t,
      avg(soil_temp_c) as temp, avg(ec_us_cm) as ec, avg(soil_moisture_vol_pct) as moisture
    from public.sensor_readings
    where channel = ${channel} and ts >= ${from} and ts <= ${to}
    group by 1 order by 1`;
}

// Rows {t, <field>} → a full grid between from and to at the bucket size,
// with null where no sample exists, so a quiet sensor shows a gap, not a slope.
export function bucketGrid(rows, from, to, field, minutes = 60) {
  const S = minutes * 60e3;
  const start = Math.floor(from.getTime() / S) * S;
  const end = Math.floor(to.getTime() / S) * S;
  const by = new Map();
  for (const r of rows) by.set(new Date(r.t).getTime(), n(r[field]));
  const out = [];
  for (let t = start; t <= end; t += S) {
    const v = by.get(t);
    out.push({ t, v: v == null || Number.isNaN(v) ? null : v });
  }
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
