// Konkurrenter: everything the agent knows per competitor, in one payload —
// the latest reading of each product page, recent posts, platform, company
// facts, active ads, and the SERP side-by-side from the latest analysis.
import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const KINDS = ["produsent", "merke", "forhandler", "serp", "kunnskap"];
const listOf = (v) => (Array.isArray(v) ? v : String(v || "").split(/[\n,]/)).map((s) => s.trim()).filter(Boolean);

export const GET = guarded(async () => {
  const sql = db();
  const competitors = await sql`select id, name, domain, org_nr, kind, product_urls, blog_urls, sitemap_url, meta_page_id, google_advertiser, active, discovered_from, notes, added_at
    from seo.competitors order by active desc, case kind when 'produsent' then 0 when 'merke' then 1 when 'forhandler' then 2 when 'serp' then 3 else 4 end, name`;
  const snapshots = await sql`select distinct on (url) url, competitor_id, week, price_nok, in_stock, stock_text, title, changed, fetched_at
    from seo.competitor_snapshots order by url, fetched_at desc`;
  const history = await sql`select url, week, price_nok, in_stock from seo.competitor_snapshots
    where week >= to_char(current_date - 91, 'IYYY-"W"IW') order by week`;
  const posts = await sql`select competitor_id, url, title, published_at, first_seen from seo.competitor_posts
    order by coalesce(published_at, first_seen::date) desc, first_seen desc limit 200`;
  const tech = await sql`select distinct on (competitor_id) competitor_id, week, platform, signals from seo.competitor_tech order by competitor_id, week desc`;
  const facts = await sql`select org_nr, fetched_at, name, nace_code, nace_text, employees, founded, fiscal_year, revenue_nok, result_nok from seo.company_facts`;
  const ads = await sql`select platform, competitor_id, ad_key, first_seen, last_seen, active, headline, landing_url, media_kind from seo.ads
    where active or last_seen >= current_date - 30 order by active desc, last_seen desc limit 300`;
  const [analysis] = await sql`select week, brief->'analysis'->'serp' as serp from seo.briefs where brief ? 'analysis' order by week desc limit 1`;

  const byId = (rows, key = "competitor_id") => {
    const m = {};
    for (const r of rows) (m[r[key]] ||= []).push(r);
    return m;
  };
  const snapById = byId(snapshots);
  const postsById = byId(posts);
  const adsById = byId(ads);
  const techById = Object.fromEntries(tech.map((t) => [t.competitor_id, t]));
  const factsByOrg = Object.fromEntries(facts.map((f) => [f.org_nr, f]));
  const histByUrl = byId(history, "url");

  return json({
    competitors: competitors.map((c) => ({
      ...c,
      snapshots: (snapById[c.id] || []).map((s) => ({ ...s, history: histByUrl[s.url] || [] })),
      posts: (postsById[c.id] || []).slice(0, 8),
      tech: techById[c.id] || null,
      facts: c.org_nr ? factsByOrg[c.org_nr] || null : null,
      ads: adsById[c.id] || [],
    })),
    serp: analysis?.serp || null,
    serpWeek: analysis?.week || null,
  });
});

export const POST = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  const domain = String(b.domain || "").trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  if (!name || !domain) return err("Navn og domene må fylles inn.");
  const kind = KINDS.includes(b.kind) ? b.kind : "forhandler";
  const [row] = await db()`insert into seo.competitors (name, domain, kind, product_urls, blog_urls, sitemap_url, org_nr, meta_page_id, notes, discovered_from)
    values (${name}, ${domain}, ${kind}, ${listOf(b.product_urls)}, ${listOf(b.blog_urls)}, ${b.sitemap_url || null}, ${b.org_nr || null}, ${b.meta_page_id || null}, ${b.notes || null}, 'manuelt')
    on conflict (domain) do update set name = excluded.name, kind = excluded.kind, active = true returning *`;
  return json(row);
}, { edit: true });

export const PUT = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return err("Mangler id.");
  const [orig] = await db()`select * from seo.competitors where id = ${id}`;
  if (!orig) return err("Fant ikke konkurrenten.", 404);
  const next = {
    name: b.name !== undefined ? String(b.name).trim() || orig.name : orig.name,
    kind: KINDS.includes(b.kind) ? b.kind : orig.kind,
    product_urls: b.product_urls !== undefined ? listOf(b.product_urls) : orig.product_urls,
    blog_urls: b.blog_urls !== undefined ? listOf(b.blog_urls) : orig.blog_urls,
    sitemap_url: b.sitemap_url !== undefined ? b.sitemap_url || null : orig.sitemap_url,
    org_nr: b.org_nr !== undefined ? b.org_nr || null : orig.org_nr,
    meta_page_id: b.meta_page_id !== undefined ? b.meta_page_id || null : orig.meta_page_id,
    notes: b.notes !== undefined ? b.notes || null : orig.notes,
    active: typeof b.active === "boolean" ? b.active : orig.active,
  };
  const [row] = await db()`update seo.competitors set name = ${next.name}, kind = ${next.kind}, product_urls = ${next.product_urls},
      blog_urls = ${next.blog_urls}, sitemap_url = ${next.sitemap_url}, org_nr = ${next.org_nr}, meta_page_id = ${next.meta_page_id},
      notes = ${next.notes}, active = ${next.active}
    where id = ${id} returning *`;
  return json(row);
}, { edit: true });

export const DELETE = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return err("Mangler id.");
  if (b.hard) await db()`delete from seo.competitors where id = ${id}`;
  else await db()`update seo.competitors set active = false where id = ${id}`;
  return json({ ok: true });
}, { edit: true });
