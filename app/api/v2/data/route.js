import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { config, NOT_CONFIGURED } from "@/lib/ecowitt";
import { listSystems, listChannels, HYGIENE_LABEL, bucketMinutes, bucketRows, bucketGrid, logOut, n, UUID, parseRange } from "@/lib/v2";
import { dayStart, dayEnd, addDaysIso } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

const LOG_CAP = 2000;

// Which series the selector offers: every channel ≥ 1 that is mapped (bed or
// hygiene), plus unmapped channels that actually reported in the range.
// Order: beds in systems.sort_order, then hygiene, then unassigned.
function seriesList(systems, channels, activeChannels) {
  const order = new Map(systems.map((s, i) => [s.id, i]));
  const beds = channels
    .filter((c) => c.channel >= 1 && c.role === "bed" && c.system_id && c.system_name)
    .sort((a, b) => (order.get(a.system_id) ?? 999) - (order.get(b.system_id) ?? 999) || a.channel - b.channel)
    .map((c) => ({ key: c.system_id, name: c.system_name, channel: c.channel, kind: "bed" }));
  const hygiene = channels
    .filter((c) => c.channel >= 1 && c.role === "hygiene")
    .map((c) => ({ key: "kanal-" + c.channel, name: c.label || HYGIENE_LABEL, channel: c.channel, kind: "hygiene" }));
  const known = new Set(channels.map((c) => c.channel));
  const unassigned = [];
  for (const c of channels) {
    if (c.channel >= 1 && c.role === "unassigned" && activeChannels.has(c.channel)) {
      unassigned.push({ key: "kanal-" + c.channel, name: "CH" + c.channel + " (ikke tildelt)", channel: c.channel, kind: "unassigned" });
    }
  }
  for (const ch of [...activeChannels].sort((a, b) => a - b)) {
    if (ch >= 1 && !known.has(ch)) unassigned.push({ key: "kanal-" + ch, name: "CH" + ch + " (ikke tildelt)", channel: ch, kind: "unassigned" });
  }
  return [...beds, ...hygiene, ...unassigned];
}

// Everything the Data page paints for one range, in one round trip:
// bucketed temp / EC / moisture per series, the manual log rows, feeding
// per ISO week, and whether any of the rows came from a handheld pin meter.
export const GET = guarded(async (req) => {
  const sp = new URL(req.url).searchParams;
  const range = parseRange(sp);
  if (range.error) return err(range.error, 400);
  const { from, to } = range;
  const systemKey = sp.get("system") || "all";
  if (systemKey !== "all" && !UUID.test(systemKey) && !/^kanal-\d{1,2}$/.test(systemKey)) return err("Ugyldig system.", 400);

  const sql = db();
  const start = dayStart(from);
  const end = dayEnd(to);

  const systems = await listSystems(sql, { activeOnly: false });
  const channels = await listChannels(sql);
  const active = await sql`select distinct channel from public.sensor_readings
    where channel >= 1 and ts >= ${start} and ts <= ${end}`;
  const activeChannels = new Set(active.map((r) => Number(r.channel)));

  let series = seriesList(systems, channels, activeChannels);
  // The chip row stays complete even when one system is picked.
  const selector = series.map((s) => ({ key: s.key, name: s.name, channel: s.channel, kind: s.kind }));

  // One series and, for the log, one system name. A system without a
  // sensor (BIN 1–4) still has a log; a hygiene or unmapped channel has none.
  let logName = null;
  if (systemKey !== "all") {
    series = series.filter((s) => s.key === systemKey);
    if (UUID.test(systemKey)) {
      const s = systems.find((x) => x.id === systemKey);
      if (!s) return err("Fant ikke systemet.", 404);
      logName = s.name;
    } else {
      const num = Number(systemKey.slice(6));
      const ch = channels.find((c) => c.channel === num);
      logName = ch && ch.role === "bed" && ch.system_name ? ch.system_name : "";
    }
  }

  const minutes = bucketMinutes(start, end);
  const out = [];
  for (const s of series) {
    const rows = await bucketRows(sql, s.channel, start, end, minutes);
    out.push({
      key: s.key,
      name: s.name,
      channel: s.channel,
      kind: s.kind,
      temp: bucketGrid(rows, start, end, "temp", minutes),
      ec: bucketGrid(rows, start, end, "ec", minutes),
      moisture: bucketGrid(rows, start, end, "moisture", minutes),
    });
  }

  // "" = a selection that can have no log rows at all (hygiene, unmapped).
  const logFilter = logName === null ? sql`` : sql`and system = ${logName}`;
  let logs = [];
  let total = 0;
  let hasHandheld = false;
  let weeks = [];
  if (logName !== "") {
    const [meta] = await sql`select count(*)::int as total,
        coalesce(bool_or(source is distinct from 'mobil-v2'), false) as handheld
      from public.logs where date >= ${from} and date <= ${to} ${logFilter}`;
    total = meta.total;
    hasHandheld = meta.handheld === true;
    const rows = await sql`select id, system, date, logged_at, created_at, temperature, ph, moisture, moisture_handheld,
        feed_amount_liters, harvest_liters, notes, created_by, source
      from public.logs where date >= ${from} and date <= ${to} ${logFilter}
      order by date desc, logged_at desc nulls last, created_at desc
      limit ${LOG_CAP}`;
    logs = rows.map((r) => ({ ...logOut(r), handheld: r.source !== "mobil-v2" }));
    weeks = await sql`select to_char(date, 'IYYY-"W"IW') as week, date_trunc('week', date)::date::text as wk_from,
        sum(feed_amount_liters) as liters
      from public.logs where date >= ${from} and date <= ${to} and feed_amount_liters is not null ${logFilter}
      group by 1, 2 order by 2`;
  }

  const feedWeeks = weeks.map((w) => ({
    week: w.week,
    label: "uke " + Number(w.week.slice(-2)),
    from: w.wk_from,
    to: addDaysIso(w.wk_from, 6),
    liters: n(w.liters),
  }));
  const feedTotal = feedWeeks.length ? feedWeeks.reduce((a, w) => a + (w.liters || 0), 0) : null;

  const cfg = config();
  return json({
    configured: cfg.configured,
    message: cfg.configured ? null : NOT_CONFIGURED,
    range: { from, to },
    query: { ...range.query, system: systemKey },
    system: systemKey,
    minutes,
    selector,
    series: out,
    logs,
    logs_truncated: total > logs.length,
    feeding: { weeks: feedWeeks, total: feedTotal },
    has_handheld: hasHandheld,
  });
});
