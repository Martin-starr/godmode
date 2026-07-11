import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

function clean(body) {
  return {
    system: String(body.system || "").trim(),
    date: String(body.date || "").slice(0, 10),
    temp: Number(body.temp) || 0,
    ph: Number(body.ph) || 0,
    fukt: Number(body.fukt) || 0,
    for_l: Number(body.for_l) || 0,
    notat: String(body.notat || ""),
    avvik: body.avvik ? 1 : 0,
  };
}

export const POST = guarded(
  async (req, ctx, user) => {
    const r = clean(await req.json());
    if (!r.system || !r.date) return err("System og dato må fylles ut.");
    const sql = db();
    const rows = await sql`insert into dash.readings (system, date, temp, ph, fukt, for_l, notat, avvik, logged_by, source)
      values (${r.system}, ${r.date}, ${r.temp}, ${r.ph}, ${r.fukt}, ${r.for_l}, ${r.notat}, ${r.avvik}, ${user.name}, '')
      returning id, system, date, temp, ph, fukt, for_l, notat, avvik, logged_by, source`;
    // Same shape as dash.readings_all rows so client state stays homogeneous.
    const r0 = rows[0];
    return json({ ...r0, id: "d:" + r0.id, rid: r0.id, logged_at: null, editable: true });
  },
  { edit: true }
);
