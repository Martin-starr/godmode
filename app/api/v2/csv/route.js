import { db } from "@/lib/db";
import { err, guarded } from "@/lib/http";
import { listChannels, UUID, parseRange } from "@/lib/v2";
import { dayStart, dayEnd } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

import { num, utc, line, csvResponse, sensorLines } from "@/lib/csv";

const SEP = ";";
const LOG_HEAD = ["id", "system", "date", "temperature", "moisture", "ph", "notes", "created_by", "created_at",
  "feed_amount_liters", "source", "logged_at", "harvest_liters", "moisture_handheld", "created_at_utc", "logged_at_utc"];

// GET /api/v2/csv?kind=sensor|logg&from&to[&system=<uuid>|kanal-N]
//   sensor: raw readings (not bucketed) for channels ≥ 1, ts in Europe/Oslo
//   logg:   every column of public.logs in table order
export const GET = guarded(async (req) => {
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind");
  if (kind !== "sensor" && kind !== "logg") return err("kind må være sensor eller logg.", 400);
  const range = parseRange(sp);
  if (range.error) return err(range.error, 400);
  const { from, to } = range;
  const systemKey = sp.get("system") || "all";
  if (systemKey !== "all" && !UUID.test(systemKey) && !/^kanal-\d{1,2}$/.test(systemKey)) return err("Ugyldig system.", 400);

  const sql = db();
  const start = dayStart(from);
  const end = dayEnd(to);
  const channels = await listChannels(sql);

  // One system → its channel (for sensor rows) and its name (for log rows).
  // null = no filter; "" / -1 = a selection that matches nothing.
  let onlyChannel = null;
  let onlyName = null;
  if (UUID.test(systemKey)) {
    const rows = await sql`select name from public.systems where id = ${systemKey}`;
    if (!rows.length) return err("Fant ikke systemet.", 404);
    onlyName = rows[0].name;
    const ch = channels.find((c) => c.role === "bed" && c.system_id === systemKey);
    onlyChannel = ch ? ch.channel : -1;
  } else if (systemKey !== "all") {
    onlyChannel = Number(systemKey.slice(6));
    const ch = channels.find((c) => c.channel === onlyChannel);
    onlyName = ch && ch.role === "bed" && ch.system_name ? ch.system_name : "";
  }

  if (kind === "sensor") {
    const chFilter = onlyChannel === null ? sql`` : sql`and channel = ${onlyChannel}`;
    const rows = await sql`select ts, channel, soil_temp_c, soil_moisture_vol_pct, ec_us_cm
      from public.sensor_readings
      where channel >= 1 and ts >= ${start} and ts <= ${end} ${chFilter}
      order by ts, channel`;
    return csvResponse(`verminord_sensor_${from}_${to}.csv`, sensorLines(rows, channels));
  }

  const lines = [LOG_HEAD.join(SEP)];
  if (onlyName !== "") {
    const nameFilter = onlyName === null ? sql`` : sql`and system = ${onlyName}`;
    const rows = await sql`select id, system, date::text as date, temperature, moisture, ph, notes, created_by, created_at,
        feed_amount_liters, source, logged_at, harvest_liters, moisture_handheld
      from public.logs
      where date >= ${from} and date <= ${to} ${nameFilter}
      order by date, logged_at nulls last, created_at`;
    for (const r of rows) {
      lines.push(line([r.id, r.system, r.date, num(r.temperature), num(r.moisture), num(r.ph), r.notes, r.created_by, r.created_at,
        num(r.feed_amount_liters), r.source, r.logged_at, num(r.harvest_liters), num(r.moisture_handheld), utc(r.created_at), utc(r.logged_at)]));
    }
  }
  return csvResponse(`verminord_logg_${from}_${to}.csv`, lines);
});
