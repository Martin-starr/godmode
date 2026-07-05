import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export const DELETE = guarded(
  async (req, { params }) => {
    const sql = db();
    const id = Number(params.id);
    await sql`delete from dash.checklist where project_id = ${id}`;
    await sql`delete from dash.projects where id = ${id}`;
    return json({ ok: true });
  },
  { edit: true }
);
