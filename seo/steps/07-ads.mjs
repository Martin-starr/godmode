// Step 7 — active ads, best effort.
//
// Meta's Ad Library API only returns commercial ads for the EU; Norway is
// outside that scope, so this reads the public Ad Library web page instead.
// Google publishes no API for its Ads Transparency Center at all. Both pages
// are rendered client-side and restyled without notice, which is why this
// step has a time budget per competitor, records "annonsedata mangler" when
// nothing renders, and never stops the run. SKIP_ADS=1 turns it off.
//
// Only producers and brands are checked by default (six pages). A retailer
// is included when Martin has set its meta_page_id or google_advertiser.
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { sha1, normalizeWs } from "../lib/text.mjs";

const PER_PAGE_MS = 45000;
const TOTAL_MS = 12 * 60000;

function metaUrl(c) {
  const base = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=NO&media_type=all";
  return c.meta_page_id ? base + "&view_all_page_id=" + encodeURIComponent(c.meta_page_id) : base + "&q=" + encodeURIComponent(c.name) + "&search_type=keyword_unordered";
}

function googleUrl(c) {
  return c.google_advertiser
    ? "https://adstransparency.google.com/advertiser/" + encodeURIComponent(c.google_advertiser) + "?region=NO"
    : "https://adstransparency.google.com/?region=NO&domain=" + encodeURIComponent(c.domain);
}

async function scrapeMeta(page, c) {
  await page.goto(metaUrl(c), { waitUntil: "domcontentloaded", timeout: PER_PAGE_MS });
  await page.waitForTimeout(4000);
  // Dismiss the cookie dialog when it appears; the results render behind it either way.
  for (const label of ["Allow all cookies", "Decline optional cookies", "Only allow essential cookies"]) {
    const b = page.getByRole("button", { name: label }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const out = [];
    const nodes = [...document.querySelectorAll("div, span")].filter((n) => /^Library ID:\s*\d+/.test((n.textContent || "").trim()) && n.children.length === 0);
    for (const n of nodes) {
      const id = (/Library ID:\s*(\d+)/.exec(n.textContent) || [])[1];
      let card = n;
      for (let i = 0; i < 8 && card.parentElement; i++) {
        card = card.parentElement;
        if (card.innerText && card.innerText.length > 200) break;
      }
      const text = card.innerText || "";
      const started = (/Started running on\s+([A-Za-z]{3,9} \d{1,2}, \d{4})/.exec(text) || [])[1] || null;
      const link = [...card.querySelectorAll("a[href]")].map((a) => a.href).find((h) => /l\.facebook\.com\/l\.php\?u=/.test(h));
      let landing = null;
      if (link) { try { landing = decodeURIComponent(new URL(link).searchParams.get("u") || ""); } catch { landing = null; } }
      const body = text.split("\n").filter((l) => l.trim().length > 30 && !/Library ID|Started running|Sponsored|Platforms|See ad details|Active/.test(l)).slice(0, 3).join(" ");
      out.push({ id, started, landing, body, media: card.querySelector("video") ? "video" : card.querySelector("img") ? "image" : null });
    }
    return out;
  });
}

async function scrapeGoogle(page, c) {
  await page.goto(googleUrl(c), { waitUntil: "domcontentloaded", timeout: PER_PAGE_MS });
  await page.waitForTimeout(5000);
  return page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll("a[href*='/creative/']")) {
      const m = /advertiser\/([A-Z0-9]+)\/creative\/([A-Z0-9]+)/i.exec(a.href);
      if (!m || seen.has(m[2])) continue;
      seen.add(m[2]);
      out.push({ advertiser: m[1], id: m[2], text: (a.innerText || "").trim().slice(0, 300), media: a.querySelector("video") ? "video" : a.querySelector("img") ? "image" : "text" });
    }
    return out;
  });
}

