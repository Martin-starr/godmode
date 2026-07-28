import { db } from "@/lib/db";
import { ok, fail } from "@/lib/integrations";

export const runtime = "nodejs";
export const maxDuration = 15;

// Receiver for the GW1200 gateway's "Customized" upload path.
//
// This route is called by a device on Martin's LAN, not by a logged-in
// browser, so it deliberately does NOT use guarded() — there is no session.
// Auth is the gateway's PASSKEY (an MD5 of the station MAC that Ecowitt
// includes in every POST) checked against ECOWITT_PASSKEY. Set that env var
// to the PASSKEY value from the first real POST; until it is set the route
// refuses everything rather than accepting anonymous writes.
//
// UNITS: Ecowitt's custom-server protocol always uploads imperial regardless
// of what the console displays — soil/air temperatures arrive in °F. They are
// converted to °C on the way in so the stored column matches every other
// temperature in the system.
//
// FIELD NAMES: mapped from Ecowitt's documented conventions (soilmoistureN,
// tf_chN, soilbattN…). The exact set a WH52 emits should be confirmed against
// the first real payload — which is why the whole body is also stored in
// `raw` jsonb. If a mapping is wrong, nothing is lost and it can be
// re-derived from raw instead of re-collected from the field.

const F_TO_C = (f) => ((f - 32) * 5) / 9;

function num(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "2026-07-28 12:34:56" (UTC, no zone marker) → Date.
function parseDateUtc(s) {
  if (!s) return new Date();
  const d = new Date(String(s).trim().replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// Pull every channel that appears under any recognised prefix. A channel is
// kept if it carries at least one real measurement — the gateway sends the
// full field set for all 16 slots whether or not a sensor is paired, and
// storing empty slots would make "which sensors are alive?" unanswerable.
function extractChannels(body) {
  const out = new Map();
  const touch = (ch) => {
    if (!out.has(ch)) out.set(ch, { channel: ch });
    return out.get(ch);
  };

  for (const [rawKey, rawVal] of Object.entries(body)) {
    const key = rawKey.toLowerCase();
    let m;
    if ((m = key.match(/^soilmoisture(\d+)$/))) touch(+m[1]).moisture = num(rawVal);
    else if ((m = key.match(/^soilad(\d+)$/))) touch(+m[1]).ad = num(rawVal);
    else if ((m = key.match(/^soilbatt(\d+)$/))) touch(+m[1]).battery = num(rawVal);
    else if ((m = key.match(/^soilec(\d+)$/))) touch(+m[1]).ec = num(rawVal);
    // Soil/water temperature probes report in °F under tf_chN (WN34) or
    // soiltempN depending on model.
    else if ((m = key.match(/^tf_ch(\d+)$/))) touch(+m[1]).tempF = num(rawVal);
    else if ((m = key.match(/^soiltemp(\d+)$/))) touch(+m[1]).tempF = num(rawVal);
    else if ((m = key.match(/^tf_batt(\d+)$/))) touch(+m[1]).battery = num(rawVal);
  }

  return [...out.values()]
    .filter((c) => c.moisture != null || c.tempF != null || c.ec != null)
    // Coerced to null rather than left undefined: postgres.js rejects
    // undefined in an insert, and a sensor that reports temperature but not
    // EC leaves those keys absent entirely.
    .map((c) => ({
      channel: c.channel,
      moisture: c.moisture ?? null,
      ec: c.ec ?? null,
      battery: c.battery ?? null,
      temp: c.tempF == null ? null : Math.round(F_TO_C(c.tempF) * 100) / 100,
    }));
}

async function readBody(req) {
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/json")) return await req.json();
  // Ecowitt posts application/x-www-form-urlencoded.
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

export async function POST(req) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return new Response("bad body", { status: 400 });
  }

  const expected = process.env.ECOWITT_PASSKEY;
  if (!expected) {
    await fail("autologger", "ECOWITT_PASSKEY er ikke satt — avviser innkommende data.");
    return new Response("not configured", { status: 503 });
  }
  if (String(body.PASSKEY || body.passkey || "") !== expected) {
    await fail("autologger", "Ukjent PASSKEY — avvist.");
    return new Response("forbidden", { status: 403 });
  }

  const measuredAt = parseDateUtc(body.dateutc);
  const channels = extractChannels(body);

  if (!channels.length) {
    // A valid POST carrying no soil data is not an error — the gateway also
    // uploads on its own schedule with nothing paired yet. Record the
    // contact so the connector counts as alive.
    await ok("autologger");
    return Response.json({ stored: 0, note: "ingen jordsensorer i denne posten" });
  }

  try {
    const sql = db();
    const map = await sql`select channel, system from dash.sensor_map where active = 1`;
    const byChannel = new Map(map.map((r) => [r.channel, r.system]));

    const rows = channels.map((c) => ({
      measured_at: measuredAt,
      channel: c.channel,
      // An unmapped channel still gets stored — losing readings because
      // nobody has named the sensor yet is exactly the silent data loss
      // this system is supposed to stop. It shows up as "Kanal N" until
      // dash.sensor_map is filled in.
      system: byChannel.get(c.channel) || `Kanal ${c.channel}`,
      temp: c.temp,
      moisture: c.moisture,
      ec: c.ec,
      battery: c.battery,
      rssi: num(body[`soilrssi${c.channel}`]),
      raw: body,
    }));

    // The gateway retries on network failure, so the same (channel, time)
    // arrives more than once. Last write wins rather than erroring.
    await sql`insert into dash.sensor_readings ${sql(
      rows,
      "measured_at", "channel", "system", "temp", "moisture", "ec", "battery", "rssi", "raw"
    )} on conflict (channel, measured_at) do update set
        temp = excluded.temp, moisture = excluded.moisture, ec = excluded.ec,
        battery = excluded.battery, rssi = excluded.rssi, raw = excluded.raw`;

    await sql`select dash.roll_up_sensor_hour(${measuredAt})`;
    await ok("autologger");

    return Response.json({
      stored: rows.length,
      channels: rows.map((r) => r.channel),
      measured_at: measuredAt.toISOString(),
      unmapped: rows.filter((r) => r.system.startsWith("Kanal ")).map((r) => r.channel),
    });
  } catch (e) {
    console.error("ecowitt ingest failed:", e.message);
    await fail("autologger", e.message);
    // 500 makes the gateway retry, which is what we want — a database blip
    // should cost a retry, not a reading.
    return new Response("error", { status: 500 });
  }
}

// The GW1200 sends a GET to validate the endpoint when you save the custom
// server settings. Answering it makes the gateway's own test button pass.
export async function GET() {
  return Response.json({ ok: true, service: "verminord ecowitt ingest" });
}
