// Step 5 — the competitors' own pages.
//
// Three readings per competitor, each written so a wrong reading is fixable
// in one place: price and stock from product pages (schema.org data first,
// visible text second, a headless render last), new posts from the sitemap
// (falling back to links on the blog index), and a platform fingerprint of
// the front page. Everything is compared with last week's row so the brief
// can say "changed" rather than dump the whole list again.
import * as cheerio from "cheerio";
import { getText, request } from "../lib/fetch.mjs";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { detectStock, domainOf, fingerprint, normalizeWs, parsePriceNok, sha1, stockText, stripHtml, truncate } from "../lib/text.mjs";
import { previousWeekKey } from "../lib/dates.mjs";

const BLOGISH = /\/(blogg|blog|nyheter|artikler|aktuelt|inspirasjon|tips|guide|kunnskap|magasin)\/[^/?#]+/i;

// Reads a product page into {title, price_nok, in_stock, stock_text, excerpt}.
export function readProductPage(html, url) {
  const $ = cheerio.load(html);
  const title = normalizeWs($('meta[property="og:title"]').attr("content") || $("h1").first().text() || $("title").text()).slice(0, 200) || null;

  // 1. schema.org Product (Shopify, WooCommerce, most themes emit it).
  let price = null;
  let availability = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (price != null && availability) return;
    try {
      const raw = JSON.parse($(el).contents().text());
      const nodes = [];
      const walk = (n) => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(walk);
        nodes.push(n);
        Object.values(n).forEach(walk);
      };
      walk(raw);
      for (const n of nodes) {
        const type = String(n["@type"] || "");
        if (/Offer|AggregateOffer/i.test(type)) {
          const p = Number(n.price ?? n.lowPrice);
          if (price == null && Number.isFinite(p) && p > 0 && (!n.priceCurrency || /NOK/i.test(n.priceCurrency))) price = p;
          if (!availability && n.availability) availability = String(n.availability);
        }
      }
    } catch { /* not JSON, not ours */ }
  });

  // 2. Meta tags and microdata.
  if (price == null) {
    const metaPrice = $('meta[property="product:price:amount"], meta[property="og:price:amount"], meta[itemprop="price"], [itemprop="price"]').first();
    const v = Number(metaPrice.attr("content") || metaPrice.text());
    if (Number.isFinite(v) && v > 0) price = v;
  }
  if (!availability) {
    const av = $('link[itemprop="availability"], meta[itemprop="availability"], [itemprop="availability"]').first();
    availability = av.attr("href") || av.attr("content") || null;
  }

  // 3. Visible text, scoped to the product area when there is one.
  const scope = $('[itemtype*="Product"], .product, #product, main, article').first();
  const scopedText = normalizeWs((scope.length ? scope : $("body")).text()).slice(0, 8000);
  if (price == null) price = parsePriceNok(scopedText);

  const button = $('button, input[type="submit"]').filter((_, el) => /handlekurv|handlevogn|kjøp|kjop|add to cart|buy/i.test($(el).text() + " " + ($(el).attr("value") || ""))).first();
  const buttonDisabled = button.length ? button.is(":disabled") || /\bdisabled\b/.test(button.attr("class") || "") : null;

  const in_stock = detectStock({ text: scopedText, availability, buttonDisabled });
  return {
    title,
    price_nok: price,
    in_stock,
    stock_text: availability ? availability.replace(/^.*\//, "") : stockText(scopedText),
    excerpt: truncate(scopedText, 400),
  };
}

async function fetchProduct(url, ctx) {
  let html = await getText(url, { timeoutMs: 25000, gapMs: 1500 });
  let read = readProductPage(html, url);
  if (read.price_nok == null && read.in_stock == null && !/<script[^>]*ld\+json/i.test(html)) {
    // Client-rendered shop: one headless render, then give up quietly.
    try {
      const { renderHtml } = await import("../lib/browser.mjs");
      html = await renderHtml(url, { timeoutMs: 30000 });
      read = readProductPage(html, url);
    } catch (e) {
      ctx.log("competitors", `render ${url}: ${e.message}`);
    }
  }
  return read;
}