export async function run(ctx) {
  if (process.env.SKIP_ADS === "1") return { skipped: "SKIP_ADS=1" };
  let withBrowser;
  try {
    ({ withBrowser } = await import("../lib/browser.mjs"));
    await import("playwright");
  } catch {
    return { skipped: "Playwright er ikke installert" };
  }

  const db = ctx.dryRun ? null : sql();
  const competitors = db
    ? await db`select id, name, domain, kind, meta_page_id, google_advertiser from seo.competitors
        where active and (kind in ('produsent','merke') or meta_page_id is not null or google_advertiser is not null) order by id`
    : [{ id: 0, name: "Grønn Vekst", domain: "gronnvekst.no", kind: "merke", meta_page_id: null, google_advertiser: null }];

  const started = Date.now();
  const stats = { checked: 0, ads_new: 0, ads_active: 0, failed: 0 };
  const today = ctx.runDate.toISOString().slice(0, 10);

  await withBrowser(async (page) => {
    for (const c of competitors) {
      if (Date.now() - started > TOTAL_MS) { ctx.log("ads", "tidsbudsjett brukt opp"); break; }
      for (const platform of ["meta", "google"]) {
        let ads = [];
        try {
          ads = platform === "meta" ? await scrapeMeta(page, c) : await scrapeGoogle(page, c);
        } catch (e) {
          stats.failed += 1;
          ctx.log("ads", `${c.name} ${platform}: ${e.message.split("\n")[0]}`);
          continue;
        }
        stats.checked += 1;
        const keys = [];
        for (const ad of ads) {
          const ad_key = platform === "meta" ? "meta:" + (ad.id || sha1(c.name + ad.body)) : "google:" + ad.id;
          keys.push(ad_key);
          const headline = normalizeWs(platform === "meta" ? ad.body?.slice(0, 120) : ad.text?.slice(0, 120)) || null;
          let isNew = true;
          if (db) {
            const [existing] = await db`select ad_key from seo.ads where platform = ${platform} and ad_key = ${ad_key}`;
            isNew = !existing;
            await db`insert into seo.ads (platform, competitor_id, ad_key, first_seen, last_seen, active, headline, body, landing_url, media_kind, raw)
              values (${platform}, ${c.id}, ${ad_key}, ${ad.started ? new Date(ad.started).toISOString().slice(0, 10) : today}, ${today}, true, ${headline}, ${normalizeWs(ad.body || ad.text || "") || null}, ${ad.landing || null}, ${ad.media || null}, ${JSON.stringify(ad)}::jsonb)
              on conflict (platform, ad_key) do update set last_seen = ${today}, active = true, headline = coalesce(excluded.headline, seo.ads.headline), landing_url = coalesce(excluded.landing_url, seo.ads.landing_url), raw = excluded.raw`;
            if (platform === "google" && ad.advertiser && !c.google_advertiser) {
              await db`update seo.competitors set google_advertiser = ${ad.advertiser} where id = ${c.id} and google_advertiser is null`;
              c.google_advertiser = ad.advertiser;
            }
          }
          if (isNew) {
            stats.ads_new += 1;
            await pulse(ctx, {
              source: "ads", kind: "annonse", severity: "viktig",
              title: `${c.name} har en ny ${platform === "meta" ? "Meta" : "Google"}-annonse${headline ? ": " + headline.slice(0, 80) : ""}`,
              body: ad.landing || null, data: { platform, ad },
            });
          }
        }
        stats.ads_active += keys.length;
        if (db) {
          let prevCount = 0;
          const [pc] = await db`select count(*)::int as n from seo.ads where competitor_id = ${c.id} and platform = ${platform} and active`;
          prevCount = pc?.n || 0;
          if (keys.length) {
            await db`update seo.ads set active = false where competitor_id = ${c.id} and platform = ${platform} and active and not (ad_key = any(${keys}))`;
          } else {
            await db`update seo.ads set active = false where competitor_id = ${c.id} and platform = ${platform} and active`;
          }
          if (prevCount !== keys.length && !(prevCount === 0 && keys.length === 0)) {
            await pulse(ctx, {
              source: "ads", kind: "annonse", severity: "notis",
              title: `${c.name}: ${keys.length} aktive ${platform === "meta" ? "Meta" : "Google"}-annonser (var ${prevCount})`,
            });
          }
        }
        ctx.log("ads", `${c.name} ${platform}: ${ads.length} aktive`);
      }
    }
  });

  if (stats.checked === 0) {
    await pulse(ctx, { source: "ads", kind: "konfig", severity: "notis", title: "Annonsedata mangler denne uka", body: "Verken Meta Ad Library eller Google Ads Transparency Center lot seg lese." });
    throw new Error("Ingen annonsesider lot seg lese.");
  }
  await pulse(ctx, {
    source: "ads", kind: "tall", severity: "info",
    title: `Annonser: ${stats.ads_active} aktive hos ${competitors.length} aktører, ${stats.ads_new} nye`,
    body: stats.failed ? `${stats.failed} oppslag feilet.` : null, data: stats,
  });
  return stats;
}
