import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const COLS = "id, batch_code, system, started_at, harvested_at, volume_l, weight_kg, moisture_pct, notes, status, created_by, created_at";

export const GET = guarded(async () => {
  const sql = db();
  const rows = await sql`select ${sql.unsafe(COLS)} from dash.batches order by coalesce(harvested_at, started_at) desc nulls last, id desc`;
  return json({ batches: rows });
});

export const POST = guarded(
  async (req, ctx, user) => {
    const body = await req.json().catch(() => ({}));
    const system = String(body.system || "").trim();
    if (!system) return err("Velg hvilket system batchen kommer fra.");

    const sql = db();
    const rows = await sql`insert into dash.batches
        (batch_code, system, started_at, harvested_at, volume_l, weight_kg, moisture_pct, notes, status, created_by)
      values (
        ${String(body.batch_code || "").trim()}, ${system},
        ${body.started_at || null}, ${body.harvested_at || null},
        ${body.volume_l != null ? Number(body.volume_l) : null},
        ${body.weight_kg != null ? Number(body.weight_kg) : null},
        ${body.moisture_pct != null ? Number(body.moisture_pct) : null},
        ${String(body.notes || "").trim()},
        ${body.harvested_at ? "høstet" : "aktiv"},
        ${user.name || ""}
      )
      returning ${sql.unsafe(COLS)}`;
    return json(rows[0]);
  },
  { edit: true }
);

export const PUT = guarded(
  async (req) => {
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return err("Mangler id.");
    const sql = db();
    const rows = await sql`update dash.batches set
        batch_code = ${String(body.batch_code || "").trim()},
        system = ${String(body.system || "").trim()},
        started_at = ${body.started_at || null},
        harvested_at = ${body.harvested_at || null},
        volume_l = ${body.volume_l != null && body.volume_l !== "" ? Number(body.volume_l) : null},
        weight_kg = ${body.weight_kg != null && body.weight_kg !== "" ? Number(body.weight_kg) : null},
        moisture_pct = ${body.moisture_pct != null && body.moisture_pct !== "" ? Number(body.moisture_pct) : null},
        notes = ${String(body.notes || "").trim()},
        status = ${String(body.status || "aktiv")}
      where id = ${id}
      returning ${sql.unsafe(COLS)}`;
    if (!rows.length) return err("Fant ikke batchen.", 404);
    return json(rows[0]);
  },
  { edit: true }
);

export const DELETE = guarded(
  async (req) => {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) return err("Mangler id.");
    // Batches are a work-in-progress record, not a compliance log (that's
    // dash.readings_archive / dash.logs_archive, both immutable). A mistyped
    // test row here should just be deletable.
    await db()`delete from dash.batches where id = ${id}`;
    return json({ ok: true });
  },
  { edit: true }
);
