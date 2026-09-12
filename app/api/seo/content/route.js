// Innhold: the agent's drafts. Martin edits the text and moves the status;
// nothing here publishes anywhere — "publisert" is a note to self after the
// text has been pasted into Wix.
import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const STATUSES = ["utkast", "godkjent", "publisert", "forkastet"];

export const GET = guarded(async () => {
  const rows = await db()`select id, week, kind, keyword, title, body_md, status, created_at, updated_at from seo.content_drafts
    order by case status when 'utkast' then 0 when 'godkjent' then 1 when 'publisert' then 2 else 3 end, created_at desc limit 100`;
  return json({ drafts: rows });
});

export const PUT = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return err("Mangler id.");
  const [orig] = await db()`select * from seo.content_drafts where id = ${id}`;
  if (!orig) return err("Fant ikke utkastet.", 404);
  const status = STATUSES.includes(b.status) ? b.status : orig.status;
  const title = b.title !== undefined ? String(b.title).trim() || orig.title : orig.title;
  const body_md = b.body_md !== undefined ? String(b.body_md) : orig.body_md;
  const [row] = await db()`update seo.content_drafts set status = ${status}, title = ${title}, body_md = ${body_md}, updated_at = now() where id = ${id}
    returning id, week, kind, keyword, title, body_md, status, created_at, updated_at`;
  return json(row);
}, { edit: true });
