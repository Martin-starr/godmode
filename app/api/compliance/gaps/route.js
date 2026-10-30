import { db } from "@/lib/db";
import { json, guarded, withWatchdog } from "@/lib/http";
import { screenReadings, holdRuns, dayStats, MAX_GAP_MIN as HYG_MAX_GAP_MIN } from "@/lib/hygiene";
import { osloStamp, isoDateOslo } from "@/lib/time";

export const runtime = "nodejs";
// Three small aggregate queries plus one Resend call. 30s is generous, but a
// cron that hangs until the platform kills it reports nothing at all, and a
// documentation check that fails silently is worse than no check.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Finds the holes in the production record BEFORE an inspector does.
//
// The watchdog (/api/health/check) answers "is something wrong right now".
// This answers a different question: "if Mattilsynet asked for the log for
// the last five weeks today, what could we not produce". Those are not the
// same failure — a probe that reads fine every hour still leaves a hole in
// the record if nobody wrote the day down, and by Martin's own rule
// ("hvis noe ikke logges, har det ikke skjedd") the hole IS the failure.
//
// Same philosophy as the watchdog: silence is the healthy state. The monthly
// cron mails only when there are gaps, and dedups so re-running it does not
// send the same list twice.
//
// What it checks:
//   1. missing log days   — per active system, days with no reading at all
//   2. §19 hygienisering  — 72 unbroken hours with ≥2 probes ≥55 °C on
//                           screened minute data; broken runs block the batch
//   3. silent deviations  — readings outside dash.targets with avvik = 0

const DEFAULT_DAYS = 35;

// The §19 gate as recorded in SOP-pakke v2.0: three consecutive days at 55 °C
// or above, documented at a minimum of two measurement points per day. One
// probe is an anecdote, not a record.
//
// Deliberately no paragraph citation here beyond "§19" — the SOP is the
// authority this code follows, and a half-remembered forskrift reference in a
// comment is worse than none: it invites someone to trust it in a tilsyn
// conversation. If the thresholds move, they move in the SOP first.
const HYG_MIN_TEMP = 55;
const HYG_MIN_DAYS = 3;
const HYG_MIN_POINTS = 2;
const HYG_MIN_MINUTES = HYG_MIN_DAYS * 24 * 60;

// Deduplication window. The cron is monthly, but Martin re-runs it by hand
// before meetings; without this the same five holes get mailed every time and
// the mail stops being read — the same reasoning as the watchdog's 12h, just
// scaled to a monthly job.
const RENOTIFY_DAYS = 30;

