import { db } from "@/lib/db";
import { statuses } from "@/lib/integrations";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// The watchdog. Runs on a schedule (Vercel cron, hourly) and emails Martin
// ONLY when something is wrong. Silence is the healthy state — there is no
// daily "all good" mail, because a mail that always arrives stops being read,
// and then the one that matters gets skimmed too.
//
// What it checks, in the order things have actually broken:
//   1. connectors      — stale or failing (the Gmail-dead-for-15-days case)
//   2. daily logging   — nothing logged today by 18:00 on a working day
//   3. readings        — values outside dash.targets
//   4. database        — reachable at all (implicit: this route 500s if not)
//
// IMPORTANT LIMITATION: this cannot report its own death. If Vercel is down,
// Supabase is unreachable, or the cron stops firing, nothing here runs and
// nothing is sent. That is what the external uptime check covers — see
// docs/overvaking.md. Two layers, because a monitor inside the thing it
// monitors only catches half the failures.

const SEVERITY = { rød: 3, gul: 2 };

// Deduplication: without this, an hourly cron mails the same dead connector
// 24 times a day and gets muted or filtered — which is the same as no alert.
// One mail per distinct problem per 12h.
const RENOTIFY_HOURS = 12;

async function alreadyNotified(sql, key) {
  const rows = await sql`select value from dash.meta where key = ${"alert:" + key}`;
  if (!rows.length) return false;
  const last = Number(rows[0].value);
  return Number.isFinite(last) && Date.now() - last < RENOTIFY_HOURS * 3600_000;
}

async function markNotified(sql, key) {
  await sql`insert into dash.meta (key, value) values (${"alert:" + key}, ${String(Date.now())})
    on conflict (key) do update set value = excluded.value`;
}

async function sendAlert(subject, lines) {
  const to = process.env.ALERT_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM || "Verminord <onboarding@resend.dev>";
  if (!to || !apiKey) {
    console.warn("watchdog: ALERT_EMAIL/RESEND_API_KEY ikke satt — varsel ikke sendt:", subject);
    return { sent: false, reason: "not configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject,
      text: lines.join("\n") + "\n\n— Verminord vaktbikkje\ndash.verminord.app",
    }),
  });
  if (!res.ok) {
    console.error("watchdog: e-post feilet:", res.status, await res.text().catch(() => ""));
    return { sent: false, reason: "send failed " + res.status };
  }
  return { sent: true };
}

export async function GET(req) {
  // Vercel cron calls are authenticated by CRON_SECRET; a bare public URL
  // would let anyone trigger alert mail.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== "Bearer " + secret) {
      return new Response("forbidden", { status: 403 });
    }
  }

  const sql = db();
  const problems = [];

  // 1. Connectors
  const conns = await statuses();
  for (const c of conns) {
    if (!SEVERITY[c.status]) continue;
    problems.push({
      key: "conn:" + c.key,
      severity: SEVERITY[c.status],
      line:
        `[${c.status.toUpperCase()}] ${c.label} — ` +
        (c.last_ok_at ? `sist OK for ${c.age_minutes} min siden` : "har aldri svart") +
        (c.last_error ? `. Feil: ${c.last_error}` : ""),
    });
  }

  // 2. Daily logging. Checked against the union view, so a log entered on the
  // phone counts the same as one entered on the dashboard.
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const today = now.toISOString().slice(0, 10);
  const [{ n }] = await sql`select count(*)::int as n from dash.readings_all where date = ${today}`;
  if (n === 0 && now.getHours() >= 18 && dow !== 0) {
    problems.push({
      key: "log:" + today,
      severity: 2,
      line: `[GUL] Ingen loggføring i dag (${today}). "Logg hver dag — loggen er beviset overfor inspeksjonen."`,
    });
  }

  // 3. Readings outside target
  const out = await sql`select r.system, r.temp, r.ph, r.fukt from dash.readings_all r where r.date = ${today}`;
  const targets = await sql`select metric, min, max from dash.targets`;
  const tg = Object.fromEntries(targets.map((t) => [t.metric, t]));
  const bad = (v, t) => v != null && t && (v < t.min || v > t.max);
  for (const r of out) {
    const off = [];
    if (bad(r.temp, tg.temp)) off.push(`temp ${r.temp}°C (mål ${tg.temp.min}–${tg.temp.max})`);
    if (bad(r.ph, tg.ph)) off.push(`pH ${r.ph} (mål ${tg.ph.min}–${tg.ph.max})`);
    if (bad(r.fukt, tg.fukt)) off.push(`fukt ${r.fukt}% (mål ${tg.fukt.min}–${tg.fukt.max})`);
    if (off.length) {
      problems.push({
        key: `reading:${today}:${r.system}`,
        severity: 3,
        line: `[RØD] ${r.system} utenfor mål — ${off.join(", ")}`,
      });
    }
  }

  // 4. Sensors — checked per probe, not just per gateway. The `autologger`
  // connector only proves the GW1200 is still posting; a single battery-powered
  // probe can go flat while the gateway keeps cheerfully reporting the other
  // six. Silence from one channel is the failure that hides best.
  const probes = await sql`select distinct on (channel)
      channel, system, temp, measured_at
    from dash.sensor_readings order by channel, measured_at desc`;
  for (const p of probes) {
    const ageMin = (now.getTime() - new Date(p.measured_at).getTime()) / 60000;
    if (ageMin > 120) {
      problems.push({
        key: "probe:" + p.channel,
        severity: 2,
        line:
          `[GUL] Sensor ${p.system} (kanal ${p.channel}) har vært stille i ` +
          `${Math.round(ageMin / 60)} t — sjekk batteri.`,
      });
      continue; // A stale reading's value proves nothing; don't also alert on it.
    }
    if (bad(p.temp, tg.temp)) {
      problems.push({
        key: `probe-temp:${today}:${p.channel}`,
        severity: 3,
        line:
          `[RØD] Sensor ${p.system} (kanal ${p.channel}) måler ${p.temp}°C ` +
          `(mål ${tg.temp.min}–${tg.temp.max}).`,
      });
    }
  }

  // Send only what hasn't been sent recently.
  const fresh = [];
  for (const p of problems) {
    if (!(await alreadyNotified(sql, p.key))) fresh.push(p);
  }

  let mail = { sent: false, reason: "nothing new" };
  if (fresh.length) {
    fresh.sort((a, b) => b.severity - a.severity);
    const worst = fresh[0].severity === 3 ? "AVVIK" : "Varsel";
    mail = await sendAlert(
      `${worst}: ${fresh.length} sak${fresh.length === 1 ? "" : "er"} krever tilsyn`,
      fresh.map((p) => "• " + p.line)
    );
    if (mail.sent) for (const p of fresh) await markNotified(sql, p.key);
  }

  return Response.json({
    checked_at: now.toISOString(),
    problems: problems.length,
    new_problems: fresh.length,
    logged_today: n,
    mail,
    detail: problems.map((p) => p.line),
  });
}
