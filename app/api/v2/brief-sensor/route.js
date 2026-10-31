import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { SENSOR_START } from "@/lib/v2";
import { dayStart } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

// Sensor curves for the desktop Brief's "Sensor" mode: one averaged series
// per bed (sensor_channels role 'bed'), bucketed so a line never carries
// more than a few hundred points. Hours for a fortnight, quarter-days up to
// two months, Oslo calendar days beyond that.
const COLS = { temp: "soil_temp_c", fukt: "soil_moisture_vol_pct" };

export const GET = guarded(async (req) => {
  const sp = new URL(req.url).searchParams;
  const metric = sp.get("metric") || "temp";
  if (!COLS[metric]) return err("Ugyldig måling.", 400);
  const days = Math.round(Number(sp.get("days")));
  if (!Number.isFinite(days) || days < 1 || days > 800) return err("Ugyldig periode.", 400);

  const now = new Date();
  const floor = dayStart(SENSOR_START);
  let from = new Date(now.getTime() - days * 86400e3);
  if (from < floor) from = floor;
  // Bucket size from the span actually shown (after the floor), so "alt"
  // is never coarser than "60 d" for the same weeks of data.
  const spanDays = (now.getTime() - from.getTime()) / 86400e3;
  const minutes = spanDays <= 14 ? 60 : spanDays <= 60 ? 360 : 1440;

  const sql = db();
  const col = sql(COLS[metric]);
  const rows = minutes === 1440
    ? await sql`select s.name, extract(epoch from ((r.ts at time zone 'Europe/Oslo')::date::timestamp at time zone 'Europe/Oslo')) * 1000 as t,
          avg(r.${col})::float8 as v
        from public.sensor_readings r
        join public.sensor_channels c on c.channel = r.channel and c.role = 'bed'
        join public.systems s on s.id = c.system_id
        where r.ts >= ${from} and r.${col} is not null
        group by 1, 2 order by 1, 2`
    : await sql`select s.name, floor(extract(epoch from r.ts) / ${minutes * 60}) * ${minutes * 60000} as t,
          avg(r.${col})::float8 as v
        from public.sensor_readings r
        join public.sensor_channels c on c.channel = r.channel and c.role = 'bed'
        join public.systems s on s.id = c.system_id
        where r.ts >= ${from} and r.${col} is not null
        group by 1, 2 order by 1, 2`;

  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.name)) by.set(r.name, []);
    by.get(r.name).push([Number(r.t), Math.round(Number(r.v) * 10) / 10]);
  }
  return json({
    from: from.getTime(),
    to: now.getTime(),
    bucketMinutes: minutes,
    series: [...by.entries()].map(([name, points]) => ({ name, points })),
  });
});
