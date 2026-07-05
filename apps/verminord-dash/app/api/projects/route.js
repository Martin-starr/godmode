import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export const POST = guarded(
  async (req, ctx, user) => {
    const body = await req.json();
    const col = ["Planlagt", "Pågår", "Fullført"].includes(body.col) ? body.col : "Planlagt";
    const sql = db();
    const rows = await sql`insert into dash.projects (col, tag, title, descr, who, sort)
      values (${col}, 'Nytt', 'Nytt prosjekt', '', ${String(body.who || user.name)},
              (select coalesce(max(sort), -1) + 1 from dash.projects))
      returning id, col, tag, title, descr, who`;
    return json(rows[0]);
  },
  { edit: true }
);

export const PUT = guarded(
  async (req) => {
    const body = await req.json();
    const sql = db();
    const rows = await sql`update dash.projects set
        col = ${String(body.col || "Planlagt")},
        tag = ${String(body.tag || "")},
        title = ${String(body.title || "")},
        descr = ${String(body.descr || "")},
        who = ${String(body.who || "")}
      where id = ${Number(body.id)}
      returning id, col, tag, title, descr, who`;
    if (!rows.length) return err("Prosjektet finnes ikke.", 404);
    return json(rows[0]);
  },
  { edit: true }
);