// Sitemap discovery: the configured URL, then robots.txt, then the usual
// suspects. Nested sitemap indexes are followed two levels down.
async function sitemapUrls(competitor) {
  const base = "https://" + competitor.domain;
  const candidates = [competitor.sitemap_url].filter(Boolean);
  try {
    const robots = await getText(base + "/robots.txt", { timeoutMs: 10000, retries: 0 });
    for (const m of robots.matchAll(/^sitemap:\s*(\S+)/gim)) candidates.push(m[1]);
  } catch { /* no robots */ }
  candidates.push(base + "/sitemap.xml", base + "/sitemap_index.xml", base + "/wp-sitemap.xml");
  const seen = new Set();
  const urls = [];
  const queue = [...new Set(candidates)];
  let depth = 0;
  while (queue.length && depth < 12) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    depth += 1;
    let xml;
    try {
      const r = await request(u, { timeoutMs: 15000, retries: 0, gapMs: 800 });
      if (!r.ok || !/<(urlset|sitemapindex)/i.test(r.text)) continue;
      xml = r.text;
    } catch {
      continue;
    }
    if (/<sitemapindex/i.test(xml)) {
      for (const m of xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)) if (queue.length < 20) queue.push(m[1]);
    } else {
      for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
        const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(m[1]);
        const mod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(m[1]);
        if (loc) urls.push({ url: loc[1], lastmod: mod ? mod[1].slice(0, 10) : null });
      }
    }
    if (urls.length > 5000) break;
  }
  return urls;
}

export function isPostUrl(url, blogPrefixes) {
  if (blogPrefixes.some((p) => p && url.startsWith(p) && url.length > p.length + 3)) return true;
  return BLOGISH.test(url) && !/\/(tag|category|kategori|page|side)\//i.test(url);
}

async function postsFromIndex(pageUrl) {
  const html = await getText(pageUrl, { timeoutMs: 20000, gapMs: 1500 });
  const $ = cheerio.load(html);
  const host = domainOf(pageUrl);
  const out = new Map();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    const text = normalizeWs($(a).text());
    if (!href || text.length < 15) return;
    let abs;
    try { abs = new URL(href, pageUrl).toString().split("#")[0]; } catch { return; }
    if (domainOf(abs) !== host) return;
    if (!isPostUrl(abs, [pageUrl])) return;
    if (!out.has(abs)) out.set(abs, { url: abs, title: text.slice(0, 200), published_at: null });
  });
  return [...out.values()];
}

