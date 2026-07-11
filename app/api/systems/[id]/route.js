import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export const DELETE = guarded(
  async (req, { params }) => {
    const id = decodeURIComponent(params.id);
    const sql = db();
    const rows = await sql`delete from dash.systems where id = ${id} returning id`;
    if (!rows.length) return err("Systemet finnes ikke.", 404);
    // Readings are kept as history; they are only shown for active systems.
    // Tombstone the name so bootstrap's auto-add doesn't resurrect it on the
    // next page load (a manual re-add under Innstillinger clears it again).
    const hiddenRaw = (await sql`select value from dash.meta where key = 'systems_hidden'`)[0]?.value;
    let hidden = [];
    try { hidden = JSON.parse(hiddenRaw || "[]"); } catch {}
    if (!hidden.includes(id)) hidden.push(id);
    await sql`insert into dash.meta (key, value) values ('systems_hidden', ${JSON.stringify(hidden)})
      on conflict (key) do update set value = excluded.value`;
    return json({ ok: true });
  },
  { edit: true }
);
