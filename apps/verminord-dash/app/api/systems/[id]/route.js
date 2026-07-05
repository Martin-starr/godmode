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
    return json({ ok: true });
  },
  { edit: true }
);
