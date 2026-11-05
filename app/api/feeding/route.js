import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// Feed volume over a period, read from dash.readings_all so phone entries
// and dashboard entries sit in one list. Each row is one entry (not a
// day total): the Fôring page shows them as cards that open for editing,
// and an edit goes through /api/readings/:rid with every column of the
// row, so the columns the form does not show ride along here.

export const GET = guarded(async (req) => {
  const days = Math.min(Number(new URL(req.url).searchParams.get("days")) || 60, 365);
  const sql = db();
  const since = sql`(current_date - (${days} || ' days')::interval)::text`;

  const rows = await sql`select id, rid, system, date, temp, ph, fukt, for_l, notat, avvik, logged_by, source, editable
    from dash.readings_all
    where for_l > 0 and date >= ${since}
    order by date desc, logged_at desc nulls last, rid desc nulls last`;

  const bySystem = await sql`select system, sum(for_l)::real as liters, max(date) as siste
    from dash.readings_all
    where for_l > 0 and date >= ${since}
    group by system order by system`;

  const [totals] = await sql`select
      coalesce(sum(for_l), 0)::real as total_liters,
      count(*) filter (where for_l > 0)::int as total_entries,
      max(date) as siste_foring
    from dash.readings_all
    where for_l > 0 and date >= ${since}`;

  return json({ days, rows, bySystem, totals });
});
