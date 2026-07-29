import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

// Read path for the Ecowitt autologgers.
//
// Until this existed, dash.sensor_readings was write-only: the ingest route
// stored roughly 10k rows a day and nothing in the application ever looked at
// them. A sensor that died, drifted, or was never paired would have been
// completely invisible — which is the same silent-failure class as the Gmail
// bridge, just with the readings that are supposed to prove §19 compliance.
//
// GET  → latest reading per channel + the channel→system map
//        ?system=CFT1&hours=48 additionally returns the hourly rollup, which
//        is what charts should read. Never chart the raw table: at one row per
//        sensor per minute a week of data is ~70k points for one bed.

export const GET = guarded(async (req) => {
  const sql = db();
  const url = new URL(req.url);
  const system = url.searchParams.get("system");
  const hours = Math.min(Number(url.searchParams.get("hours")) || 48, 24 * 90);

  // Sequential — concurrent queries on one pooled connection wedge Supavisor.
  const map = await sql`select channel, system, label, active
    from dash.sensor_map order by channel`;

  // distinct on () is the cheap "newest row per group" in Postgres; it uses
  // the (channel, measured_at desc) index directly rather than sorting the
  // whole table.
  const latest = await sql`select distinct on (channel)
      channel, system, temp, moisture, ec, battery, rssi, measured_at
    from dash.sensor_readings
    order by channel, measured_at desc`;

  let hourly = [];
  if (system) {
    hourly = await sql`select system, channel, hour,
        temp_min, temp_avg, temp_max,
        moist_min, moist_avg, moist_max,
        ec_min, ec_avg, ec_max, samples
      from dash.sensor_hourly
      where system = ${system} and hour >= now() - (${hours} || ' hours')::interval
      order by hour`;
  }

  const now = Date.now();
  return json({
    map,
    latest: latest.map((r) => ({
      ...r,
      // Staleness per sensor, not just per connector: the gateway can be alive
      // and reporting while one battery-powered probe has gone flat.
      age_minutes: Math.round((now - new Date(r.measured_at).getTime()) / 60000),
    })),
    hourly,
    configured: map.length > 0,
  });
});

// PUT → name a channel. Without this every reading lands as "Kanal 3" and the
// data is unreadable to anyone who did not physically pair the sensors.
export const PUT = guarded(
  async (req) => {
    const body = await req.json().catch(() => ({}));
    const channel = Number(body.channel);
    if (!Number.isInteger(channel) || channel < 1 || channel > 16) {
      return err("Kanal må være et heltall mellom 1 og 16.");
    }
    const system = String(body.system || "").trim();
    if (!system) return err("Velg hvilket system kanalen hører til.");

    const sql = db();
    await sql`insert into dash.sensor_map (channel, system, label, active)
      values (${channel}, ${system}, ${String(body.label || "").trim()},
              ${body.active === false ? 0 : 1})
      on conflict (channel) do update set
        system = excluded.system, label = excluded.label, active = excluded.active`;

    // Re-label readings already stored under the placeholder name, so naming a
    // channel late does not leave a split history the charts would show as two
    // separate systems.
    const renamed = await sql`update dash.sensor_readings
      set system = ${system}
      where channel = ${channel} and system = ${"Kanal " + channel}`;
    await sql`update dash.sensor_hourly
      set system = ${system}
      where channel = ${channel} and system = ${"Kanal " + channel}`;

    return json({ ok: true, channel, system, relabelled: renamed.count || 0 });
  },
  { edit: true }
);

export const DELETE = guarded(
  async (req) => {
    const channel = Number(new URL(req.url).searchParams.get("channel"));
    if (!Number.isInteger(channel)) return err("Ugyldig kanal.");
    // Only the mapping is removed. The readings stay — they are measurements
    // that happened, and deleting them to tidy up a naming mistake would be
    // destroying the record.
    await db()`delete from dash.sensor_map where channel = ${channel}`;
    return json({ ok: true });
  },
  { edit: true }
);