async function alreadyNotified(sql, key) {
  const rows = await sql`select value from dash.meta where key = ${"alert:" + key}`;
  if (!rows.length) return false;
  const last = Number(rows[0].value);
  return Number.isFinite(last) && Date.now() - last < RENOTIFY_DAYS * 24 * 3600_000;
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
    console.warn("compliance: ALERT_EMAIL/RESEND_API_KEY ikke satt — varsel ikke sendt:", subject);
    return { sent: false, reason: "not configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject,
      text: lines.join("\n") + "\n\n— Verminord dokumentasjonskontroll\ndash.verminord.app",
    }),
  });
  if (!res.ok) {
    console.error("compliance: e-post feilet:", res.status, await res.text().catch(() => ""));
    return { sent: false, reason: "send failed " + res.status };
  }
  return { sent: true };
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (isoDate, n) => {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
// Norwegian decimal comma, one decimal. The view casts the phone logger's
// numeric columns to real, so 17.5 can arrive as 17.650572 — printing that raw
// makes a log line look like sensor output rather than something a human wrote.
const nb = (n) => String(Math.round(n * 10) / 10).replace(".", ",");

function windowFor(days) {
  // The window ends YESTERDAY. Today is not a gap yet — the working day isn't
  // over, and the watchdog already nags about an unlogged today after 18:00.
  const to = addDays(iso(new Date()), -1);
  return { from: addDays(to, -(days - 1)), to, days };
}

async function buildReport(sql, days) {
  const win = windowFor(days);
  const gaps = [];

  // ---- 1. Missing log days -------------------------------------------------
  // Read from dash.readings_all, not dash.readings: the phone logger
  // (public.logs) is the primary record — a day logged on the phone is logged.
  // Checking the dashboard table alone would invent holes that don't exist.
  //
  // Days before a system's first reading are not holes (a system added last
  // week did not fail to log in June), so the per-system floor is its first
  // reading. Sundays are excluded, matching the watchdog's notion of a working
  // day; flagging ~5 Sundays every month would drown the real holes.
  const missing = await sql`
    with days as (
      select d::date as day
      from generate_series(${win.from}::date, ${win.to}::date, interval '1 day') d
    ),
    active as (
      select s.id,
             (select min(r.date) from dash.readings_all r where r.system = s.id) as first_log
      from dash.systems s
      where s.status = 'I drift'
    )
    select a.id as system, to_char(d.day, 'YYYY-MM-DD') as date
    from active a
    cross join days d
    where a.first_log is not null
      and d.day >= a.first_log::date
      and extract(dow from d.day) <> 0
      and not exists (
        select 1 from dash.readings_all r
        where r.system = a.id and r.date = to_char(d.day, 'YYYY-MM-DD')
      )
    order by a.id, d.day`;

  const bySystem = new Map();
  for (const m of missing) {
    if (!bySystem.has(m.system)) bySystem.set(m.system, []);
    bySystem.get(m.system).push(m.date);
  }
  const missing_days = [];
  for (const [system, dates] of bySystem) {
    missing_days.push({ system, count: dates.length, dates });
    // One gap per system, not per day: a month with eight holes is one
    // conversation with Martin, not eight mails. The key carries the span and
    // the count so the same holes stay deduped but new ones re-alert.
    gaps.push({
      kind: "logg",
      key: `gap:logg:${system}:${dates[0]}:${dates[dates.length - 1]}:${dates.length}`,
      severity: 3,
      line:
        `[RØD] ${system}: ingen loggføring ${dates.length} ` +
        `${dates.length === 1 ? "dag" : "dager"} i vinduet (${dates.slice(0, 6).join(", ")}` +
        `${dates.length > 6 ? ` … +${dates.length - 6}` : ""}). ` +
        `Hvis noe ikke logges, har det ikke skjedd.`,
    });
  }

  // A system standing as "I drift" with no measurements at all is a different
  // problem from a few missing days — it is either mislabelled or never used.
  const never = await sql`
    select s.id from dash.systems s
    where s.status = 'I drift'
      and not exists (select 1 from dash.readings_all r where r.system = s.id)
    order by s.sort`;
  for (const s of never) {
    missing_days.push({ system: s.id, count: null, dates: [], never_logged: true });
    gaps.push({
      kind: "logg",
      key: `gap:logg-aldri:${s.id}`,
      severity: 3,
      line: `[RØD] ${s.id} står som «I drift», men har ingen målinger registrert.`,
    });
  }

  // ---- 2. §19 hygienisering ----------------------------------------------
  // Computed from the minute readings, not from daily peaks, with the same
  // screening as the Hygienisering page (lib/hygiene.js): a probe reading
  // 148 °C beside two probes at 53 °C is a fault, not a hygienisation.
  //
  // "Three consecutive days at 55 °C" = an unbroken stretch of 72 hours in
  // which at least two probes, on valid readings, were at or above 55 °C in
  // the same minute. A hole in the log longer than a few minutes breaks the
  // stretch: nothing documents what the mass did in between. Aggregated
  // across imports — the legal unit is the run in the vessel, not the file.
  const hygRows = await sql`
    select extract(epoch from ts) * 1000 as ts, ch, temp, excluded
    from dash.hygiene_readings
    where ts >= ${win.from}::date
    order by ts, ch`;
  const screened = screenReadings(hygRows.map((r) => ({
    ts: Number(r.ts), ch: Number(r.ch), temp: Number(r.temp), excluded: r.excluded || null,
  })));
  const hygDays = dayStats(screened, HYG_MIN_TEMP);

  // dash.batches has no foreign key to hygiene imports or readings — the two
  // were built at different times and nothing links them (see migration 007).
  // The batch shown next to a run is therefore INFERRED from date overlap
  // and is advisory: it tells Martin where to look, it is not a record.
  const batches = await sql`
    select id, batch_code, system, started_at, harvested_at, status
    from dash.batches
    where coalesce(harvested_at, current_date) >= ${win.from}::date
      and coalesce(started_at, harvested_at, current_date) <= ${win.to}::date
    order by coalesce(started_at, harvested_at)`;
  const batchLabel = (b) => (b.batch_code || `batch #${b.id}`) + ` (${b.system})`;
  const batchesFor = (from, to) =>
    batches
      .filter((b) => {
        const s = b.started_at ? iso(new Date(b.started_at)) : from;
        const e = b.harvested_at ? iso(new Date(b.harvested_at)) : to;
        return s <= to && e >= from;
      })
      .map(batchLabel);

  const lastDataDay = hygDays.length ? hygDays[hygDays.length - 1].date : null;
  const lastTs = screened.reduce((m, r) => (m === null || r.ts > m ? r.ts : m), null);
  const hours = (m) => Math.floor(m / 60);
  const chains = holdRuns(screened, HYG_MIN_TEMP, HYG_MIN_POINTS)
    // Stretches under an hour are noise around the threshold, not attempts.
    .filter((r) => r.minutes >= 60)
    .map((r) => {
      const from = isoDateOslo(new Date(r.from));
      const to = isoDateOslo(new Date(r.to));
      // "In progress" only if the stretch runs to the end of the record and
      // the record is recent. An old stretch that stopped is not waiting.
      const live = r.to >= lastTs - HYG_MAX_GAP_MIN * 60000 && Date.now() - lastTs < 36 * 3600_000;
      let status;
      if (r.minutes >= HYG_MIN_MINUTES) status = "godkjent";
      else if (live) status = "pågår";
      else status = "brutt";
      return {
        from, to, start: osloStamp(new Date(r.from)), end: osloStamp(new Date(r.to)),
        minutes: r.minutes, hours: hours(r.minutes), min_points: r.probes,
        status, batches: batchesFor(from, to),
      };
    });

  for (const c of chains) {
    if (c.status !== "brutt") continue;
    const bt = c.batches.length ? ` Gjelder trolig ${c.batches.join(", ")}.` : "";
    gaps.push({
      kind: "hygiene",
      key: `gap:hyg-brutt:${c.start}:${c.end}`,
      severity: 3,
      line:
        `[RØD] Hygienisering ${c.start.slice(0, 16)}–${c.end.slice(0, 16)}: minst ${HYG_MIN_POINTS} sonder ` +
        `holdt ${HYG_MIN_TEMP} °C i ${c.hours} t, så brøt det. §19 krever ${HYG_MIN_DAYS} sammenhengende døgn ` +
        `(${HYG_MIN_DAYS * 24} t). Massen kan ikke gå videre til markbedene.${bt}`,
    });
  }

  // Days that reached the temperature on one probe only: say which day to
  // explain. Valid readings only.
  const thin_days = [];
  for (const d of hygDays) {
    if (d.max_temp === null || d.max_temp < HYG_MIN_TEMP || d.points_hot >= HYG_MIN_POINTS) continue;
    thin_days.push({ date: d.date, points: d.points_hot, samples: d.samples, max_temp: d.max_temp });
    gaps.push({
      kind: "hygiene",
      key: `gap:hyg-punkt:${d.date}`,
      severity: 2,
      line:
        `[GUL] ${d.date}: bare ${d.points_hot} målepunkt over ${HYG_MIN_TEMP} °C ` +
        `(topp ${nb(d.max_temp)} °C). §19 krever minst ${HYG_MIN_POINTS}.`,
    });
  }

  // Readings set aside as probe faults. Listed so nobody is surprised that a
  // 100 °C reading in the file did not count.
  const rejected_days = [];
  for (const d of hygDays) {
    if (!d.rejected) continue;
    rejected_days.push({ date: d.date, rejected: d.rejected, channels: d.rejected_ch });
    gaps.push({
      kind: "hygiene",
      key: `gap:hyg-forkastet:${d.date}:${d.rejected}`,
      severity: 2,
      line:
        `[GUL] ${d.date}: ${d.rejected} målinger fra kanal ${d.rejected_ch.join(", ")} satt til side ` +
        `som sondefeil (umulig verdi, sprang eller usikker kanal). De teller ikke i §19-vurderingen.`,
    });
  }

  // ---- 3. Out-of-target readings never flagged as avvik --------------------
  // An out-of-range value with avvik = 0 is an undocumented deviation: the
  // measurement proves something went wrong, and nothing in the record says it
  // was noticed. Note that rows from the phone logger get avvik computed by
  // the readings_all view, so in practice this catches dashboard-entered rows
  // — which is precisely where a human can forget to tick the box.
  const targets = await sql`select metric, min, max from dash.targets`;
  const tg = Object.fromEntries(targets.map((t) => [t.metric, t]));
  const rows = await sql`
    select id, system, date, temp, ph, fukt, source
    from dash.readings_all
    where date >= ${win.from} and date <= ${win.to} and avvik = 0
    order by date`;
  const bad = (v, t) => v != null && t && (v < t.min || v > t.max);
  const unflagged = [];
  for (const r of rows) {
    const off = [];
    if (bad(r.temp, tg.temp)) off.push(`temp ${nb(r.temp)} °C (mål ${nb(tg.temp.min)}–${nb(tg.temp.max)})`);
    if (bad(r.ph, tg.ph)) off.push(`pH ${nb(r.ph)} (mål ${nb(tg.ph.min)}–${nb(tg.ph.max)})`);
    if (bad(r.fukt, tg.fukt)) off.push(`fukt ${nb(r.fukt)} % (mål ${nb(tg.fukt.min)}–${nb(tg.fukt.max)})`);
    if (!off.length) continue;
    unflagged.push({ id: r.id, system: r.system, date: r.date, source: r.source, off });
    gaps.push({
      kind: "avvik",
      key: `gap:avvik:${r.id}`,
      severity: 3,
      line: `[RØD] ${r.system} ${r.date}: ${off.join(", ")} — ikke merket som avvik.`,
    });
  }

  gaps.sort((a, b) => b.severity - a.severity);

  return {
    checked_at: new Date().toISOString(),
    window: win,
    rules: { min_temp: HYG_MIN_TEMP, min_days: HYG_MIN_DAYS, min_points: HYG_MIN_POINTS, max_gap_min: HYG_MAX_GAP_MIN },
    total: gaps.length,
    counts: {
      logg: gaps.filter((g) => g.kind === "logg").length,
      hygiene: gaps.filter((g) => g.kind === "hygiene").length,
      avvik: gaps.filter((g) => g.kind === "avvik").length,
    },
    missing_days,
    hygiene: { chains, thin_days, rejected_days, last_data_day: lastDataDay },
    unflagged,
    gaps,
  };
}

function parseDays(req) {
  // Note the explicit null check: an absent param is null, and Number(null) is
  // 0, which would silently clamp the window to a single day — a report that
  // finds almost nothing and looks like good news.
  const raw = new URL(req.url).searchParams.get("days");
  if (raw === null || raw.trim() === "") return DEFAULT_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(365, Math.max(1, Math.round(n)));
}

// Vercel cron calls are authenticated by CRON_SECRET; a bare public URL would
// let anyone trigger alert mail. Same check as the watchdog.
function isCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === "Bearer " + secret;
}

