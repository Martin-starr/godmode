// Step 1 — Google Search Console.
//
// Pulls four shapes of the same report so every later question has a table
// that answers it without hitting the 25 000-row cap:
//   totals per day            (page='*', query='*')   — the KPI row
//   per page per day          (query='*')             — content decay
//   per query per day         (page='*')              — movers, opportunities
//   query × page × country × device                   — "which page ranks for it"
// Rows are upserted, so re-pulling the previous week (GSC finalises late)
// simply corrects numbers in place.
import { googleConfigured, googleJson, SCOPE_GSC } from "../lib/google-auth.mjs";
import { sql, inChunks } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { backfillChunks } from "../lib/dates.mjs";

const API = "https://www.googleapis.com/webmasters/v3/sites/";
const ROW_LIMIT = 25000;

export function hostOfProperty(property) {
  if (property.startsWith("sc-domain:")) return property.slice(10).replace(/^www\./, "").toLowerCase();
  try {
    return new URL(property).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return property.toLowerCase();
  }
}

async function fetchAll(property, range, dimensions) {
  const url = API + encodeURIComponent(property) + "/searchAnalytics/query";
  const out = [];
  for (let startRow = 0; ; startRow += ROW_LIMIT) {
    const body = { startDate: range.start, endDate: range.end, dimensions, rowLimit: ROW_LIMIT, startRow, dataState: "final" };
    const data = await googleJson(url, body, SCOPE_GSC);
    const rows = data.rows || [];
    out.push(...rows);
    if (rows.length < ROW_LIMIT) break;
  }
  return out;
}

const VARIANTS = [
  { dims: ["date"], page: false, query: false },
  { dims: ["date", "page"], page: true, query: false },
  { dims: ["date", "query"], page: false, query: true },
  { dims: ["date", "page", "query", "country", "device"], page: true, query: true },
];

export async function run(ctx) {
  if (!googleConfigured()) return { skipped: "GOOGLE_SERVICE_ACCOUNT_JSON mangler" };
  const props = (process.env.GSC_SITE_URL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!props.length) return { skipped: "GSC_SITE_URL mangler (f.eks. sc-domain:verminord.com)" };

  const db = ctx.dryRun ? null : sql();
  const stats = { sites: 0, rows: 0 };

  for (const property of props) {
    const site = hostOfProperty(property);
    if (db) {
      await db`insert into seo.sites (site_url, gsc_property) values (${site}, ${property})
        on conflict (site_url) do update set gsc_property = excluded.gsc_property`;
    }

    let existing = 0;
    if (db) existing = (await db`select count(*)::int as n from seo.gsc_daily where site_url = ${site}`)[0].n;
    const ranges = ctx.backfill || existing === 0
      ? backfillChunks(new Date(ctx.windows.this.end + "T00:00:00Z"))
      : [{ start: ctx.windows.prev.start, end: ctx.windows.this.end }];
    ctx.log("gsc", `${site}: ${ranges.length} periode(r)` + (existing === 0 ? " (første kjøring, henter 16 måneder)" : ""));

    let clicks = 0;
    let impressions = 0;
    let rowsForSite = 0;
    for (const range of ranges) {
      for (const v of VARIANTS) {
        const rows = await fetchAll(property, range, v.dims);
        const mapped = rows.map((r) => {
          const k = (name) => r.keys[v.dims.indexOf(name)];
          return {
            date: k("date"),
            site_url: site,
            page: v.page ? k("page") : "*",
            query: v.query ? k("query") : "*",
            country: v.dims.includes("country") ? k("country") : "*",
            device: v.dims.includes("device") ? k("device") : "*",
            clicks: Math.round(r.clicks || 0),
            impressions: Math.round(r.impressions || 0),
            ctr: r.ctr ?? null,
            position: r.position ?? null,
          };
        });
        if (db && mapped.length) {
          await inChunks(mapped, 500, (chunk) => db`insert into seo.gsc_daily ${db(chunk, "date", "site_url", "page", "query", "country", "device", "clicks", "impressions", "ctr", "position")}
            on conflict (date, site_url, page, query, country, device) do update
            set clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position`);
        }
        rowsForSite += mapped.length;
        if (!v.page && !v.query) {
          for (const m of mapped) {
            if (m.date >= ctx.windows.this.start && m.date <= ctx.windows.this.end) {
              clicks += m.clicks;
              impressions += m.impressions;
            }
          }
        }
      }
    }
    stats.sites += 1;
    stats.rows += rowsForSite;
    await pulse(ctx, {
      source: "gsc", kind: "tall", severity: "info",
      title: `Search Console ${site}: ${clicks} klikk, ${impressions} visninger`,
      body: `Vindu ${ctx.windows.this.start}–${ctx.windows.this.end}. ${rowsForSite} rader hentet.`,
      data: { site, clicks, impressions, rows: rowsForSite },
    });
  }
  return stats;
}
