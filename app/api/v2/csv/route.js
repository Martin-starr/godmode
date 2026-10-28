import { db } from "@/lib/db";
import { err, guarded } from "@/lib/http";
import { listChannels, HYGIENE_LABEL, UUID } from "@/lib/v2";
import { DATE_ONLY, dayStart, dayEnd, addDaysIso, todayOslo, isoDateOslo, osloStamp } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Same range rules as /api/v2/data (kept in step by hand: route modules
// may only export handlers and config, so the helper lives in both).
const SENSOR_START = "2026-09-15";
const FIRST_LOG = "2025-07-07";
const MAX_DAYS = 400;

function parseRange(sp) {
  const rawFrom = sp.get("from") || SENSOR_START;
  const rawTo = sp.get("to") || todayOslo();
  if (!DATE_ONLY.test(rawFrom) || !DATE_ONLY.test(rawTo)) return { error: "Datoene må være på formen ÅÅÅÅ-MM-DD." };
  if (isoDateOslo(dayStart(rawFrom)) !== rawFrom || isoDateOslo(dayStart(rawTo)) !== rawTo) return { error: "Ugyldig dato." };
  if (rawFrom > rawTo) return { error: "Fra-datoen må være før Til-datoen." };
  const today = todayOslo();
  const to = rawTo > today ? today : rawTo;
  const cap = addDaysIso(to, -MAX_DAYS);
  const floor = cap < FIRST_LOG ? cap : FIRST_LOG;
  let from = rawFrom < floor ? floor : rawFrom;
  if (from > to) from = to;
  return { from, to };
}

// Norwegian Excel CSV: semicolon separator, decimal comma, CRLF, UTF-8 BOM.
// Numbers come from postgres.js as strings, so the stored precision is kept.
const SEP = ";";
const EOL = "\r\n";

function cell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  if (v instanceof Date) return osloStamp(v);
  let s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) return s.replace(".", ",");
  if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const line = (cells) => cells.map(cell).join(SEP);

function csvResponse(name, lines) {
  const body = "﻿" + lines.join(EOL) + EOL;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

// What the sensor file calls each channel: the bed's name, the hygiene
// label, or nothing at all for a channel nobody has assigned yet.
function csvName(ch) {
  if (!ch) return "";
  if (ch.role === "bed" && ch.system_name) return ch.system_name;
  if (ch.role === "hygiene") return ch.label || HYGIENE_LABEL;
  return "";
}

const SENSOR_HEAD = ["ts", "channel", "system", "soil_temp_c", "soil_moisture_vol_pct", "ec_us_cm"];
const LOG_HEAD = ["id", "system", "date", "temperature", "moisture", "ph", "notes", "created_by", "created_at",
  "feed_amount_liters", "source", "logged_at", "harvest_liters", "moisture_handheld"];

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
    const nameBy = new Map(channels.map((c) => [c.channel, csvName(c)]));
    const chFilter = onlyChannel === null ? sql`` : sql`and channel = ${onlyChannel}`;
    const rows = await sql`select ts, channel, soil_temp_c, soil_moisture_vol_pct, ec_us_cm
      from public.sensor_readings
      where channel >= 1 and ts >= ${start} and ts <= ${end} ${chFilter}
      order by ts, channel`;
    const lines = [SENSOR_HEAD.join(SEP)];
    for (const r of rows) {
      lines.push(line([osloStamp(r.ts), r.channel, nameBy.get(r.channel) ?? "", r.soil_temp_c, r.soil_moisture_vol_pct, r.ec_us_cm]));
    }
    return csvResponse(`verminord_sensor_${from}_${to}.csv`, lines);
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
      lines.push(line([r.id, r.system, r.date, r.temperature, r.moisture, r.ph, r.notes, r.created_by, r.created_at,
        r.feed_amount_liters, r.source, r.logged_at, r.harvest_liters, r.moisture_handheld]));
    }
  }
  return csvResponse(`verminord_logg_${from}_${to}.csv`, lines);
});
