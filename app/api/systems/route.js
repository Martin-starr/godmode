import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export const POST = guarded(
  async (req) => {
    const body = await req.json();
    const id = String(body.id || "").trim();
    if (!id) return err("Navn mangler.");
    const sql = db();
    const exists = await sql`select 1 from dash.systems where id = ${id}`;
    if (exists.length) return err("Systemet finnes allerede.");
    const rows = await sql`insert into dash.systems (id, status, sort)
      values (${id}, 'I drift', (select coalesce(max(sort), -1) + 1 from dash.systems))
      returning id, status`;
    // A manual re-add revokes any earlier delete-tombstone for this name.
    const hiddenRaw = (await sql`select value from dash.meta where key = 'systems_hidden'`)[0]?.value;
    let hidden = [];
    try { hidden = JSON.parse(hiddenRaw || "[]"); } catch {}
    if (hidden.includes(id)) {
      await sql`update dash.meta set value = ${JSON.stringify(hidden.filter((s) => s !== id))} where key = 'systems_hidden'`;
    }
    return json(rows[0]);
  },
  { edit: true }
);

export const PUT = guarded(
  async (req) => {
    const body = await req.json();
    const id = String(body.id || "");
    const newId = String(body.newId || id).trim() || id;
    const status = body.status === "Tatt ut" ? "Tatt ut" : "I drift";
    const sql = db();
    if (newId !== id) {
      const exists = await sql`select 1 from dash.systems where id = ${newId}`;
      if (exists.length) return err("Systemet «" + newId + "» finnes allerede.");
      // Live phone-logger rows keep the old name (public.logs is read-only
      // from here), so a rename would split the history in two and the old
      // name would come back as a ghost system. Block it with an explanation.
      const appRows = await sql`select 1 from dash.readings_all where system = ${id} and source = 'app' limit 1`;
      if (appRows.length) {
        return err("«" + id + "» har målinger fra telefon-appen og kan ikke gis nytt navn her. Endre navnet i loggføringsappen (log.verminord.app) først — ellers splittes historikken.", 409);
      }
    }
    const rows = await sql`update dash.systems set id = ${newId}, status = ${status} where id = ${id} returning id, status`;
    if (!rows.length) return err("Systemet finnes ikke.", 404);
    if (newId !== id) {
      await sql`update dash.readings set system = ${newId} where system = ${id}`;
    }
    return json(rows[0]);
  },
  { edit: true }
);
