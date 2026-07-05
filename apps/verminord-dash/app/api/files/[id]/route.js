import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 25;

export const GET = guarded(async (req, { params }) => {
  const sql = db();
  const rows = await sql`select name, content from dash.files where id = ${Number(params.id)}`;
  if (!rows.length || !rows[0].content) return err("Filen finnes ikke.", 404);
  return new Response(rows[0].content, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(rows[0].name)}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
});

export const PUT = guarded(
  async (req, { params }) => {
    const body = await req.json();
    const sql = db();
    const rows = await sql`update dash.files set
        name = ${String(body.name || "")},
        cat = ${String(body.cat || "SOP")},
        ver = ${String(body.ver || "")}
      where id = ${Number(params.id)}
      returning id, name, cat, ver, date, size, (content is not null) as stored`;
    if (!rows.length) return err("Filen finnes ikke.", 404);
    return json(rows[0]);
  },
  { edit: true }
);

export const DELETE = guarded(
  async (req, { params }) => {
    const sql = db();
    await sql`delete from dash.files where id = ${Number(params.id)}`;
    return json({ ok: true });
  },
  { edit: true }
);
