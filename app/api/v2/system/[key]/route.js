import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { listChannels, channelTitle, bucketMinutes, bucketRows, bucketGrid, readingOut, logOut, UUID } from "@/lib/v2";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

const WEEKS = 6;

// Detail for one card: six weeks of hourly temp / EC / moisture for the
// channel behind it, plus the manual log for the system (newest first).
// key = a public.systems id, or "kanal-N" for a channel without a system
// (the hygienisering tank, an unassigned sensor).
export const GET = guarded(async (req, { params }) => {
  const key = String(params.key || "");
  const sql = db();
  const channels = await listChannels(sql);

  let system = null;
  let channel = null;
  let title;
  if (UUID.test(key)) {
    const rows = await sql`select id, name, category, active from public.systems where id = ${key}`;
    if (!rows.length) return err("Fant ikke systemet.", 404);
    system = rows[0];
    channel = channels.find((c) => c.role === "bed" && c.system_id === system.id) || null;
    title = system.name;
  } else {
    const m = key.match(/^kanal-(\d{1,2})$/);
    if (!m) return err("Ugyldig nøkkel.", 400);
    const num = Number(m[1]);
    channel = channels.find((c) => c.channel === num) || { channel: num, role: "unassigned", label: null };
    if (channel.role === "bed" && channel.system_id) {
      const rows = await sql`select id, name, category, active from public.systems where id = ${channel.system_id}`;
      system = rows[0] || null;
    }
    title = channelTitle(channel);
  }

  const now = new Date();
  const from = new Date(now.getTime() - WEEKS * 7 * 86400e3);
  let series = null;
  let latest = null;
  if (channel) {
    const minutes = bucketMinutes(from, now);
    const rows = await bucketRows(sql, channel.channel, from, now, minutes);
    series = {
      from: from.toISOString(),
      to: now.toISOString(),
      minutes,
      temp: bucketGrid(rows, from, now, "temp", minutes),
      ec: bucketGrid(rows, from, now, "ec", minutes),
      moisture: bucketGrid(rows, from, now, "moisture", minutes),
    };
    const l = await sql`select channel, ts, soil_temp_c, soil_moisture_vol_pct, ec_us_cm, indoor_temp_c, indoor_rh_pct, pressure_hpa, source
      from public.sensor_readings where channel = ${channel.channel} order by ts desc limit 1`;
    latest = readingOut(l[0]);
  }

  let logs = [];
  if (system) {
    const rows = await sql`select id, system, date, logged_at, created_at, temperature, ph, moisture, moisture_handheld,
        feed_amount_liters, harvest_liters, notes, created_by, source
      from public.logs where system = ${system.name}
      order by logged_at desc nulls last, date desc, created_at desc
      limit 200`;
    logs = rows.map(logOut);
  }

  return json({
    key,
    title,
    kind: system ? "system" : channel && channel.role === "hygiene" ? "hygiene" : "unassigned",
    system: system ? { id: system.id, name: system.name, category: system.category, active: system.active } : null,
    channel: channel ? channel.channel : null,
    label: channel ? channel.label : null,
    latest,
    series,
    logs,
  });
});