async function runCron(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && !isCron(req)) return new Response("forbidden", { status: 403 });

  const sql = db();
  const report = await withWatchdog(() => buildReport(sql, parseDays(req)));

  // Send only what hasn't been sent recently.
  const fresh = [];
  for (const g of report.gaps) {
    if (!(await withWatchdog(() => alreadyNotified(sql, g.key)))) fresh.push(g);
  }

  let mail = { sent: false, reason: "nothing new" };
  if (fresh.length) {
    // The mail is a to-do list, not the report. Long lists get truncated so it
    // stays readable on a phone; the full picture is behind /api/compliance/gaps.
    const shown = fresh.slice(0, 25);
    const lines = [
      `Dokumentasjonskontroll ${report.window.from} – ${report.window.to} ` +
        `(${report.window.days} ${report.window.days === 1 ? "dag" : "dager"}):`,
      "",
      ...shown.map((g) => "• " + g.line),
    ];
    if (fresh.length > shown.length) lines.push(`… og ${fresh.length - shown.length} til.`);
    lines.push("", "Full oversikt: dash.verminord.app → Hygienisering / Logg.");
    mail = await sendAlert(
      `Dokumentasjonshull: ${fresh.length} sak${fresh.length === 1 ? "" : "er"} i loggen`,
      lines
    );
    if (mail.sent) for (const g of fresh) await withWatchdog(() => markNotified(sql, g.key));
  }

  return Response.json({
    checked_at: report.checked_at,
    window: report.window,
    gaps: report.total,
    new_gaps: fresh.length,
    mail,
    detail: report.gaps.map((g) => g.line),
  });
}

const readReport = guarded(async (req) => {
  const sql = db();
  return json(await buildReport(sql, parseDays(req)));
});

export async function GET(req) {
  // Vercel cron issues GET, never POST. POST stays the documented cron
  // entrypoint (manual re-runs, curl), but a GET carrying CRON_SECRET has to
  // work too — otherwise the scheduled job would 401 every month and the
  // resulting silence would look exactly like "no gaps found", which is the
  // one failure this route exists to prevent.
  if (isCron(req)) return runCron(req);
  return readReport(req);
}

export const POST = runCron;
