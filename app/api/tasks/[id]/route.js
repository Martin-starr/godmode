import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export const DELETE = guarded(
  async (req, { params }) => {
    const sql = db();
    await sql`delete from dash.tasks where id = ${Number(params.id)}`;
    return json({ ok: true });
  },
  { edit: true }
);
