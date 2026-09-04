// Step 2 — GA4 Data API: sessions, users, engaged sessions and key events by
// channel and by landing page, for the same two-week window as Search
// Console. Optional: without GA4_PROPERTY_ID the brief simply has no
// session numbers.
import { googleConfigured, googleJson, SCOPE_GA4 } from "../lib/google-auth.mjs";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";

const KINDS = { kanal: "sessionDefaultChannelGroup", landingsside: "landingPagePlusQueryString" };

async function report(propertyId, dimension, range, metricSet) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate: range.start, endDate: range.end }],
    dimensions: [{ name: "date" }, { name: dimension }],
    metrics: metricSet.map((name) => ({ name })),
    limit: "10000",
  };
  return googleJson(url, body, SCOPE_GA4);
}

export async function run(ctx) {
  if (!googleConfigured()) return { skipped: "GOOGLE_SERVICE_ACCOUNT_JSON mangler" };
  const propertyId = (process.env.GA4_PROPERTY_ID || "").trim();
  if (!propertyId) return { skipped: "GA4_PROPERTY_ID mangler" };

  const db = ctx.dryRun ? null : sql();
  let site = process.env.GA4_SITE_URL || null;
  if (!site && db) site = (await db`select site_url from seo.sites where active order by site_url limit 1`)[0]?.site_url;
  site = site || "verminord.com";

  const range = { start: ctx.windows.prev.start, end: ctx.windows.this.end };
  // GA4 renamed `conversions` to `keyEvents` in 2024; older properties may
  // still answer the old name, so the new one is tried first.
  const metricSets = [
    ["sessions", "totalUsers", "engagedSessions", "keyEvents"],
    ["sessions", "totalUsers", "engagedSessions", "conversions"],
  ];

  const stats = { rows: 0 };
  let thisWeek = { sessions: 0, users: 0, engaged: 0, conversions: 0 };
  for (const [kind, dimension] of Object.entries(KINDS)) {
    let data = null;
    let lastErr = null;
    for (const metrics of metricSets) {
      try {
        data = await report(propertyId, dimension, range, metrics);
        break;
      } catch (e) {
        lastErr = e;
        if (!/keyEvents|conversions/i.test(e.message)) throw e;
      }
    }
    if (!data) throw lastErr || new Error("GA4 svarte ikke.");
    const rows = (data.rows || []).map((r) => {
      const d = r.dimensionValues[0].value; // YYYYMMDD
      const m = r.metricValues.map((v) => Number(v.value) || 0);
      return {
        date: d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8),
        site_url: site,
        dimension_kind: kind,
        dimension: r.dimensionValues[1].value || "(ikke satt)",
        sessions: Math.round(m[0]),
        users: Math.round(m[1]),
        engaged_sessions: Math.round(m[2]),
        conversions: m[3],
      };
    });
    if (db && rows.length) {
      await db`insert into seo.ga4_daily ${db(rows, "date", "site_url", "dimension_kind", "dimension", "sessions", "users", "engaged_sessions", "conversions")}
        on conflict (date, site_url, dimension_kind, dimension) do update
        set sessions = excluded.sessions, users = excluded.users, engaged_sessions = excluded.engaged_sessions, conversions = excluded.conversions`;
    }
    stats.rows += rows.length;
    if (kind === "kanal") {
      for (const r of rows) {
        if (r.date >= ctx.windows.this.start && r.date <= ctx.windows.this.end) {
          thisWeek.sessions += r.sessions;
          thisWeek.users += r.users;
          thisWeek.engaged += r.engaged_sessions;
          thisWeek.conversions += r.conversions;
        }
      }
    }
  }

  await pulse(ctx, {
    source: "ga4", kind: "tall", severity: "info",
    title: `GA4 ${site}: ${thisWeek.sessions} økter, ${thisWeek.users} brukere`,
    body: `${thisWeek.engaged} engasjerte økter, ${thisWeek.conversions} nøkkelhendelser i vinduet ${ctx.windows.this.start}–${ctx.windows.this.end}.`,
    data: thisWeek,
  });
  return { ...stats, ...thisWeek };
}
