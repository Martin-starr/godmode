// Step 4 — Google results for Norway via Serper: the top 20 for every tracked
// keyword, "Folk spør også", and Google News for the brand and product
// clusters. Any domain that shows up in the top 10 and is not already known
// becomes a competitor of kind "serp" — the list learns from what actually
// ranks, not from what we remembered to type in.
import { postJson } from "../lib/fetch.mjs";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { domainOf } from "../lib/text.mjs";

const SEARCH = "https://google.serper.dev/search";
const NEWS = "https://google.serper.dev/news";

// Platforms and reference sites that rank for everything and sell nothing.
const NOT_A_VENDOR = /(^|\.)(google\.[a-z.]+|wikipedia\.org|youtube\.com|facebook\.com|instagram\.com|tiktok\.com|pinterest\.[a-z]+|reddit\.com|finn\.no|snl\.no|amazon\.[a-z.]+|ebay\.[a-z.]+|linkedin\.com|x\.com|twitter\.com|apple\.com|microsoft\.com)$/i;

export function pickDiscoveries(organic, known, ownSites) {
  const out = new Map();
  for (const r of organic) {
    if (r.position > 10) continue;
    const d = domainOf(r.link);
    if (!d || known.has(d) || ownSites.has(d) || NOT_A_VENDOR.test(d)) continue;
    if (!out.has(d)) out.set(d, { domain: d, title: r.title, link: r.link });
  }
  return [...out.values()];
}

export async function run(ctx) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { skipped: "SERPER_API_KEY mangler" };
  const db = ctx.dryRun ? null : sql();
  const headers = { "x-api-key": key };

  const keywords = db
    ? await db`select keyword, cluster, priority from seo.keywords where active order by priority, keyword`
    : [{ keyword: "vermikompost", cluster: "produkt", priority: 1 }, { keyword: "Verminord", cluster: "merke", priority: 1 }];
  const known = new Set(db ? (await db`select domain from seo.competitors`).map((r) => r.domain) : []);
  const ownSites = new Set(db ? (await db`select site_url from seo.sites`).map((r) => r.site_url) : ["verminord.com"]);
  ownSites.add("verminord.no");
  ownSites.add("verminord.com");

  const stats = { keywords: 0, organic: 0, news: 0, discovered: 0, credits: 0 };
  for (const kw of keywords) {
    let data;
    try {
      data = await postJson(SEARCH, { q: kw.keyword, gl: "no", hl: "no", num: 20 }, { headers, gapMs: 250 });
      stats.credits += 1;
    } catch (e) {
      ctx.log("serp", `${kw.keyword}: ${e.message}`);
      continue;
    }
    const organic = (data.organic || []).map((r, i) => ({ ...r, position: r.position || i + 1 }));
    const rows = organic.map((r) => ({
      week: ctx.week, keyword: kw.keyword, kind: "organisk", rank: r.position,
      url: r.link, domain: domainOf(r.link), title: r.title,
      raw: JSON.stringify({ snippet: r.snippet, date: r.date || null, sitelinks: r.sitelinks || null }),
    }));
    (data.peopleAlsoAsk || []).forEach((p, i) => rows.push({
      week: ctx.week, keyword: kw.keyword, kind: "paa", rank: i + 1,
      url: p.link || null, domain: domainOf(p.link || ""), title: p.question,
      raw: JSON.stringify({ snippet: p.snippet || null }),
    }));
    if (data.answerBox) {
      rows.push({
        week: ctx.week, keyword: kw.keyword, kind: "svarboks", rank: 1,
        url: data.answerBox.link || null, domain: domainOf(data.answerBox.link || ""), title: data.answerBox.title || data.answerBox.snippet?.slice(0, 120) || "svarboks",
        raw: JSON.stringify({ snippet: data.answerBox.snippet || data.answerBox.answer || null }),
      });
    }
    if (db) {
      await db`delete from seo.serp_snapshots where week = ${ctx.week} and keyword = ${kw.keyword}`;
      if (rows.length) {
        await db`insert into seo.serp_snapshots ${db(rows, "week", "keyword", "kind", "rank", "url", "domain", "title", "raw")}
          on conflict (week, keyword, kind, rank) do update set url = excluded.url, domain = excluded.domain, title = excluded.title, raw = excluded.raw`;
      }
    }
    stats.keywords += 1;
    stats.organic += organic.length;

    for (const d of pickDiscoveries(organic, known, ownSites)) {
      known.add(d.domain);
      stats.discovered += 1;
      if (db) {
        await db`insert into seo.competitors (name, domain, kind, discovered_from, notes)
          values (${d.title?.slice(0, 80) || d.domain}, ${d.domain}, 'serp', ${"serp:" + kw.keyword}, ${"Oppdaget i topp 10 på «" + kw.keyword + "» uke " + ctx.week + ". Sjekk type og legg inn produkt-URL, eller deaktiver."})
          on conflict (domain) do nothing`;
      }
      await pulse(ctx, {
        source: "serp", kind: "konkurrent", severity: "notis",
        title: `Nytt domene i topp 10 på «${kw.keyword}»: ${d.domain}`,
        body: d.title || null, data: d,
      });
    }

    if (kw.cluster === "merke" || kw.cluster === "produkt") {
      try {
        const news = await postJson(NEWS, { q: kw.keyword, gl: "no", hl: "no" }, { headers, gapMs: 250 });
        stats.credits += 1;
        const items = (news.news || []).filter((n) => n.link).map((n) => ({
          url: n.link, title: n.title || null, source: n.source || domainOf(n.link),
          published_at: n.date ? parseSerperDate(n.date, ctx.runDate) : null,
          summary: n.snippet || null,
        }));
        if (db && items.length) {
          await db`insert into seo.news ${db(items, "url", "title", "source", "published_at", "summary")} on conflict (url) do nothing`;
        }
        stats.news += items.length;
      } catch (e) {
        ctx.log("serp", `nyheter ${kw.keyword}: ${e.message}`);
      }
    }
  }

  await pulse(ctx, {
    source: "serp", kind: "tall", severity: "info",
    title: `SERP: ${stats.keywords} søkeord hentet, ${stats.discovered} nye domener`,
    body: `${stats.organic} organiske treff, ${stats.news} nyhetstreff, ${stats.credits} Serper-kreditter.`,
    data: stats,
  });
  return stats;
}

// Serper gives news dates as "2 days ago", "3 hours ago" or an absolute date.
export function parseSerperDate(s, now = new Date()) {
  const rel = /(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i.exec(s || "");
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    const ms = { minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6 }[unit];
    return new Date(now.getTime() - n * ms).toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
