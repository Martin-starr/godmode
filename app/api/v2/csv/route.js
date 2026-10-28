import { db } from "@/lib/db";
import { err, guarded } from "@/lib/http";
import { listChannels, HYGIENE_LABEL, UUID, parseRange } from "@/lib/v2";
import { dayStart, dayEnd, osloStamp } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Norwegian Excel CSV: semicolon separator, decimal comma, CRLF, UTF-8 BOM.
// Numbers come from postgres.js as strings, so the stored precision is kept.
// Only numeric columns get the decimal comma (wrap them in num()); text is
// quoted when it needs to be, and a cell that starts like a formula is
// neutralised so a note can never run in Excel.
const SEP = ";";
const EOL = "\r\n";

const num = (v) => ({ num: v === null || v === undefined ? "" : String(v).replace(".", ",") });
const utc = (d) => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : "");

function cell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "num" in v) return v.num;
  if (v instanceof Date) return osloStamp(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const line = (cells) => cells.map(cell).join(SEP);

function csvResponse(name, lines) {
  const body = "\uFEFF" + lines.join(EOL) + EOL;
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

// ts is Europe/Oslo wall-clock (what Excel reads as a date); ts_utc is the
// same instant without the autumn hour that happens twice.
const SENSOR_HEAD = ["ts", "channel", "system", "soil_temp_c", "soil_moisture_vol_pct", "ec_us_cm", "ts_utc"];
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
    const nameBy = new Map(channels.map((c) => [c.channel, csvName(c)]));
    const chFilter = onlyChannel === null ? sql`` : sql`and channel = ${onlyChannel}`;
    const rows = await sql`select ts, channel, soil_temp_c, soil_moisture_vol_pct, ec_us_cm
      from public.sensor_readings
      where channel >= 1 and ts >= ${start} and ts <= ${end} ${chFilter}
      order by ts, channel`;
    const lines = [SENSOR_HEAD.join(SEP)];
    for (const r of rows) {
      lines.push(line([osloStamp(r.ts), r.channel, nameBy.get(r.channel) ?? "", num(r.soil_temp_c), num(r.soil_moisture_vol_pct), num(r.ec_us_cm), utc(r.ts)]));
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
      lines.push(line([r.id, r.system, r.date, num(r.temperature), num(r.moisture), num(r.ph), r.notes, r.created_by, r.created_at,
        num(r.feed_amount_liters), r.source, r.logged_at, num(r.harvest_liters), num(r.moisture_handheld), utc(r.created_at), utc(r.logged_at)]));
    }
  }
  return csvResponse(`verminord_logg_${from}_${to}.csv`, lines);
});
