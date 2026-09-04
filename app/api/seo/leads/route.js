import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const STATUSES = ["ny", "kontaktet", "ikke aktuell", "kunde"];

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const status = u.searchParams.get("status");
  const sql = db();
  const rows = status && STATUSES.includes(status)
    ? await sql`select * from seo.leads where status = ${status} order by icp_score desc nulls last, first_seen desc limit 300`
    : await sql`select * from seo.leads order by case status when 'ny' then 0 when 'kontaktet' then 1 when 'kunde' then 2 else 3 end, icp_score desc nulls last, first_seen desc limit 300`;
  const counts = await sql`select status, count(*)::int as n from seo.leads group by status`;
  return json({ leads: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});

export const PUT = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return err("Mangler id.");
  if (!STATUSES.includes(b.status)) return err("Ugyldig status.");
  const [row] = await db()`update seo.leads set status = ${b.status} where id = ${id} returning *`;
  if (!row) return err("Fant ikke leadet.", 404);
  return json(row);
}, { edit: true });
