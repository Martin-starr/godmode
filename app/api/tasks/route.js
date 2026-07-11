import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

const tagcls = (tag) => (tag === "Avklar" ? "gold" : "");

export const POST = guarded(
  async (req) => {
    const body = await req.json();
    const title = String(body.title || "").trim();
    if (!title) return err("Tittel må fylles ut.");
    const sql = db();
    const rows = await sql`insert into dash.tasks (title, sub, descr, tag, tagcls, who, open)
      values (${title}, ${String(body.sub || "")}, ${String(body.descr || "")}, ${String(body.tag || "Ny")}, ${tagcls(body.tag)}, ${String(body.who || "")}, 1)
      returning id, title, sub, descr, tag, tagcls, who, open`;
    return json(rows[0]);
  },
  { edit: true }
);

export const PUT = guarded(
  async (req) => {
    const body = await req.json();
    const sql = db();
    const rows = await sql`update dash.tasks set
        title = ${String(body.title || "")},
        sub = ${String(body.sub || "")},
        descr = ${String(body.descr || "")},
        tag = ${String(body.tag || "Ny")},
        tagcls = ${tagcls(body.tag)},
        who = ${String(body.who || "")},
        open = ${body.open ? 1 : 0}
      where id = ${Number(body.id)}
      returning id, title, sub, descr, tag, tagcls, who, open`;
    if (!rows.length) return err("Oppgaven finnes ikke.", 404);
    return json(rows[0]);
  },
  { edit: true }
);
