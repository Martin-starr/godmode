// Step 11 — the arithmetic behind the brief. No language model here.
//
// Every number the brief quotes is computed in this file from tables the
// collectors filled, so a wrong number is a bug in one function with a test,
// not a hallucination nobody can trace. The result is one JSON object,
// stored with the week's brief (seo.briefs.brief->'analysis') and handed to
// step 12; the dashboard reads the same object for its "Muligheter" and
// "Forfall" lists so the e-mail and the screen never disagree.
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { classify } from "../../lib/integrations.js";
import { addDays, ymd } from "../lib/dates.mjs";
import { domainOf } from "../lib/text.mjs";

// Expected click-through by position — a fixed curve, deliberately blunt.
// The exact numbers matter less than the shape: the gain from 12 → 5 is
// large, from 6 → 5 is small, and the score should say so.
export function ctrAt(position) {
  const p = Math.round(position);
  if (p <= 1) return 0.28;
  if (p === 2) return 0.15;
  if (p === 3) return 0.11;
  if (p === 4) return 0.08;
  if (p === 5) return 0.07;
  if (p <= 10) return 0.04;
  if (p <= 20) return 0.015;
  return 0.005;
}

// rows: [{query, position, impressions28, clicks28, page}]
export function scoreOpportunities(rows, { minImpressions = 30, limit = 10 } = {}) {
  return rows
    .filter((r) => r.position >= 8 && r.position <= 20 && r.impressions28 >= minImpressions)
    .map((r) => {
      const ctrNow = r.impressions28 ? r.clicks28 / r.impressions28 : 0;
      const gain = Math.max(0, ctrAt(5) - ctrNow);
      const score = (r.impressions28 * gain) / Math.max(1, r.position - 5);
      return { ...r, position: Math.round(r.position * 10) / 10, score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// thisRows / prevRows: [{query, clicks, impressions, position}]
export function findMovers(thisRows, prevRows, { limit = 10 } = {}) {
  const prev = new Map(prevRows.map((r) => [r.query, r]));
  const out = [];
  for (const r of thisRows) {
    const p = prev.get(r.query) || { clicks: 0, impressions: 0, position: null };
    const maxImp = Math.max(r.impressions, p.impressions);
    const maxClicks = Math.max(r.clicks, p.clicks);
    const dPos = r.position != null && p.position != null ? r.position - p.position : null;
    const dClicksPct = p.clicks ? ((r.clicks - p.clicks) / p.clicks) * 100 : r.clicks ? 100 : 0;
    const bigClicks = maxClicks >= 3 && Math.abs(dClicksPct) >= 30;
    const bigPos = maxImp >= 20 && dPos != null && Math.abs(dPos) >= 2;
    if (!bigClicks && !bigPos) continue;
    out.push({
      query: r.query, clicks: r.clicks, clicks_prev: p.clicks, impressions: r.impressions,
      position: r.position != null ? Math.round(r.position * 10) / 10 : null,
      position_prev: p.position != null ? Math.round(p.position * 10) / 10 : null,
      delta_pos: dPos != null ? Math.round(dPos * 10) / 10 : null,
      delta_clicks_pct: Math.round(dClicksPct),
    });
  }
  return out.sort((a, b) => Math.abs(b.clicks - b.clicks_prev) - Math.abs(a.clicks - a.clicks_prev) || Math.abs(b.delta_pos || 0) - Math.abs(a.delta_pos || 0)).slice(0, limit);
}

// weekly: {page: {history: [clicks per week, oldest first, up to 8], now: clicks}}
export function findDecay(weekly, { minAvg = 10, ratio = 0.7, limit = 8 } = {}) {
  const out = [];
  for (const [page, w] of Object.entries(weekly)) {
    const hist = w.history.filter((x) => x != null);
    if (hist.length < 4) continue;
    const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
    if (avg < minAvg) continue;
    if (w.now < avg * ratio) out.push({ page, clicks: w.now, avg8: Math.round(avg * 10) / 10, drop_pct: Math.round((1 - w.now / avg) * 100) });
  }
  return out.sort((a, b) => b.avg8 - a.avg8).slice(0, limit);
}

// Årshjul rows are stored with 2026 dates; recurring ones are shifted to the
// year(s) that overlap the horizon.
export function upcomingCalendar(rows, from, days = 42) {
  const start = new Date(from + "T00:00:00Z");
  const end = addDays(start, days);
  const out = [];
  for (const r of rows) {
    const years = r.recurring_yearly ? [start.getUTCFullYear() - 1, start.getUTCFullYear(), start.getUTCFullYear() + 1] : [null];
    for (const y of years) {
      const shift = (d) => {
        if (!d) return null;
        const dd = new Date(d + "T00:00:00Z");
        if (y != null) dd.setUTCFullYear(y + (dd.getUTCFullYear() - new Date(r.starts_on + "T00:00:00Z").getUTCFullYear()));
        return dd;
      };
      const s = shift(String(r.starts_on).slice(0, 10));
      const e = r.ends_on ? shift(String(r.ends_on).slice(0, 10)) : s;
      if (e >= start && s <= end) out.push({ title: r.title, kind: r.kind, starts_on: ymd(s), ends_on: ymd(e), note: r.note });
    }
  }
  const seen = new Set();
  return out.filter((x) => (seen.has(x.title + x.starts_on) ? false : (seen.add(x.title + x.starts_on), true))).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

const num = (v) => (v == null ? null : Number(v));
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

// NACE codes where "revenue ÷ unit price" says something about vermicompost
// volume at all. For a garden-centre chain it says nothing, so it is not done.
const VOLUME_NACE = /^(20\.15|38\.21|38\.32|01\.30|01\.61|46\.75|46\.76)/;

async function totalsFor(db, w) {
  const [r] = await db`select coalesce(sum(clicks),0)::int as clicks, coalesce(sum(impressions),0)::int as impressions,
      case when sum(impressions) > 0 then sum(position * impressions) / sum(impressions) end as position
    from seo.gsc_daily where page = '*' and query = '*' and date between ${w.start} and ${w.end}`;
  const clicks = r.clicks, impressions = r.impressions;
  return { clicks, impressions, ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : null, position: r.position != null ? Math.round(Number(r.position) * 10) / 10 : null };
}

async function byQuery(db, w) {
  return (await db`select query, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
      case when sum(impressions) > 0 then sum(position * impressions) / sum(impressions) end as position
    from seo.gsc_daily where page = '*' and query <> '*' and date between ${w.start} and ${w.end}
    group by query`).map((r) => ({ ...r, position: num(r.position) }));
}

export async function run(ctx) {
  const db = ctx.dryRun ? null : sql();
  if (!db) return { skipped: "Analyse krever database (ikke tilgjengelig i --dry-run)" };
  const W = ctx.windows;
  const today = ymd(ctx.runDate);
  const weekAgo = ymd(addDays(ctx.runDate, -7));
  const analysis = { week: ctx.week, generated_at: new Date().toISOString(), window: W, data_gaps: [] };

  // --- Search Console -----------------------------------------------------
  const sites = await db`select site_url, gsc_property, ga4_property_id from seo.sites where active order by site_url`;
  analysis.sites = sites.map((s) => s.site_url);
  const hasGsc = (await db`select 1 from seo.gsc_daily limit 1`).length > 0;
  if (hasGsc) {
    const base = await totalsFor(db, W.base);
    analysis.totals = {
      this: await totalsFor(db, W.this),
      prev: await totalsFor(db, W.prev),
      base_weekly_avg: { clicks: Math.round(base.clicks / 4), impressions: Math.round(base.impressions / 4), ctr: base.ctr, position: base.position },
    };
    analysis.totals.delta = { clicks_pct: pct(analysis.totals.this.clicks, analysis.totals.prev.clicks), impressions_pct: pct(analysis.totals.this.impressions, analysis.totals.prev.impressions) };
    analysis.daily = (await db`select date, sum(clicks)::int as clicks, sum(impressions)::int as impressions from seo.gsc_daily
      where page = '*' and query = '*' and date between ${W.base.start} and ${W.this.end} group by date order by date`).map((r) => ({ date: ymd(new Date(r.date)), clicks: r.clicks, impressions: r.impressions }));

    const thisQ = await byQuery(db, W.this);
    const prevQ = await byQuery(db, W.prev);
    analysis.movers = findMovers(thisQ, prevQ);

    const last28 = { start: ymd(addDays(new Date(W.this.end + "T00:00:00Z"), -27)), end: W.this.end };
    const q28 = await byQuery(db, last28);
    const bestPage = await db`select distinct on (query) query, page from seo.gsc_daily
      where page <> '*' and query <> '*' and date between ${last28.start} and ${last28.end}
      group by query, page order by query, sum(impressions) desc`;
    const pageOf = new Map(bestPage.map((r) => [r.query, r.page]));
    analysis.opportunities = scoreOpportunities(q28.map((r) => ({ query: r.query, position: r.position ?? 99, impressions28: r.impressions, clicks28: r.clicks, page: pageOf.get(r.query) || null })));

    const weeklyRows = await db`select page, floor((date - ${W.eight.start}::date) / 7)::int as wk, sum(clicks)::int as clicks
      from seo.gsc_daily where query = '*' and page <> '*' and date between ${W.eight.start} and ${W.this.end} group by page, wk`;
    const weekly = {};
    for (const r of weeklyRows) {
      weekly[r.page] ||= { history: Array(8).fill(0), now: 0 };
      if (r.wk >= 8) weekly[r.page].now += r.clicks; else weekly[r.page].history[r.wk] += r.clicks;
    }
    analysis.decay = findDecay(weekly);
    analysis.zeroed_pages = (await db`select page, sum(clicks) filter (where date between ${W.prev.start} and ${W.prev.end})::int as prev_clicks,
        sum(clicks) filter (where date between ${W.this.start} and ${W.this.end})::int as clicks
      from seo.gsc_daily where query = '*' and page <> '*' and date between ${W.prev.start} and ${W.this.end}
      group by page having sum(clicks) filter (where date between ${W.prev.start} and ${W.prev.end}) >= 5
        and coalesce(sum(clicks) filter (where date between ${W.this.start} and ${W.this.end}), 0) = 0`).map((r) => ({ page: r.page, prev_clicks: r.prev_clicks }));
    analysis.top_pages = (await db`select page, sum(clicks)::int as clicks, sum(impressions)::int as impressions from seo.gsc_daily
      where query = '*' and page <> '*' and date between ${W.this.start} and ${W.this.end} group by page order by clicks desc limit 10`);
    analysis.top_queries = thisQ.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 15).map((r) => ({ ...r, position: r.position != null ? Math.round(r.position * 10) / 10 : null }));
  } else {
    analysis.data_gaps.push("Search Console-data mangler (steg gsc har ikke kjørt eller er ikke konfigurert)");
  }

  // --- GA4 ------------------------------------------------------------------
  const hasGa4 = (await db`select 1 from seo.ga4_daily limit 1`).length > 0;
  if (hasGa4) {
    const sums = async (w) => (await db`select coalesce(sum(sessions),0)::int as sessions, coalesce(sum(users),0)::int as users, coalesce(sum(engaged_sessions),0)::int as engaged, coalesce(sum(conversions),0)::numeric as conversions
      from seo.ga4_daily where dimension_kind = 'kanal' and date between ${w.start} and ${w.end}`)[0];
    analysis.ga4 = {
      this: await sums(W.this), prev: await sums(W.prev),
      channels: await db`select dimension as name, sum(sessions)::int as sessions from seo.ga4_daily where dimension_kind = 'kanal' and date between ${W.this.start} and ${W.this.end} group by dimension order by sessions desc limit 8`,
      landing: await db`select dimension as page, sum(sessions)::int as sessions from seo.ga4_daily where dimension_kind = 'landingsside' and date between ${W.this.start} and ${W.this.end} group by dimension order by sessions desc limit 8`,
    };
    analysis.ga4.this.conversions = Number(analysis.ga4.this.conversions);
    analysis.ga4.prev.conversions = Number(analysis.ga4.prev.conversions);
  } else {
    analysis.ga4 = null;
  }

  // --- SERP side by side ---------------------------------------------------
  const kws = await db`select keyword from seo.keywords where active order by priority, keyword limit 10`;
  const comps = await db`select id, name, domain, kind from seo.competitors where active`;
  const nameOf = new Map(comps.map((c) => [c.domain, c.name]));
  const own = new Set([...analysis.sites, "verminord.com", "verminord.no"]);
  const serpRows = [];
  const beatenBy = new Map();
  for (const k of kws) {
    const now = await db`select rank, domain, url from seo.serp_snapshots where week = ${ctx.week} and keyword = ${k.keyword} and kind = 'organisk' order by rank`;
    const prev = await db`select rank, domain from seo.serp_snapshots where week = ${ctx.prevWeek} and keyword = ${k.keyword} and kind = 'organisk' order by rank`;
    if (!now.length && !prev.length) continue;
    const ownNow = now.find((r) => own.has(r.domain));
    const ownPrev = prev.find((r) => own.has(r.domain));
    const others = {};
    for (const r of now.slice(0, 10)) {
      if (own.has(r.domain)) continue;
      others[r.domain] = { name: nameOf.get(r.domain) || r.domain, now: r.rank, prev: prev.find((p) => p.domain === r.domain)?.rank ?? null };
      if (!ownNow || r.rank < ownNow.rank) beatenBy.set(r.domain, (beatenBy.get(r.domain) || 0) + 1);
    }
    serpRows.push({ keyword: k.keyword, own: { now: ownNow?.rank ?? null, prev: ownPrev?.rank ?? null, url: ownNow?.url || null }, others });
  }
  analysis.serp = { rows: serpRows, beaten_by: [...beatenBy.entries()].map(([domain, count]) => ({ domain, name: nameOf.get(domain) || domain, keywords_ahead: count })).sort((a, b) => b.keywords_ahead - a.keywords_ahead).slice(0, 8) };
  if (!serpRows.length) analysis.data_gaps.push("SERP-data mangler");

  // --- Competitor changes --------------------------------------------------
  const snaps = await db`select s.url, s.price_nok, s.in_stock, s.title, c.name,
      (select price_nok from seo.competitor_snapshots p where p.url = s.url and p.week <> s.week order by p.fetched_at desc limit 1) as price_prev,
      (select in_stock from seo.competitor_snapshots p where p.url = s.url and p.week <> s.week order by p.fetched_at desc limit 1) as in_stock_prev
    from seo.competitor_snapshots s join seo.competitors c on c.id = s.competitor_id
    where s.week = ${ctx.week} and s.changed`;
  const stockNow = await db`select c.name, s.url, s.title, s.price_nok, s.in_stock from seo.competitor_snapshots s join seo.competitors c on c.id = s.competitor_id
    where s.week = ${ctx.week} order by c.name`;
  const posts = await db`select c.name, p.url, p.title, p.published_at from seo.competitor_posts p join seo.competitors c on c.id = p.competitor_id
    where p.first_seen >= ${weekAgo} and (p.published_at is null or p.published_at >= ${ymd(addDays(ctx.runDate, -30))}) order by p.published_at desc nulls last limit 15`;
  const adsNew = await db`select c.name, a.platform, a.headline, a.landing_url from seo.ads a join seo.competitors c on c.id = a.competitor_id
    where a.first_seen >= ${weekAgo} and a.active order by c.name limit 20`;
  const adsEnded = await db`select c.name, a.platform, a.headline from seo.ads a join seo.competitors c on c.id = a.competitor_id
    where not a.active and a.last_seen between ${ymd(addDays(ctx.runDate, -14))} and ${weekAgo} order by c.name limit 20`;
  const adsActive = await db`select c.name, a.platform, count(*)::int as n from seo.ads a join seo.competitors c on c.id = a.competitor_id where a.active group by c.name, a.platform order by c.name`;
  const factsRaw = await db`select f.*, c.name as cname, c.kind, c.id as cid from seo.company_facts f join seo.competitors c on c.org_nr = f.org_nr where c.active order by f.revenue_nok desc nulls last`;
  const facts = [];
  for (const f of factsRaw) {
    let estimate = null;
    if (f.revenue_nok && VOLUME_NACE.test(f.nace_code || "") && (f.kind === "produsent" || f.kind === "merke")) {
      const price = Number(stockNow.find((s) => s.name === f.cname && s.price_nok)?.price_nok) || 219;
      const units = Math.round((Number(f.revenue_nok) * 0.3) / price);
      estimate = { units_per_year: units, note: `Anslag: omsetning ${Math.round(Number(f.revenue_nok) / 1e6)} MNOK × antatt 30 % vermikompost-andel ÷ ${price} kr per enhet. Grovt.` };
    }
    facts.push({ name: f.cname, org_nr: f.org_nr, nace: [f.nace_code, f.nace_text].filter(Boolean).join(" "), employees: f.employees, founded: f.founded ? ymd(new Date(f.founded)) : null, fiscal_year: f.fiscal_year, revenue_nok: num(f.revenue_nok), result_nok: num(f.result_nok), estimate, fresh: new Date(f.fetched_at) >= new Date(weekAgo) });
  }
  analysis.competitor_changes = {
    snapshots: snaps.map((s) => ({ ...s, price_nok: num(s.price_nok), price_prev: num(s.price_prev) })),
    stock_now: stockNow.map((s) => ({ ...s, price_nok: num(s.price_nok) })),
    posts: posts.map((p) => ({ ...p, published_at: p.published_at ? ymd(new Date(p.published_at)) : null })),
    ads_new: adsNew, ads_ended: adsEnded, ads_active: adsActive,
    facts,
  };
  const adsRan = (await db`select 1 from seo.runs where week = ${ctx.week} and step = 'ads' and status = 'ok' limit 1`).length > 0;
  if (!adsRan) analysis.data_gaps.push("Annonsedata mangler denne uka");

  // --- AI visibility -------------------------------------------------------
  const aiRows = await db`select engine, count(*)::int as asked, count(*) filter (where mentioned)::int as mentioned from seo.ai_visibility where week = ${ctx.week} group by engine`;
  const aiPrev = await db`select engine, count(*)::int as asked, count(*) filter (where mentioned)::int as mentioned from seo.ai_visibility where week = ${ctx.prevWeek} group by engine`;
  const flips = await db`select n.engine, p.prompt, n.mentioned as now, o.mentioned as prev from seo.ai_visibility n
    join seo.ai_visibility o on o.engine = n.engine and o.prompt_id = n.prompt_id and o.week = ${ctx.prevWeek}
    join seo.ai_prompts p on p.id = n.prompt_id where n.week = ${ctx.week} and n.mentioned <> o.mentioned`;
  const cited = await db`select c->>'url' as url from seo.ai_visibility, jsonb_array_elements(coalesce(citations, '[]'::jsonb)) c where week = ${ctx.week}`;
  const citedCount = new Map();
  for (const r of cited) { const d = domainOf(r.url); if (d) citedCount.set(d, (citedCount.get(d) || 0) + 1); }
  const mentionedComp = await db`select unnest(competitors_mentioned) as name, count(*)::int as count from seo.ai_visibility where week = ${ctx.week} group by 1 order by 2 desc limit 8`;
  analysis.ai = aiRows.length ? {
    engines: aiRows.map((r) => { const p = aiPrev.find((x) => x.engine === r.engine); return { engine: r.engine, asked: r.asked, mentioned: r.mentioned, rate_now: r.asked ? Math.round((r.mentioned / r.asked) * 100) : null, rate_prev: p?.asked ? Math.round((p.mentioned / p.asked) * 100) : null }; }),
    flips, top_cited: [...citedCount.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    competitors_mentioned: mentionedComp,
  } : null;
  if (!analysis.ai) analysis.data_gaps.push("AI-synlighet mangler");

  // --- News, leads, technical, calendar, health ---------------------------
  analysis.news = (await db`select title, url, source, summary, relevance, published_at from seo.news where relevance >= 3 and first_seen >= ${weekAgo} order by relevance desc, published_at desc nulls last limit 8`)
    .map((n) => ({ ...n, published_at: n.published_at ? String(n.published_at).slice(0, 10) : null }));
  analysis.leads = await db`select name, kind, region, icp_score, reason, url from seo.leads where first_seen >= ${weekAgo} order by icp_score desc nulls last limit 5`;
  const psi = await db`select a.url, a.strategy, a.perf_score, a.lcp_ms, a.cls, a.tbt_ms, a.inp_ms,
      (select perf_score from seo.psi_audits p where p.url = a.url and p.strategy = a.strategy and p.week <> a.week order by run_at desc limit 1) as prev
    from seo.psi_audits a where a.week = ${ctx.week} order by a.url, a.strategy`;
  analysis.technical = { psi: psi.map((r) => ({ ...r, cls: num(r.cls) })), zeroed_pages: analysis.zeroed_pages || [] };
  const cal = await db`select title, kind, starts_on, ends_on, note, recurring_yearly from seo.calendar order by sort, starts_on`;
  analysis.calendar = upcomingCalendar(cal.map((r) => ({ ...r, starts_on: ymd(new Date(r.starts_on)), ends_on: r.ends_on ? ymd(new Date(r.ends_on)) : null })), today, 42);
  const health = await db`select key, label, expected_interval_min, last_ok_at, last_error, last_error_at, consecutive_failures, muted_until from dash.integrations where key like 'seo:%' order by key`;
  analysis.health = health.map((h) => ({ key: h.key, status: classify(h), last_error: h.last_error }));
  const runs = await db`select step, status, error from seo.runs where week = ${ctx.week} and status in ('hoppet over','feilet') order by started_at`;
  for (const r of runs) if (!analysis.data_gaps.some((g) => g.includes(r.step))) analysis.data_gaps.push(`${r.step}: ${r.status}${r.error ? " — " + r.error.slice(0, 80) : ""}`);

  // --- persist + pulse -----------------------------------------------------
  await db`insert into seo.briefs (week, brief) values (${ctx.week}, ${JSON.stringify({ analysis })}::jsonb)
    on conflict (week) do update set brief = coalesce(seo.briefs.brief, '{}'::jsonb) || ${JSON.stringify({ analysis })}::jsonb`;
  ctx.analysis = analysis;

  for (const m of (analysis.movers || []).slice(0, 4)) {
    await pulse(ctx, { source: "analyze", kind: "søk", severity: "info", title: `«${m.query}»: ${m.clicks} klikk (${m.delta_clicks_pct > 0 ? "+" : ""}${m.delta_clicks_pct} %)${m.delta_pos != null ? ", posisjon " + m.position_prev + " → " + m.position : ""}`, data: m });
  }
  for (const d of (analysis.decay || []).slice(0, 5)) {
    await pulse(ctx, { source: "analyze", kind: "forfall", severity: "notis", title: `Forfall: ${d.page.replace(/^https?:\/\/[^/]+/, "") || "/"} har ${d.clicks} klikk mot snitt ${d.avg8} (−${d.drop_pct} %)`, data: d });
  }
  if (analysis.opportunities?.length) {
    await pulse(ctx, { source: "analyze", kind: "mulighet", severity: "notis", title: `Muligheter: ${analysis.opportunities.slice(0, 3).map((o) => `«${o.query}» (pos ${o.position})`).join(", ")}`, body: "Søkeord i posisjon 8–20 med visninger, rangert på gevinst ved å nå topp 5.", data: analysis.opportunities.slice(0, 5) });
  }
  await pulse(ctx, { source: "analyze", kind: "tall", severity: "info", title: `Ukeanalyse klar for ${ctx.week}`, body: analysis.data_gaps.length ? "Mangler: " + analysis.data_gaps.join("; ") : "Alle datakilder til stede.", data: { gaps: analysis.data_gaps } });
  return { movers: (analysis.movers || []).length, decay: (analysis.decay || []).length, opportunities: (analysis.opportunities || []).length, gaps: analysis.data_gaps.length };
}
