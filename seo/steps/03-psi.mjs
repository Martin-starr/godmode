// Step 3 — PageSpeed Insights for the front page and the five pages with the
// most clicks, mobile and desktop. Lab numbers (Lighthouse) every week; field
// numbers (CrUX) when Google has enough traffic to publish them, which a
// small site often does not — the brief says which it is looking at.
import { getJson, sleep } from "../lib/fetch.mjs";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

function audit(lr, id) {
  const a = lr?.audits?.[id];
  return a && typeof a.numericValue === "number" ? Math.round(a.numericValue) : null;
}

function parse(data) {
  const lr = data.lighthouseResult || {};
  const score = lr.categories?.performance?.score;
  const opps = Object.values(lr.audits || {})
    .filter((a) => a.details?.type === "opportunity" && (a.details.overallSavingsMs || 0) > 0)
    .sort((a, b) => (b.details.overallSavingsMs || 0) - (a.details.overallSavingsMs || 0))
    .slice(0, 5)
    .map((a) => ({ id: a.id, title: a.title, savings_ms: Math.round(a.details.overallSavingsMs) }));
  const crux = data.loadingExperience?.metrics
    ? Object.fromEntries(Object.entries(data.loadingExperience.metrics).map(([k, v]) => [k, { p75: v.percentile, category: v.category }]))
    : null;
  return {
    perf_score: typeof score === "number" ? Math.round(score * 100) : null,
    lcp_ms: audit(lr, "largest-contentful-paint"),
    cls: lr.audits?.["cumulative-layout-shift"]?.numericValue ?? null,
    inp_ms: crux?.INTERACTION_TO_NEXT_PAINT?.p75 ?? null,
    fcp_ms: audit(lr, "first-contentful-paint"),
    tbt_ms: audit(lr, "total-blocking-time"),
    crux,
    opportunities: opps,
  };
}

export async function run(ctx) {
  const db = ctx.dryRun ? null : sql();
  const sites = db
    ? (await db`select site_url from seo.sites where active order by site_url`).map((r) => r.site_url)
    : ["verminord.com"];
  if (!sites.length) return { skipped: "Ingen nettsted i seo.sites" };

  const urls = new Set();
  for (const site of sites) {
    urls.add("https://" + site + "/");
    if (db) {
      const top = await db`select page, sum(clicks)::int as clicks from seo.gsc_daily
        where site_url = ${site} and query = '*' and page <> '*'
          and date >= ${ctx.windows.base.start} and date <= ${ctx.windows.this.end}
        group by page order by clicks desc limit 5`;
      for (const r of top) urls.add(r.page);
    }
  }

  const key = process.env.PSI_API_KEY ? "&key=" + encodeURIComponent(process.env.PSI_API_KEY) : "";
  const stats = { audits: 0, drops: 0 };
  for (const url of urls) {
    for (const strategy of ["mobile", "desktop"]) {
      let data;
      try {
        data = await getJson(`${API}?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance${key}`, { timeoutMs: 90000, gapMs: 2000, retries: 1 });
      } catch (e) {
        ctx.log("psi", `${strategy} ${url}: ${e.message}`);
        continue;
      }
      const row = parse(data);
      let prev = null;
      if (db) {
        prev = (await db`select perf_score from seo.psi_audits where url = ${url} and strategy = ${strategy} and week <> ${ctx.week}
          order by run_at desc limit 1`)[0] || null;
        await db`delete from seo.psi_audits where week = ${ctx.week} and url = ${url} and strategy = ${strategy}`;
        await db`insert into seo.psi_audits (week, url, strategy, perf_score, lcp_ms, cls, inp_ms, fcp_ms, tbt_ms, crux, opportunities)
          values (${ctx.week}, ${url}, ${strategy}, ${row.perf_score}, ${row.lcp_ms}, ${row.cls}, ${row.inp_ms}, ${row.fcp_ms}, ${row.tbt_ms},
                  ${row.crux ? JSON.stringify(row.crux) : null}::jsonb, ${JSON.stringify(row.opportunities)}::jsonb)`;
      }
      stats.audits += 1;
      if (prev && row.perf_score != null && prev.perf_score != null && prev.perf_score - row.perf_score > 10) {
        stats.drops += 1;
        await pulse(ctx, {
          source: "psi", kind: "teknisk", severity: "notis",
          title: `PageSpeed ${strategy}: ${url} falt fra ${prev.perf_score} til ${row.perf_score}`,
          body: row.opportunities.slice(0, 3).map((o) => `${o.title} (${o.savings_ms} ms)`).join(" · ") || null,
          data: { url, strategy, ...row },
        });
      }
      ctx.log("psi", `${strategy} ${url}: ${row.perf_score ?? "?"} (LCP ${row.lcp_ms ?? "?"} ms)`);
    }
  }
  await pulse(ctx, {
    source: "psi", kind: "teknisk", severity: "info",
    title: `PageSpeed: ${stats.audits} målinger på ${urls.size} sider`,
    body: stats.drops ? `${stats.drops} fall på over 10 poeng.` : "Ingen fall på over 10 poeng.",
  });
  return stats;
}
