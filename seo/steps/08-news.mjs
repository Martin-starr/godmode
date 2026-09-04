// Step 8 — news and regulation that matter to Verminord.
//
// Two feeds in: the institutions that make the rules (Mattilsynet,
// Landbruksdirektoratet, Debio, NIBIO, NLR, the ministry's høringer) and
// Google News for the regulatory vocabulary. Each source is read as RSS when
// it is RSS and as a list of links when it is not — several of these sites
// have no feed, and a source that yields nothing is logged, not fatal.
//
// Then Claude reads every unscored item once and answers one question per
// item: how much does this matter to a vermicompost producer on Jæren, 0–5,
// and why in one sentence. Below 2 is deleted. The model never decides what
// to do about it; that is the brief's job with the analysis in front of it.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as cheerio from "cheerio";
import { getText, postJson } from "../lib/fetch.mjs";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { aiEnabled, claudeJson } from "../lib/ai.mjs";
import { domainOf, normalizeWs, truncate } from "../lib/text.mjs";
import { parseSerperDate } from "./04-serp.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// verified: none of these URLs could be checked from the build environment
// (the egress proxy blocks them). A source that 404s is logged and skipped;
// fix the URL here when one moves. Google News below is the safety net.
const SOURCES = [
  { name: "Mattilsynet · nyheter", url: "https://www.mattilsynet.no/nyheter" },
  { name: "Mattilsynet · høringer", url: "https://www.mattilsynet.no/hoeringer" },
  { name: "Mattilsynet · gjødsel og jord", url: "https://www.mattilsynet.no/planter-og-dyrking/gjodsel-jord-og-dyrkingsmedier" },
  { name: "Landbruksdirektoratet", url: "https://www.landbruksdirektoratet.no/nb/nyheter" },
  { name: "Debio", url: "https://debio.no/feed/" },
  { name: "NIBIO", url: "https://www.nibio.no/nyheter" },
  { name: "NLR", url: "https://www.nlr.no/nyheter" },
  { name: "Regjeringen · høringer LMD", url: "https://www.regjeringen.no/no/dep/lmd/id627/?type=hoeringer" },
];

const NEWS_QUERIES = [
  "gjødselvareforskrift", "Mattilsynet gjødsel", "økologisk landbruk Norge", "Debio økologisk",
  "jordhelse Norge", "kompost regelverk", "meitemark kompost", "torvfri jord Norge", "matjord Norge",
];

function parseFeed(xml) {
  const items = [];
  const rx = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  for (const m of xml.matchAll(rx)) {
    const block = m[0];
    const pick = (tag) => {
      const t = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i").exec(block);
      return t ? normalizeWs(t[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")) : null;
    };
    const linkAttr = /<link[^>]*href="([^"]+)"/i.exec(block);
    const url = pick("link") || (linkAttr && linkAttr[1]) || pick("guid");
    if (!url || !/^https?:/.test(url)) continue;
    items.push({
      url: url.split("#")[0],
      title: pick("title"),
      summary: truncate(pick("description") || pick("summary") || pick("content") || "", 500) || null,
      published_at: (() => { const d = new Date(pick("pubDate") || pick("published") || pick("updated") || ""); return Number.isNaN(d.getTime()) ? null : d.toISOString(); })(),
    });
  }
  return items;
}

export function parseIndex(html, pageUrl) {
  const $ = cheerio.load(html);
  const host = domainOf(pageUrl);
  const path = new URL(pageUrl).pathname.replace(/\/$/, "");
  const out = new Map();
  $("a[href]").each((_, a) => {
    const text = normalizeWs($(a).text());
    const href = $(a).attr("href");
    if (!href || text.length < 20 || text.length > 200) return;
    let abs;
    try { abs = new URL(href, pageUrl).toString().split("#")[0]; } catch { return; }
    if (domainOf(abs) !== host) return;
    const p = new URL(abs).pathname;
    if (p === path || p === path + "/") return;
    const newsy = /(nyhet|aktuelt|artik|hoering|horing|høring|press|sak|blogg|fag)/i.test(p) || (path && p.startsWith(path + "/"));
    if (!newsy) return;
    if (!out.has(abs)) out.set(abs, { url: abs, title: text, summary: null, published_at: null });
  });
  return [...out.values()].slice(0, 60);
}

