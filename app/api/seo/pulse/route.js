// Pulse: the agent's stream. Filterable by week, source and severity;
// marking read is the only write.
import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const week = u.searchParams.get("week");
  const source = u.searchParams.get("source");
  const severity = u.searchParams.get("severity");
  const unread = u.searchParams.get("unread") === "1";
  const limit = Math.min(300, Math.max(1, Number(u.searchParams.get("limit")) || 120));
  const sql = db();

  const where = [];
  const vals = [];
  if (week) { vals.push(week); where.push("week = $" + vals.length); }
  if (source) { vals.push(source); where.push("source = $" + vals.length); }
  if (severity) { vals.push(severity); where.push("severity = $" + vals.length); }
  if (unread) where.push("not read");
  vals.push(limit);
  const rows = await sql.unsafe(
    `select id, at, week, source, kind, severity, title, body, data, read from seo.pulse` +
      (where.length ? " where " + where.join(" and ") : "") +
      ` order by at desc, id desc limit $${vals.length}`,
    vals
  );
  const weeks = await sql`select week, count(*)::int as n, count(*) filter (where not read)::int as unread from seo.pulse group by week order by week desc limit 26`;
  const sources = await sql`select source, count(*)::int as n from seo.pulse group by source order by source`;
  return json({ rows, weeks, sources });
});

export const PUT = guarded(async (req) => {
  const body = await req.json().catch(() => ({}));
  const sql = db();
  if (body.all) {
    await sql`update seo.pulse set read = true where not read`;
    return json({ ok: true });
  }
  const ids = (body.ids || []).map(Number).filter(Number.isFinite);
  if (!ids.length) return err("Mangler id.");
  await sql`update seo.pulse set read = ${body.read !== false} where id = any(${ids}::bigint[])`;
  return json({ ok: true, n: ids.length });
}, { edit: true });
