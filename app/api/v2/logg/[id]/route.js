import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { UUID } from "@/lib/v2";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

// Undo for a fresh entry: only rows the new Logg wrote, and only for ten
// minutes after they were written. Everything older stays as the record.
export const DELETE = guarded(async (req, { params }) => {
  const id = String(params.id || "");
  if (!UUID.test(id)) return err("Ugyldig id.", 400);
  const sql = db();
  const rows = await sql`delete from public.logs
    where id = ${id} and source = 'mobil-v2' and logged_at > now() - interval '10 minutes'
    returning id`;
  if (!rows.length) return err("Kan ikke slettes lenger.", 404);
  return json({ ok: true });
}, { edit: true });
