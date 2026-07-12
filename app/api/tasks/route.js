import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

const tagcls = (tag) => (tag === "Avklar" ? "gold" : "");
const PRIOS = ["", "kritisk", "høy", "medium", "lav"];
const prio = (v) => (PRIOS.includes(v) ? v : "");
// Optional ISO due date; anything else is stored as "no due date".
const due = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : "");

const COLS = "id, title, sub, descr, tag, tagcls, who, open, prio, due";

export const POST = guarded(
  async (req) => {
    const body = await req.json();
    const title = String(body.title || "").trim();
    if (!title) return err("Tittel må fylles ut.");
    const sql = db();
    const rows = await sql`insert into dash.tasks (title, sub, descr, tag, tagcls, who, open, prio, due)
      values (${title}, ${String(body.sub || "")}, ${String(body.descr || "")}, ${String(body.tag || "Ny")}, ${tagcls(body.tag)}, ${String(body.who || "")}, 1, ${prio(body.prio)}, ${due(body.due)})
      returning ${sql.unsafe(COLS)}`;
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
        open = ${body.open ? 1 : 0},
        prio = ${prio(body.prio)},
        due = ${due(body.due)}
      where id = ${Number(body.id)}
      returning ${sql.unsafe(COLS)}`;
    if (!rows.length) return err("Oppgaven finnes ikke.", 404);
    return json(rows[0]);
  },
  { edit: true }
);
