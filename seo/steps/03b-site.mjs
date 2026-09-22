// Step 3b — our own site, read the way an AI engine reads it.
//
// Three things that decide whether an engine treats Verminord as one entity
// and cites the right page:
//
//   1. The old domain redirects. verminord.com was still indexed with the
//      early-tester copy after verminord.no went live; two sites saying two
//      things is exactly what makes an engine hedge. Every hop must be a
//      301/308 and the chain must land on the home host.
//   2. One spelling. «Verminord», never «VermiNord» or «Vermi Nord». All caps
//      is typography and passes; URLs and e-mail addresses are ignored.
//   3. The pillar page is live, uses all three words Norwegians search with
//      (vermikompost, meitemarkkompost, markkompost) and links out to sources.
//
// Nothing here needs a key. The full result is stored in seo.runs.stats and
// read back by analyze; Pulse only hears about what is wrong or what changed.
import { request } from "../lib/fetch.mjs";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { domainOf, stripHtml } from "../lib/text.mjs";
import { readStats } from "../lib/runs.mjs";

const bare = (host) => String(host || "").toLowerCase().replace(/^www\./, "");

// Non-canonical spellings of the brand in visible text.
export function spellingVariants(text) {
  const t = String(text || "");
  const counts = new Map();
  const re = /vermi[\s-]?nord/gi;
  let m;
  while ((m = re.exec(t))) {
    const word = m[0];
    if (word === "Verminord" || word === "VERMINORD") continue;
    const before = t[m.index - 1] || "";
    const after = t.slice(m.index + word.length);
    if (/[@/.]/.test(before)) continue;                       // post@verminord.no, www.verminord.no, /verminord
    if (/^\.(no|com|app|net|org)\b/i.test(after)) continue;    // verminord.no
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()].map(([variant, count]) => ({ variant, count })).sort((a, b) => b.count - a.count);
}

// How often each of the three Norwegian words occurs. «markkompost» is a
// substring of «meitemarkkompost», so it only counts at the start of a word.
export function termCoverage(text) {
  const t = String(text || "");
  const n = (re) => (t.match(re) || []).length;
  return {
    vermikompost: n(/vermikompost/gi),
    meitemarkkompost: n(/meitemark-?kompost/gi),
    markkompost: n(/(?<![a-zæøå])mark-?kompost/gi),
  };
}

// The Organization/LocalBusiness node in the page's JSON-LD, if any.
export function orgSchema(html) {
  const blocks = String(html || "").match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  const nodes = [];
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") {
      nodes.push(x);
      if (x["@graph"]) walk(x["@graph"]);
    }
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, ""))); } catch { /* broken JSON-LD is the site's problem, not ours */ }
  }
  const isOrg = (n) => [].concat(n["@type"] || []).some((t) => /Organization|LocalBusiness|Corporation|Store/i.test(String(t)));
  const org = nodes.find(isOrg);
  if (!org) return { found: false, name: null, same_as: 0 };
  return { found: true, name: org.name || null, same_as: [].concat(org.sameAs || []).length };
}

// Outbound links to the kind of sources an engine trusts, counted per domain.
const SOURCE_RX = /(^|\.)(nibio\.no|norsok\.no|snl\.no|lovdata\.no|mattilsynet\.no|debio\.no|doi\.org|springer\.com|link\.springer\.com|sciencedirect\.com|regjeringen\.no)$/i;
export function sourceLinks(html, pageUrl) {
  const out = {};
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    let host;
    try { host = new URL(m[1], pageUrl).hostname.toLowerCase(); } catch { continue; }
    if (SOURCE_RX.test(host)) out[bare(host)] = (out[bare(host)] || 0) + 1;
  }
  return out;
}

// hops: [{ url, status, location }] in order. home: the host the chain must end on.
export function classifyRedirect(hops, home) {
  if (!hops.length) return "feil";
  const last = hops[hops.length - 1];
  if (last.error) return "feil";
  const landed = bare(domainOf(last.url)) === bare(home) && last.status >= 200 && last.status < 300;
  if (landed) {
    const redirects = hops.slice(0, -1);
    if (!redirects.length) return "feil";                      // the old URL *is* the home host — misconfigured input
    return redirects.every((h) => h.status === 301 || h.status === 308) ? "permanent" : "midlertidig";
  }
  if (hops.length === 1 && last.status >= 200 && last.status < 300) return "ingen";
  return "feil";
}

async function followChain(url, maxHops = 5) {
  const hops = [];
  let cur = url;
  for (let i = 0; i <= maxHops; i++) {
    let res;
    try {
      res = await request(cur, { redirect: "manual", retries: 1, timeoutMs: 20000 });
    } catch (e) {
      hops.push({ url: cur, status: null, error: e.message.split("\n")[0] });
      break;
    }
    const location = res.headers.get("location");
    hops.push({ url: cur, status: res.status, location: location || null });
    if (res.status >= 300 && res.status < 400 && location) {
      cur = new URL(location, cur).href;
      continue;
    }
    break;
  }
  return hops;
}

async function readPage(url) {
  try {
    const res = await request(url, { retries: 1, timeoutMs: 30000 });
    return { status: res.status, final_url: res.url, html: res.ok ? res.text : "" };
  } catch (e) {
    return { status: null, final_url: url, html: "", error: e.message.split("\n")[0] };
  }
}

