import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export const PUT = guarded(
  async (req, { params }) => {
    const body = await req.json();
    const sql = db();
    const rows = await sql`update dash.readings set
        system = ${String(body.system || "")},
        date = ${String(body.date || "").slice(0, 10)},
        temp = ${Number(body.temp) || 0},
        ph = ${Number(body.ph) || 0},
        fukt = ${Number(body.fukt) || 0},
        for_l = ${Number(body.for_l) || 0},
        notat = ${String(body.notat || "")},
        avvik = ${body.avvik ? 1 : 0}
      where id = ${Number(params.id)} and source <> 'sheets'
      returning id, system, date, temp, ph, fukt, for_l, notat, avvik, logged_by, source`;
    if (!rows.length) return err("Målingen finnes ikke, eller kommer fra Sheets og kan ikke endres.", 404);
    // Same shape as dash.readings_all rows so client state stays homogeneous.
    const r0 = rows[0];
    return json({ ...r0, id: "d:" + r0.id, rid: r0.id, logged_at: null, editable: true });
  },
  { edit: true }
);

export const DELETE = guarded(
  async (req, { params }) => {
    const sql = db();
    const rows = await sql`delete from dash.readings where id = ${Number(params.id)} and source <> 'sheets' returning id`;
    if (!rows.length) return err("Målingen finnes ikke, eller kommer fra Sheets og kan ikke slettes.", 404);
    return json({ ok: true });
  },
  { edit: true }
);