export async function run(ctx) {
  const db = ctx.dryRun ? null : sql();
  const competitors = db
    ? await db`select id, name, domain, kind, product_urls, blog_urls, sitemap_url from seo.competitors where active and kind <> 'kunnskap' order by id`
    : [{ id: 0, name: "Grønn Vekst AS", domain: "gronnvekst.no", kind: "merke", product_urls: ["https://www.gronnvekst.no/gjodsel/vermikompost"], blog_urls: [], sitemap_url: null }];
  const prevWeek = previousWeekKey(ctx.week);
  const stats = { pages: 0, changed: 0, posts: 0, tech: 0, errors: 0 };
  const cutoff = new Date(ctx.runDate.getTime() - 14 * 864e5).toISOString().slice(0, 10);

  for (const c of competitors) {
    // --- products -------------------------------------------------------
    for (const url of c.product_urls || []) {
      let read;
      try {
        read = await fetchProduct(url, ctx);
      } catch (e) {
        stats.errors += 1;
        ctx.log("competitors", `${c.name} ${url}: ${e.message}`);
        continue;
      }
      const hash = sha1([read.title, read.price_nok, read.in_stock].join("|"));
      let prev = null;
      if (db) {
        prev = (await db`select price_nok, in_stock, hash, week from seo.competitor_snapshots where url = ${url} and week <> ${ctx.week}
          order by fetched_at desc limit 1`)[0] || null;
      }
      const changed = !!prev && prev.hash !== hash;
      if (db) {
        await db`insert into seo.competitor_snapshots (week, competitor_id, url, price_nok, in_stock, stock_text, title, excerpt, hash, changed)
          values (${ctx.week}, ${c.id}, ${url}, ${read.price_nok}, ${read.in_stock}, ${read.stock_text}, ${read.title}, ${read.excerpt}, ${hash}, ${changed})
          on conflict (week, url) do update set price_nok = excluded.price_nok, in_stock = excluded.in_stock, stock_text = excluded.stock_text,
            title = excluded.title, excerpt = excluded.excerpt, hash = excluded.hash, changed = excluded.changed, fetched_at = now()`;
      }
      stats.pages += 1;
      ctx.log("competitors", `${c.name}: ${read.title || url} — ${read.price_nok ?? "?"} kr, ${read.in_stock === null ? "lager ukjent" : read.in_stock ? "på lager" : "UTSOLGT"}${changed ? " (endret)" : ""}`);
      if (changed) {
        stats.changed += 1;
        const stockFlip = prev.in_stock !== read.in_stock && read.in_stock !== null;
        const priceMove = prev.price_nok != null && read.price_nok != null && Math.abs(read.price_nok - Number(prev.price_nok)) / Number(prev.price_nok) > 0.05;
        if (stockFlip || priceMove) {
          const bits = [];
          if (stockFlip) bits.push(read.in_stock ? "tilbake på lager" : "utsolgt");
          if (priceMove) bits.push(`pris ${Number(prev.price_nok)} → ${read.price_nok} kr`);
          await pulse(ctx, {
            source: "competitors", kind: "konkurrent", severity: "viktig",
            title: `${c.name}: ${read.title || "produkt"} ${bits.join(", ")}`,
            body: url, data: { url, prev, now: read },
          });
        }
      } else if (!prev) {
        await pulse(ctx, {
          source: "competitors", kind: "konkurrent", severity: "info",
          title: `${c.name}: første lesning av ${read.title || url}`,
          body: `${read.price_nok ?? "?"} kr · ${read.in_stock === null ? "lagerstatus ukjent" : read.in_stock ? "på lager" : "utsolgt"}`,
          data: { url, now: read },
        });
      }
    }

    // --- posts ----------------------------------------------------------
    let candidates = [];
    try {
      const all = await sitemapUrls(c);
      candidates = all.filter((u) => isPostUrl(u.url, c.blog_urls || [])).map((u) => ({ url: u.url, title: null, published_at: u.lastmod }));
    } catch (e) {
      ctx.log("competitors", `${c.name} sitemap: ${e.message}`);
    }
    if (!candidates.length) {
      for (const b of c.blog_urls || []) {
        try { candidates.push(...(await postsFromIndex(b))); } catch (e) { ctx.log("competitors", `${c.name} blogg ${b}: ${e.message}`); }
      }
    }
    if (candidates.length) {
      const known = db ? new Set((await db`select url from seo.competitor_posts where competitor_id = ${c.id}`).map((r) => r.url)) : new Set();
      const isFirstRun = known.size === 0;
      const fresh = candidates.filter((p) => !known.has(p.url));
      if (db && fresh.length) {
        await db`insert into seo.competitor_posts ${db(fresh.slice(0, 500).map((p) => ({ url: p.url, competitor_id: c.id, title: p.title, published_at: p.published_at })), "url", "competitor_id", "title", "published_at")}
          on conflict (url) do nothing`;
      }
      const recent = fresh.filter((p) => !p.published_at || p.published_at >= cutoff);
      // First run inserts history silently; only genuinely recent posts are
      // worth a notice, and never more than five per competitor per week.
      for (const p of (isFirstRun ? recent.filter((r) => r.published_at) : recent).slice(0, 5)) {
        stats.posts += 1;
        await pulse(ctx, {
          source: "competitors", kind: "innhold", severity: "notis",
          title: `${c.name} publiserte: ${p.title || p.url.replace(/^https?:\/\/[^/]+/, "")}`,
          body: p.url, data: p,
        });
      }
    }

    // --- tech -----------------------------------------------------------
    try {
      const html = await getText("https://" + c.domain + "/", { timeoutMs: 20000, gapMs: 1500 });
      const fp = fingerprint(html);
      if (db) {
        await db`insert into seo.competitor_tech (week, competitor_id, platform, signals) values (${ctx.week}, ${c.id}, ${fp.platform}, ${JSON.stringify(fp.signals)}::jsonb)
          on conflict (week, competitor_id) do update set platform = excluded.platform, signals = excluded.signals`;
      }
      stats.tech += 1;
    } catch (e) {
      ctx.log("competitors", `${c.name} forside: ${e.message}`);
    }
  }

  await pulse(ctx, {
    source: "competitors", kind: "tall", severity: "info",
    title: `Konkurrenter: ${stats.pages} produktsider lest, ${stats.changed} endret, ${stats.posts} nye innlegg`,
    body: stats.errors ? `${stats.errors} sider kunne ikke leses.` : null,
    data: stats,
  });
  return stats;
}
