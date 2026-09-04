// Søk: the Search Console view. Daily totals for the chart, the tracked
// keywords with their position week by week (own rank in the SERP snapshot
// and the GSC average), and the decay/opportunity lists straight from the
// latest analysis so the tab and the e-mail agree.
import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const RANGE_DAYS = { "7D": 7, "28D": 28, "90D": 90, ALL: 3650 };

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const days = RANGE_DAYS[u.searchParams.get("range") || "28D"] || 28;
  const sql = db();

  const daily = await sql`select date, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
      case when sum(impressions) > 0 then round((sum(position * impressions) / sum(impressions))::numeric, 1) end as position
    from seo.gsc_daily where page = '*' and query = '*' and date >= current_date - ${days}::int
    group by date order by date`;
  const keywords = await sql`select keyword, cluster, priority, active from seo.keywords order by priority, keyword`;
  const own = await sql`select site_url from seo.sites`;
  const ownDomains = own.map((r) => r.site_url).concat(["verminord.com", "verminord.no"]);
  const serp = await sql`select keyword, week, min(rank)::int as rank from seo.serp_snapshots
    where kind = 'organisk' and domain = any(${ownDomains}::text[])
    group by keyword, week order by week`;
  const serpWeeks = await sql`select distinct week from seo.serp_snapshots order by week desc limit 12`;
  const gscByQuery = await sql`select query, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
      case when sum(impressions) > 0 then round((sum(position * impressions) / sum(impressions))::numeric, 1) end as position
    from seo.gsc_daily where page = '*' and query <> '*' and date >= current_date - 31
    group by query order by clicks desc, impressions desc limit 60`;
  const topPages = await sql`select page, sum(clicks)::int as clicks, sum(impressions)::int as impressions
    from seo.gsc_daily where query = '*' and page <> '*' and date >= current_date - ${days}::int
    group by page order by clicks desc limit 15`;
  const [analysis] = await sql`select week, brief->'analysis' as a from seo.briefs where brief ? 'analysis' order by week desc limit 1`;

  const rankByKeyword = {};
  for (const r of serp) (rankByKeyword[r.keyword] ||= {})[r.week] = r.rank;
  const weeks = serpWeeks.map((w) => w.week).sort();

  return json({
    daily,
    keywords: keywords.map((k) => {
      const g = gscByQuery.find((q) => q.query.toLowerCase() === k.keyword.toLowerCase());
      return { ...k, ranks: weeks.map((w) => rankByKeyword[k.keyword]?.[w] ?? null), gsc: g ? { clicks: g.clicks, impressions: g.impressions, position: g.position } : null };
    }),
    weeks,
    topQueries: gscByQuery.slice(0, 25),
    topPages,
    decay: analysis?.a?.decay || [],
    opportunities: analysis?.a?.opportunities || [],
    movers: analysis?.a?.movers || [],
    analysisWeek: analysis?.week || null,
  });
});
