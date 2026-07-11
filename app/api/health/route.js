import { db } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// Unauthenticated health check: runs the exact query sequence /api/bootstrap
// uses, but returns only row counts and timings — no data. Lets us verify the
// full DB path in production without a session.
export async function GET() {
  const t0 = Date.now();
  const steps = [];
  const mark = (name) => steps.push({ step: name, at_ms: Date.now() - t0 });
  try {
    const sql = db();
    const counts = {};
    counts.team = (await sql`select count(*)::int as n from dash.team`)[0].n;
    mark("team");
    counts.systems = (await sql`select count(*)::int as n from dash.systems`)[0].n;
    mark("systems");
    counts.readings = (await sql`select count(*)::int as n from dash.readings`)[0].n;
    mark("readings");
    counts.tasks = (await sql`select count(*)::int as n from dash.tasks`)[0].n;
    mark("tasks");
    counts.projects = (await sql`select count(*)::int as n from dash.projects`)[0].n;
    mark("projects");
    counts.checklist = (await sql`select count(*)::int as n from dash.checklist`)[0].n;
    mark("checklist");
    counts.partners = (await sql`select count(*)::int as n from dash.partners`)[0].n;
    mark("partners");
    counts.files = (await sql`select count(*)::int as n from dash.files`)[0].n;
    mark("files");
    counts.targets = (await sql`select count(*)::int as n from dash.targets`)[0].n;
    mark("targets");
    counts.readings_all = (await sql`select count(*)::int as n from dash.readings_all`)[0].n;
    mark("readings_all");
    // Same shape as bootstrap's heaviest query, to mirror real payload size.
    const rows = await sql`select id, rid, system, date, temp, ph, fukt, for_l, notat, avvik, logged_by, source, logged_at, editable
      from dash.readings_all order by date desc, logged_at desc nulls last, id desc`;
    mark("full readings fetch (" + rows.length + " rows)");
    const meta = await sql`select key, value from dash.meta`;
    mark("meta");
    const metaOut = {};
    for (const m of meta) metaOut[m.key] = m.value;
    return json({ ok: true, total_ms: Date.now() - t0, counts, meta: metaOut, newest_reading: rows[0]?.date || null, steps });
  } catch (e) {
    return json({ ok: false, total_ms: Date.now() - t0, error: e.message, steps }, 500);
  }
}
