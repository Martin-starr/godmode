// SEO tab, first screen: the latest brief, the KPI row, the health of every
// collector and how many Pulse notices are unread. One round trip, all
// sequential — the seo tables are small and the watchdog is 12 s.
import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";
import { classify } from "@/lib/integrations";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export const GET = guarded(async () => {
  const sql = db();
  const [brief] = await sql`select week, generated_at, model, summary_md, brief, sent_at from seo.briefs
    where summary_md is not null order by week desc limit 1`;
  const [latestAnalysis] = await sql`select week, brief->'analysis' as analysis from seo.briefs
    where brief ? 'analysis' order by week desc limit 1`;
  const integrations = await sql`select key, label, expected_interval_min, last_ok_at, last_error, last_error_at, consecutive_failures, muted_until
    from dash.integrations where key like 'seo:%' order by key`;
  const [unread] = await sql`select count(*)::int as n from seo.pulse where not read`;
  const runs = await sql`select distinct on (step) step, week, status, started_at, finished_at, error from seo.runs order by step, started_at desc`;
  const [counts] = await sql`select
      (select count(*)::int from seo.keywords where active) as keywords,
      (select count(*)::int from seo.competitors where active) as competitors,
      (select count(*)::int from seo.ai_prompts where active) as prompts,
      (select count(*)::int from seo.leads where status = 'ny') as leads_new,
      (select count(*)::int from seo.content_drafts where status = 'utkast') as drafts,
      (select count(*)::int from seo.gsc_daily) as gsc_rows`;
  const weeks = await sql`select week, brief->'brief'->>'headline' as headline, generated_at, sent_at from seo.briefs
    where summary_md is not null order by week desc limit 26`;

  return json({
    brief: brief ? { week: brief.week, generated_at: brief.generated_at, model: brief.model, summary_md: brief.summary_md, sent_at: brief.sent_at, content: brief.brief?.brief || null } : null,
    analysis: latestAnalysis ? { week: latestAnalysis.week, ...latestAnalysis.analysis } : null,
    integrations: integrations.map((r) => ({ ...r, status: classify(r) })),
    unread: unread?.n || 0,
    runs,
    counts,
    weeks,
  });
});