export async function run(ctx) {
  const { home, pillar, oldHosts } = ctx.site;
  const homeHost = domainOf(home);
  const db = ctx.dryRun ? null : sql();
  const prev = db
    ? readStats((await db`select stats from seo.runs where step = 'site' and status = 'ok' and week <> ${ctx.week} order by started_at desc limit 1`)[0]?.stats)
    : null;

  // --- 1. Old domain → home -------------------------------------------------
  const redirects = [];
  for (const host of oldHosts) {
    const hops = await followChain("https://" + host + "/");
    const verdict = classifyRedirect(hops, homeHost);
    redirects.push({ host, verdict, hops });
    ctx.log("site", `${host}: ${verdict} (${hops.map((h) => h.status ?? "feil").join(" → ")})`);
    const was = prev?.redirects?.find((r) => r.host === host)?.verdict || null;
    const chain = hops.map((h) => `${h.url} ${h.status ?? h.error}`).join(" → ");
    if (verdict === "permanent") {
      if (was && was !== "permanent") await pulse(ctx, { source: "site", kind: "teknisk", severity: "info", title: `${host} → ${bare(homeHost)}: permanent omdirigering på plass`, body: chain });
    } else {
      const text = {
        ingen: `${host} omdirigerer ikke — den gamle siden svarer fortsatt`,
        midlertidig: `${host} omdirigerer midlertidig (302/307), ikke permanent (301)`,
        feil: `${host} svarer ikke eller havner et annet sted enn ${bare(homeHost)}`,
      }[verdict];
      await pulse(ctx, {
        source: "site", kind: "teknisk", severity: was === "permanent" ? "viktig" : "notis", title: text,
        body: `${chain}. To nettsteder med ulik tekst får AI-motorene til å gardere seg. Sett opp 301 fra hele ${host} til ${bare(homeHost)}.`,
        data: { host, verdict, hops },
      });
    }
  }

  // --- 2. Home page: spelling and Organization schema -------------------------
  const homePage = await readPage(home);
  const homeText = stripHtml(homePage.html);
  const homeResult = { url: home, status: homePage.status, variants: spellingVariants(homeText), org: orgSchema(homePage.html) };
  if (homePage.error) ctx.log("site", `forsiden: ${homePage.error}`);

  // --- 3. Pillar page ----------------------------------------------------------
  const pillarPage = await readPage(pillar);
  const pillarLive = pillarPage.status === 200 && bare(domainOf(pillarPage.final_url)) === bare(homeHost);
  const pillarText = stripHtml(pillarPage.html);
  const pillarResult = {
    url: pillar, status: pillarPage.status, live: pillarLive,
    terms: pillarLive ? termCoverage(pillarText) : null,
    sources: pillarLive ? sourceLinks(pillarPage.html, pillarPage.final_url) : null,
    variants: pillarLive ? spellingVariants(pillarText) : [],
  };

  for (const [where, r] of [["forsiden", homeResult], ["pilarsiden", pillarResult]]) {
    if (!r.variants.length) continue;
    await pulse(ctx, {
      source: "site", kind: "teknisk", severity: "notis",
      title: `Stavemåte på ${where}: ${r.variants.map((v) => `«${v.variant}» (${v.count}×)`).join(", ")} — skriv «Verminord»`,
      body: "Samme navn overalt: nettsted, Brønnøysund, Google-profil, sekk. Ulik stavemåte får AI-motorene til å gardere seg.",
      data: { url: r.url, variants: r.variants },
    });
  }
  if (homeResult.status === 200 && homeResult.org.found && homeResult.org.name && homeResult.org.name !== "Verminord AS") {
    await pulse(ctx, { source: "site", kind: "teknisk", severity: "notis", title: `Organization-schema på forsiden heter «${homeResult.org.name}», ikke «Verminord AS»`, data: homeResult.org });
  }

  const wasLive = !!prev?.pillar?.live;
  if (!pillarLive) {
    await pulse(ctx, {
      source: "site", kind: "teknisk", severity: wasLive ? "viktig" : "info",
      title: wasLive ? `Pilarsiden svarer ikke lenger (${pillarPage.status ?? "feil"})` : `Pilarsiden er ikke publisert ennå (${pillarPage.status ?? "feil"})`,
      body: `${pillar} — bloggutkastene lenker hit. Publiser guiden på denne adressen, eller sett SEO_PILLAR_URL.`,
    });
  } else {
    const missing = Object.entries(pillarResult.terms).filter(([, n]) => n === 0).map(([t]) => t);
    if (missing.length) await pulse(ctx, { source: "site", kind: "teknisk", severity: "notis", title: `Pilarsiden bruker ikke ${missing.map((t) => "«" + t + "»").join(" og ")}`, body: "Alle tre ordene skal stå på siden, med en setning om at de betyr det samme.", data: pillarResult.terms });
    if (!wasLive && prev) await pulse(ctx, { source: "site", kind: "teknisk", severity: "info", title: "Pilarsiden er publisert", body: pillar });
  }

  return {
    redirect: redirects.map((r) => `${r.host}:${r.verdict}`).join(" "),
    pillar_live: pillarLive ? "ja" : "nei",
    redirects, home: homeResult, pillar: pillarResult,
  };
}
