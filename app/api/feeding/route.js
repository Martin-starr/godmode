import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// Read-only report over feed volume already captured in dash.readings_all.
//
// No new logging surface here on purpose — feed amount is entered on the same
// row as pH/temp/moisture, by design (one trip to the bed, one entry). This
// route only aggregates what already exists into something a person can read
// at a glance, instead of it sitting unreadable inside the raw log table.

export const GET = guarded(async (req) => {
  const days = Math.min(Number(new URL(req.url).searchParams.get("days")) || 60, 365);
  const sql = db();

  const rows = await sql`select date, system, sum(for_l)::real as liters, count(*)::int as entries
    from dash.readings_all
    where for_l > 0 and date >= (current_date - (${days} || ' days')::interval)::text
    group by date, system
    order by date desc, system`;

  const bySystem = await sql`select system, sum(for_l)::real as liters, max(date) as siste
    from dash.readings_all
    where for_l > 0 and date >= (current_date - (${days} || ' days')::interval)::text
    group by system order by system`;

  const [totals] = await sql`select
      coalesce(sum(for_l), 0)::real as total_liters,
      count(*) filter (where for_l > 0)::int as total_entries,
      max(date) as siste_foring
    from dash.readings_all
    where for_l > 0 and date >= (current_date - (${days} || ' days')::interval)::text`;

  return json({ days, rows, bySystem, totals });
});
