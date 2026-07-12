import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { clean, validDate } from "@/lib/readings";

export const runtime = "nodejs";
export const maxDuration = 15;

export const POST = guarded(
  async (req, ctx, user) => {
    const r = clean(await req.json());
    if (!r.system || !validDate(r.date)) return err("System og dato må fylles ut.");
    if (r.temp == null && r.ph == null && r.fukt == null) return err("Fyll ut minst én måling (temp, pH eller fukt).");
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
