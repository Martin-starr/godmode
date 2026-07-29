import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

// Ticking off the daily routine.
//
// dash.routine_runs and dash.routine_ticks were created by migration 005 and
// had no code behind them at all, so the plan on Brief and the UKE tab was a
// poster: it showed what to do and recorded nothing about whether it happened.
// For a plan whose own first rule is "Logg hver dag — loggen er beviset overfor
// inspeksjonen", that is the wrong half to have built.
//
// Model: one run per routine per DAY, keyed on the actual date rather than the
// Monday of the week. Both the daily frame and the weekday rows are therefore
// ticked per day, which is the granularity an inspector asks about ("what was
// done on the 14th?"). Ticks live on the run, never on the template, so closing
// today never mutates the plan and last week stays exactly as it was signed off.

function isoDate(s) {
  const d = s ? new Date(s) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// 1=Mon..7=Sun, matching dash.routine_items.weekday.
function isoWeekday(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

export const GET = guarded(async (req) => {
  const date = isoDate(req.nextUrl?.searchParams?.get("date") || new URL(req.url).searchParams.get("date"));
  if (!date) return err("Ugyldig dato.");
  const dow = isoWeekday(date);
  const sql = db();

  // Sequential — see lib/db.js on the transaction pooler.
  const items = await sql`select i.id, i.routine_id, i.block, i.text, i.detail, i.weekday,
      i.start_min, i.end_min, i.drop_rank, i.never_drop, r.cadence, r.name as routine
    from dash.routine_items i join dash.routines r on r.id = i.routine_id
    where r.active = 1 and (i.weekday is null or i.weekday = ${dow})
    order by i.weekday nulls first, i.sort`;

  const ticks = await sql`select t.item_id, t.done_at, t.done_by
    from dash.routine_ticks t
    join dash.routine_runs run on run.id = t.run_id
    where run.period_start = ${date}`;

  const done = new Map(ticks.map((t) => [Number(t.item_id), t]));
  const withState = items.map((i) => ({
    ...i,
    done: done.has(Number(i.id)),
    done_at: done.get(Number(i.id))?.done_at || null,
    done_by: done.get(Number(i.id))?.done_by || null,
  }));

  // "Kuttes aldri" is the number that matters — the rest of the frame is time
  // structure, and counting PAUSE as an achievement would make coverage
  // meaningless.
  const required = withState.filter((i) => i.never_drop);
  return json({
    date,
    weekday: dow,
    items: withState,
    coverage: {
      required_total: required.length,
      required_done: required.filter((i) => i.done).length,
      total: withState.length,
      done: withState.filter((i) => i.done).length,
    },
  });
});

// Tick or untick one item for one date.
export const POST = guarded(
  async (req, ctx, user) => {
    const body = await req.json().catch(() => ({}));
    const itemId = Number(body.item_id);
    const date = isoDate(body.date);
    if (!Number.isInteger(itemId)) return err("Ugyldig punkt.");
    if (!date) return err("Ugyldig dato.");

    const sql = db();
    const [item] = await sql`select id, routine_id from dash.routine_items where id = ${itemId}`;
    if (!item) return err("Punktet finnes ikke.", 404);

    if (body.done === false) {
      // Untick. The run row is left in place — an emptied run is still the
      // record that the day existed and was worked on.
      await sql`delete from dash.routine_ticks t
        using dash.routine_runs run
        where t.run_id = run.id and t.item_id = ${itemId}
          and run.routine_id = ${item.routine_id} and run.period_start = ${date}`;
      return json({ ok: true, item_id: itemId, done: false });
    }

    // Upsert the run, then the tick. on conflict do update (rather than do
    // nothing) so RETURNING always yields the row — do nothing returns zero
    // rows on a conflict and the id would come back undefined.
    const [run] = await sql`insert into dash.routine_runs (routine_id, period_start)
      values (${item.routine_id}, ${date})
      on conflict (routine_id, period_start)
        do update set period_start = excluded.period_start
      returning id`;

    await sql`insert into dash.routine_ticks (run_id, item_id, done_by)
      values (${run.id}, ${itemId}, ${user.name || ""})
      on conflict (run_id, item_id) do update set done_at = now(), done_by = excluded.done_by`;

    return json({ ok: true, item_id: itemId, done: true, done_by: user.name || "" });
  },
  { edit: true }
);
