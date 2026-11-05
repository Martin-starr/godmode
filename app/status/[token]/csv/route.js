import { db } from "@/lib/db";
import { listChannels } from "@/lib/v2";
import { sensorLines, csvResponse } from "@/lib/csv";
import { isoDateOslo, addDaysIso, dayStart } from "@/lib/time";
import { validToken } from "@/lib/status-link";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const DAYS = 30;

// The last 30 days of raw sensor readings for whoever holds a live link.
export async function GET(req, { params }) {
  const sql = db();
  if (!(await validToken(sql, params.token))) return new Response("Not found", { status: 404 });
  const today = isoDateOslo();
  const from = addDaysIso(today, -(DAYS - 1));
  const channels = await listChannels(sql);
  const rows = await sql`select ts, channel, soil_temp_c, soil_moisture_vol_pct, ec_us_cm
    from public.sensor_readings
    where channel >= 1 and ts >= ${dayStart(from)}
    order by ts, channel`;
  return csvResponse(`verminord_sensor_${from}_${today}.csv`, sensorLines(rows, channels));
}
