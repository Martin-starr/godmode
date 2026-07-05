import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

const tagcls = (status) => (status === "Avklar" ? "gold" : status === "Pågår" ? "navy" : "");

export const POST = guarded(
  async (req, ctx, user) => {
    const body = await req.json().catch(() => ({}));
    const sql = db();
    const rows = await sql`insert into dash.partners (name, type, status, tagcls, next_step, who)
      values ('Ny partner', '', 'Dialog', ${tagcls("Dialog")}, '', ${String(body.who || user.name)})
      returning id, name, type, status, tagcls, next_step, who`;
    return json(rows[0]);
  },
  { edit: true }
);

export const PUT = guarded(
  async (req) => {
    const body = await req.json();
    const sql = db();
    const rows = await sql`update dash.partners set
        name = ${String(body.name || "")},
        type = ${String(body.type || "")},
        status = ${String(body.status || "Dialog")},
        tagcls = ${tagcls(body.status)},
        next_step = ${String(body.next_step || "")},
        who = ${String(body.who || "")}
      where id = ${Number(body.id)}
      returning id, name, type, status, tagcls, next_step, who`;
    if (!rows.length) return err("Partneren finnes ikke.", 404);
    return json(rows[0]);
  },
  { edit: true }
);
