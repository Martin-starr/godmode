import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { clean, validDate } from "@/lib/readings";

export const runtime = "nodejs";
export const maxDuration = 15;

export const PUT = guarded(
  async (req, { params }) => {
    const r = clean(await req.json());
    if (!r.system || !validDate(r.date)) return err("System og dato må fylles ut.");
    if (r.temp == null && r.ph == null && r.fukt == null) return err("Fyll ut minst én måling (temp, pH eller fukt).");
    const sql = db();
    const rows = await sql`update dash.readings set
        system = ${r.system},
        date = ${r.date},
        temp = ${r.temp},
        ph = ${r.ph},
        fukt = ${r.fukt},
        for_l = ${r.for_l},
        notat = ${r.notat},
        avvik = ${r.avvik}
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
