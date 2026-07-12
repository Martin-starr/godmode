import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export const DELETE = guarded(
  async (req, { params }) => {
    const sql = db();
    const id = Number(params.id);
    // One transaction: an interrupted delete must not leave an empty import
    // shell rendered as the newest §19 record.
    await sql.begin(async (tx) => {
      await tx`delete from dash.hygiene_readings where import_id = ${id}`;
      await tx`delete from dash.hygiene_imports where id = ${id}`;
    });
    return json({ ok: true });
  },
  { edit: true }
);
