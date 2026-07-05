import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

// The frontend uses POST both for creating checklist items ({project_id, text})
// and for updating them ({id, text} or {id, done}).
export const POST = guarded(
  async (req) => {
    const body = await req.json();
    const sql = db();
    if (body.id) {
      const id = Number(body.id);
      if (body.text !== undefined) {
        const rows = await sql`update dash.checklist set text = ${String(body.text)} where id = ${id}
          returning id, project_id, text, done`;
        if (!rows.length) return err("Punktet finnes ikke.", 404);
        return json(rows[0]);
      }
      const rows = await sql`update dash.checklist set done = ${body.done ? 1 : 0} where id = ${id}
        returning id, project_id, text, done`;
      if (!rows.length) return err("Punktet finnes ikke.", 404);
      return json(rows[0]);
    }
    const projectId = Number(body.project_id);
    if (!projectId) return err("project_id mangler.");
    const rows = await sql`insert into dash.checklist (project_id, text, done, sort)
      values (${projectId}, ${String(body.text || "Nytt punkt")}, 0,
              (select coalesce(max(sort), -1) + 1 from dash.checklist where project_id = ${projectId}))
      returning id, project_id, text, done`;
    return json(rows[0]);
  },
  { edit: true }
);