export async function run(ctx) {
  const db = ctx.dryRun ? null : sql();
  const stats = { sources: 0, collected: 0, scored: 0, kept: 0, deleted: 0 };

  const collected = [];
  for (const s of SOURCES) {
    try {
      const text = await getText(s.url, { timeoutMs: 20000, gapMs: 1000, retries: 0 });
      const items = /<(rss|feed)\b/i.test(text.slice(0, 2000)) ? parseFeed(text) : parseIndex(text, s.url);
      for (const it of items) collected.push({ ...it, source: s.name });
      stats.sources += 1;
      ctx.log("news", `${s.name}: ${items.length} lenker`);
    } catch (e) {
      ctx.log("news", `${s.name}: ${e.message}`);
    }
  }

  if (process.env.SERPER_API_KEY) {
    for (const q of NEWS_QUERIES) {
      try {
        const data = await postJson("https://google.serper.dev/news", { q, gl: "no", hl: "no" }, { headers: { "x-api-key": process.env.SERPER_API_KEY }, gapMs: 250 });
        for (const n of data.news || []) {
          if (!n.link) continue;
          collected.push({ url: n.link, title: n.title || null, source: n.source || domainOf(n.link), summary: n.snippet || null, published_at: n.date ? parseSerperDate(n.date, ctx.runDate) : null });
        }
      } catch (e) {
        ctx.log("news", `Google Nyheter «${q}»: ${e.message}`);
      }
    }
  }

  const unique = new Map();
  for (const it of collected) if (!unique.has(it.url)) unique.set(it.url, it);
  const rows = [...unique.values()];
  stats.collected = rows.length;
  if (db && rows.length) {
    await db`insert into seo.news ${db(rows.map((r) => ({ url: r.url, title: r.title, source: r.source, published_at: r.published_at, summary: r.summary })), "url", "title", "source", "published_at", "summary")}
      on conflict (url) do nothing`;
  }

  // --- relevance ---------------------------------------------------------
  if (!aiEnabled()) {
    await pulse(ctx, { source: "news", kind: "konfig", severity: "notis", title: "Nyheter samlet, men ikke vurdert (ANTHROPIC_API_KEY mangler)", body: `${rows.length} saker venter.` });
    return stats;
  }
  const pending = db
    ? await db`select url, title, source, summary, published_at from seo.news where relevance is null order by first_seen desc limit 80`
    : rows.slice(0, 20);
  const system = await readFile(join(here, "..", "prompts", "news-filter.md"), "utf8");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["url", "relevance", "tags", "summary"],
          properties: {
            url: { type: "string" },
            relevance: { type: "integer", minimum: 0, maximum: 5 },
            tags: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
          },
        },
      },
    },
  };

  for (let i = 0; i < pending.length; i += 20) {
    const batch = pending.slice(i, i + 20);
    let scored;
    try {
      scored = await claudeJson({
        system,
        user: "Vurder disse sakene. Returner én rad per URL, i samme rekkefølge.\n\n" +
          batch.map((b, n) => `${n + 1}. URL: ${b.url}\n   Kilde: ${b.source || "?"}\n   Tittel: ${b.title || "(mangler)"}\n   Utdrag: ${truncate(b.summary || "", 300) || "(mangler)"}\n   Dato: ${b.published_at ? String(b.published_at).slice(0, 10) : "?"}`).join("\n\n"),
        schema, maxTokens: 4000, timeoutMs: 120000,
      });
    } catch (e) {
      ctx.log("news", `vurdering feilet: ${e.message}`);
      continue;
    }
    for (const it of scored.items || []) {
      const orig = batch.find((b) => b.url === it.url);
      if (!orig) continue;
      stats.scored += 1;
      if (it.relevance < 2) {
        stats.deleted += 1;
        if (db) await db`delete from seo.news where url = ${it.url}`;
        continue;
      }
      stats.kept += 1;
      if (db) await db`update seo.news set relevance = ${it.relevance}, tags = ${it.tags.slice(0, 6)}, summary = ${truncate(it.summary, 400)} where url = ${it.url}`;
      if (it.relevance >= 3) {
        await pulse(ctx, {
          source: "news", kind: "nyhet", severity: it.relevance >= 4 ? "viktig" : "notis",
          title: truncate(orig.title || it.summary, 160),
          body: it.summary + (orig.source ? " (" + orig.source + ")" : ""),
          data: { url: it.url, relevance: it.relevance, tags: it.tags },
        });
      }
    }
  }
  await pulse(ctx, {
    source: "news", kind: "tall", severity: "info",
    title: `Nyheter: ${stats.collected} saker samlet, ${stats.kept} relevante beholdt`,
    body: `${stats.sources} kilder lest, ${stats.deleted} kastet som irrelevante.`, data: stats,
  });
  return stats;
}
