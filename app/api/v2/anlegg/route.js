import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";
import { config, latestPerChannel, NOT_CONFIGURED } from "@/lib/ecowitt";
import { listSystems, listChannels, channelTitle, hourlyGrid, readingOut, n } from "@/lib/v2";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

// Everything the Anlegg page paints, in one round trip:
//  - one card per active system (public.systems, sort_order), joined to its
//    channel (sensor_channels role 'bed'), the newest reading, a 7-day hourly
//    temperature line and the last manual pH from public.logs
//  - extra cards for the hygienisering channel and for channels nobody has
//    assigned yet, so a live sensor is never invisible
//  - the room line from channel 0
export const GET = guarded(async () => {
  const sql = db();
  const now = new Date();
  const sparkFrom = new Date(now.getTime() - 7 * 86400e3);

  const systems = await listSystems(sql);
  const channels = await listChannels(sql);
  const latest = await latestPerChannel(sql);
  const spark = await sql`select channel, date_trunc('hour', ts) as t, avg(soil_temp_c) as v
    from public.sensor_readings
    where channel > 0 and ts >= ${sparkFrom} and soil_temp_c is not null
    group by 1, 2 order by 1, 2`;
  const ph = await sql`select distinct on (system) system, ph, logged_at, date, source, created_by
    from public.logs where ph is not null
    order by system, logged_at desc nulls last, created_at desc`;
  const [{ total }] = await sql`select count(*)::int as total from public.sensor_readings`;

  const latestBy = new Map(latest.map((r) => [r.channel, r]));
  const sparkBy = new Map();
  for (const r of spark) {
    if (!sparkBy.has(r.channel)) sparkBy.set(r.channel, []);
    sparkBy.get(r.channel).push(r);
  }
  const phBy = new Map(ph.map((r) => [r.system, r]));
  const bedChannels = channels.filter((c) => c.role === "bed" && c.system_id);

  const cardFor = (ch) => {
    const r = ch ? readingOut(latestBy.get(ch.channel)) : null;
    return {
      channel: ch ? ch.channel : null,
      label: ch ? ch.label : null,
      temp: r ? r.temp : null,
      ec: r ? r.ec : null,
      moisture: r ? r.moisture : null,
      ts: r ? r.ts : null,
      spark: ch ? hourlyGrid(sparkBy.get(ch.channel) || [], sparkFrom, now, "v") : [],
    };
  };

  const cards = systems.map((s) => {
    const ch = bedChannels.find((c) => c.system_id === s.id) || null;
    const p = phBy.get(s.name);
    return {
      key: s.id,
      kind: "system",
      name: s.name,
      category: s.category,
      ...cardFor(ch),
      ph: p ? { value: n(p.ph), at: p.logged_at, date: p.date, source: p.source } : null,
    };
  });
  for (const ch of channels) {
    if (ch.role === "hygiene") cards.push({ key: "kanal-" + ch.channel, kind: "hygiene", name: channelTitle(ch), category: null, ...cardFor(ch), ph: null });
  }
  for (const ch of channels) {
    if (ch.role === "unassigned" && ch.channel > 0) {
      cards.push({ key: "kanal-" + ch.channel, kind: "unassigned", name: channelTitle(ch), category: null, ...cardFor(ch), ph: null });
    }
  }
  // A channel that reports but has no row in sensor_channels at all (e.g. a
  // new sensor paired later) is shown too, as unassigned.
  for (const r of latest) {
    if (r.channel > 0 && !channels.some((c) => c.channel === r.channel)) {
      cards.push({ key: "kanal-" + r.channel, kind: "unassigned", name: "CH" + r.channel + " (ikke tildelt)", category: null, ...cardFor({ channel: r.channel, label: null }), ph: null });
    }
  }

  const room = readingOut(latestBy.get(0));
  const newest = latest.reduce((m, r) => (!m || new Date(r.ts) > new Date(m) ? r.ts : m), null);
  const cfg = config();

  return json({
    configured: cfg.configured,
    message: cfg.configured ? null : NOT_CONFIGURED,
    has_readings: total > 0,
    server_time: now.toISOString(),
    updated_at: newest,
    room: room ? { temp: room.indoor_temp, rh: room.indoor_rh, pressure: room.pressure, ts: room.ts } : null,
    cards,
  });
});
