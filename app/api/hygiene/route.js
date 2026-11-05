import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { parseLoggerExport, MIN_PROBES, FAULT, R_FAULT } from "@/lib/hygiene";
import { hygieneTargets, evaluateImport } from "@/lib/hygiene-record";

// How many imports get the full minute-by-minute evaluation per page load.
// Each one is a query of up to ~40k rows; older imports are listed without
// a chart so the page stays well inside the watchdog.
const EVAL_MAX = 8;

export const runtime = "nodejs";
export const maxDuration = 25;

// Every import, newest first, the newest `limit` of them evaluated (the
// Brief asks for one).
async function payload(sql, limit) {
  const imports = await sql`select id, filename, imported_at, imported_by, row_count, note
    from dash.hygiene_imports order by id desc`;
  const { minTemp, minMinutes } = await hygieneTargets(sql);
  const out = [];
  for (const imp of imports) {
    out.push(out.length < limit ? await evaluateImport(sql, imp, minTemp, minMinutes) : { ...imp, analysed: false });
  }
  return { minTemp, minMinutes, minProbes: MIN_PROBES, imports: out };
}

export const GET = guarded(async (req) => {
  const sql = db();
  const limit = Math.min(EVAL_MAX, Math.max(1, Math.round(Number(new URL(req.url).searchParams.get("limit"))) || EVAL_MAX));
  return json(await payload(sql, limit));
});

export const POST = guarded(
  async (req, ctx, user) => {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file !== "object") return err("Ingen fil mottatt.");
    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    let points;
    let channels;
    try {
      ({ points, channels } = parseLoggerExport(text));
    } catch (e) {
      return err(e.message);
    }
    // A real Center 374 export is thousands of points × up to 4 channels.
    // Row-by-row inserts through the pooler took minutes and tripped the 12s
    // watchdog halfway through, leaving a corrupt partial import displayed as
    // the current §19 record. One transaction + unnest keeps it to a single
    // round-trip and makes the import all-or-nothing.
    // A cell the logger could not fill ("----", "OL", empty) is the logger
    // reporting a probe fault. It is stored as one (no temperature, with the
    // reason), so the §19 check sets that probe aside around it instead of
    // bridging the hole.
    const ts = [];
    const ch = [];
    const temp = [];
    const excluded = [];
    for (const p of points) {
      for (let i = 0; i < p.temps.length; i++) {
        ts.push(new Date(p.ts).toISOString());
        ch.push(channels[i]);
        const fault = p.temps[i] === FAULT;
        temp.push(fault ? null : p.temps[i]);
        excluded.push(fault ? R_FAULT : null);
      }
    }
    if (!ts.length) return err("Filen inneholdt ingen gyldige temperaturmålinger.");
    const sql = db();
    // Chunked so no single statement risks the 8s statement_timeout on a
    // multi-day export; still one transaction, so the import is all-or-nothing.
    const CHUNK = 5000;
    await sql.begin(async (tx) => {
      const imp = (await tx`insert into dash.hygiene_imports (filename, imported_by, row_count, note)
        values (${file.name}, ${user.name}, ${points.length}, '')
        returning id`)[0];
      for (let i = 0; i < ts.length; i += CHUNK) {
        await tx`insert into dash.hygiene_readings (import_id, ts, ch, temp, excluded)
          select ${imp.id}, t::timestamptz, c, tv, ex
          from unnest(${ts.slice(i, i + CHUNK)}::text[], ${ch.slice(i, i + CHUNK)}::int[], ${temp.slice(i, i + CHUNK)}::real[], ${excluded.slice(i, i + CHUNK)}::text[]) as u(t, c, tv, ex)`;
      }
    });
    return json({ ok: true, rows: points.length });
  },
  // watchdog:false — a big import legitimately outlives the 12s deadline; a
  // watchdog trip mid-transaction would reset the pool without cancelling
  // the tx, so a "failed" import could land anyway and a retry duplicate it.
  { edit: true, watchdog: false }
);
