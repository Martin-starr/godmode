// What the phone tells Martin about, and how.
//
// evaluate() looks at the state of the hall and returns the alerts that
// hold right now, each with a key that names the episode (a silent probe
// since 09:30, a cold stretch that began at 14:00, today's missing log).
// recordAndSend() stores the ones not stored before and pushes them to
// every phone that asked. Run hourly from the scheduled job; the same
// episode is never sent twice.
import webpush from "web-push";
import { listChannels, channelTitle } from "./v2.js";
import { latestPerChannel } from "./ecowitt.js";
import { isoDateOslo, osloStamp } from "./time.js";

const H = 3600e3;
const SILENT_MS = 2 * H;
const OUTSIDE_MS = 1 * H;
const HYG_MIN = 55;
const HYG_HOURS = 72;
const HYG_RUN_MIN_H = 6; // shorter stretches are warm-up, not a run
const NOLOG_HOUR = 18;
const FEED_DAY = 5; // Friday
const FEED_HOUR = 7;

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function vapid() {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:post@verminord.no", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

const when = (d) => { const s = osloStamp(new Date(d)); return s.slice(8, 10) + "." + s.slice(5, 7) + " kl " + s.slice(11, 16); };
const nb = (v, dec = 1) => Number(v).toFixed(dec).replace(".", ",");

export async function evaluate(sql, now = new Date()) {
  const alerts = [];
  const channels = await listChannels(sql);
  const targets = Object.fromEntries((await sql`select metric, min, max from dash.targets`).map((t) => [t.metric, { min: Number(t.min), max: Number(t.max) }]));
  const band = targets.temp || { min: 15, max: 25 };
  const rows = await sql`select channel, ts, soil_temp_c from public.sensor_readings
    where channel >= 1 and soil_temp_c is not null and ts > now() - interval '7 days'
    order by channel, ts desc`;
  // The newest reading ever, per channel: silence is measured from it,
  // not from the week the stretches are computed over.
  const newest = new Map((await latestPerChannel(sql)).map((r) => [r.channel, new Date(r.ts).getTime()]));
  const byCh = new Map();
  for (const r of rows) {
    if (!byCh.has(r.channel)) byCh.set(r.channel, []);
    byCh.get(r.channel).push({ t: new Date(r.ts).getTime(), v: Number(r.soil_temp_c) });
  }

  for (const ch of channels.filter((c) => c.role === "bed" && c.system_id)) {
    const name = ch.system_name || "CH" + ch.channel;
    const href = "/anlegg/" + ch.system_id;
    const list = byCh.get(ch.channel) || [];
    const last = newest.get(ch.channel);
    if (!last || now.getTime() - last > SILENT_MS) {
      alerts.push({
        key: `silent:${ch.channel}:${last || "never"}`,
        kind: "silent",
        title: `${name}: sonden er stille`,
        body: last ? `Siste måling ${when(last)}. Sjekk batteri og dekning.` : "Sonden har aldri rapportert.",
        href,
      });
      continue;
    }
    const latest = list[0];
    if (!latest) continue;
    // The current stretch outside the band, newest reading first.
    let start = null;
    for (const r of list) {
      if (r.v < band.min || r.v > band.max) start = r.t;
      else break;
    }
    if (start !== null && latest.t - start >= OUTSIDE_MS) {
      const hours = Math.round((latest.t - start) / H);
      alerts.push({
        key: `temp:${ch.channel}:${start}`,
        kind: "temp",
        title: `${name}: ${nb(latest.v)} °C, utenfor ${band.min}–${band.max} °C`,
        body: `I ${hours} ${hours === 1 ? "time" : "timer"}, siden ${when(start)}.`,
        href,
      });
    }
  }

  // The hygiene tank: a run at 55 °C that ended in the last two hours
  // before it reached 72 hours. Warm-ups under six hours do not count.
  for (const ch of channels.filter((c) => c.role === "hygiene")) {
    const list = byCh.get(ch.channel) || [];
    if (!list.length || list[0].v >= HYG_MIN) continue;
    let i = 0;
    while (i < list.length && list[i].v < HYG_MIN) i++;
    if (i === 0 || i >= list.length) continue;
    const endedAt = list[i - 1].t; // first reading below, newest side
    if (now.getTime() - endedAt > 2 * H) continue;
    let runStart = list[i].t;
    let prev = list[i].t;
    let j = i;
    while (j < list.length && list[j].v >= HYG_MIN && prev - list[j].t <= 2 * H) { runStart = list[j].t; prev = list[j].t; j++; }
    const runEnd = list[i].t;
    const hours = Math.round((runEnd - runStart) / H);
    if (hours < HYG_RUN_MIN_H || hours >= HYG_HOURS) continue;
    alerts.push({
      key: `hygbreak:${ch.channel}:${runStart}`,
      kind: "hygiene",
      title: `Hygienisering brøt etter ${hours} timer`,
      body: `${channelTitle(ch)} falt under ${HYG_MIN} °C ${when(endedAt)}. §19 krever ${HYG_HOURS} timer.`,
      href: "/",
    });
  }

  const today = isoDateOslo(now);
  const hour = Number(osloStamp(now).slice(11, 13));
  if (hour >= NOLOG_HOUR) {
    const [{ n }] = await sql`select count(*)::int as n from dash.readings_all where date = ${today}`;
    if (n === 0) {
      alerts.push({ key: `nologg:${today}`, kind: "logg", title: "Ingenting logget i dag", body: "Hvis noe ikke logges, har det ikke skjedd.", href: "/logg" });
    }
  }
  const weekday = new Date(today + "T12:00:00Z").getUTCDay();
  if (weekday === FEED_DAY && hour >= FEED_HOUR) {
    alerts.push({ key: `feed:${today}`, kind: "feed", title: "Fôringsdag", body: "Fôr alle, i Gjør.", href: "/logg" });
  }
  return alerts;
}

// Stores the alerts not stored before and pushes them. Returns counts.
export async function recordAndSend(sql, alerts) {
  const fresh = [];
  for (const a of alerts) {
    const rows = await sql`insert into dash.alerts (key, kind, title, body, href)
      values (${a.key}, ${a.kind}, ${a.title}, ${a.body}, ${a.href})
      on conflict (key) do nothing returning id`;
    if (rows.length) fresh.push(a);
  }
  const out = { found: alerts.length, new: fresh.length, sent: 0, removed: 0, failed: 0 };
  if (!fresh.length || !pushConfigured()) return out;
  const subs = await sql`select id, endpoint, keys from dash.push_subscriptions`;
  if (!subs.length) return out;
  vapid();
  for (const s of subs) {
    for (const a of fresh) {
      const r = await sendTo(s, { title: a.title, body: a.body, href: a.href, tag: a.key });
      if (r === "gone") { await sql`delete from dash.push_subscriptions where id = ${s.id}`; out.removed++; break; }
      if (r === "ok") { out.sent++; await sql`update dash.push_subscriptions set last_ok_at = now(), failures = 0 where id = ${s.id}`; }
      else { out.failed++; await sql`update dash.push_subscriptions set failures = failures + 1 where id = ${s.id}`; }
    }
  }
  return out;
}

// "ok" | "gone" (the phone unsubscribed) | "failed"
export async function sendTo(sub, payload) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 6 * 3600 });
    return "ok";
  } catch (e) {
    if (e && (e.statusCode === 404 || e.statusCode === 410)) return "gone";
    console.error("[push] failed:", e && e.statusCode, e && e.body ? String(e.body).slice(0, 200) : e && e.message);
    return "failed";
  }
}
