import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const week = u.searchParams.get("week");
  const sql = db();
  if (week) {
    const [row] = await sql`select week, generated_at, model, summary_md, brief, sent_at from seo.briefs where week = ${week}`;
    if (!row) return err("Fant ingen brief for uke " + week + ".", 404);
    return json({ week: row.week, generated_at: row.generated_at, model: row.model, summary_md: row.summary_md, sent_at: row.sent_at, content: row.brief?.brief || null, analysis: row.brief?.analysis || null });
  }
  const rows = await sql`select week, brief->'brief'->>'headline' as headline, generated_at, sent_at from seo.briefs
    where summary_md is not null order by week desc limit 52`;
  return json({ weeks: rows });
});
