// Norwegian Excel CSV: semicolon separator, decimal comma, CRLF, UTF-8 BOM.
// Numbers come from postgres.js as strings, so the stored precision is kept.
// Only numeric columns get the decimal comma (wrap them in num()); text is
// quoted when it needs to be, and a cell that starts like a formula is
// neutralised so a note can never run in Excel.
import { osloStamp } from "./time.js";
import { HYGIENE_LABEL } from "./v2.js";

const SEP = ";";
const EOL = "\r\n";

export const num = (v) => ({ num: v === null || v === undefined ? "" : String(v).replace(".", ",") });
export const utc = (d) => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : "");

function cell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "num" in v) return v.num;
  if (v instanceof Date) return osloStamp(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const line = (cells) => cells.map(cell).join(SEP);

export function csvResponse(name, lines) {
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
// label, a probe's own label, or nothing for an unnamed unassigned channel.
export function csvName(ch) {
  if (!ch) return "";
  if (ch.role === "bed" && ch.system_name) return ch.system_name;
  if (ch.role === "hygiene") return ch.label || HYGIENE_LABEL;
  return ch.label || "";
}

// ts is Europe/Oslo wall-clock (what Excel reads as a date); ts_utc is the
// same instant without the autumn hour that happens twice.
export const SENSOR_HEAD = ["ts", "channel", "system", "soil_temp_c", "soil_moisture_vol_pct", "ec_us_cm", "ts_utc"];

export function sensorLines(rows, channels) {
  const nameBy = new Map(channels.map((c) => [c.channel, csvName(c)]));
  const lines = [SENSOR_HEAD.join(SEP)];
  for (const r of rows) {
    lines.push(line([osloStamp(r.ts), r.channel, nameBy.get(r.channel) ?? "", num(r.soil_temp_c), num(r.soil_moisture_vol_pct), num(r.ec_us_cm), utc(r.ts)]));
  }
  return lines;
}
