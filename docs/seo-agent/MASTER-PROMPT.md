# Master prompt — Verminord SEO agent

Paste everything below the line into a fresh Claude Code session on the
`Martin-starr/godmode` repository. It assumes `docs/seo-agent/PLAN.md` is
merged or present on the branch, and that the decisions in PLAN.md §9 are
either answered or left at their defaults.

---

You are implementing the weekly automated SEO agent for Verminord AS, exactly as
specified in `docs/seo-agent/PLAN.md`. Read that file first, in full, then
`docs/seo-agent/SETUP-CHECKLIST.md`, `DASHBOARD.md`, `docs/overvaking.md`,
`.github/workflows/scheduled-jobs.yml`, `lib/ai.js`, `lib/db.js`,
`lib/integrations.js`, `dash-scripts/migrations/005_health_retention_sensors_routines.sql`,
`dash-scripts/migrations/007_batches.sql`, `app/api/inbox/enrich/route.js`,
`app/api/health/check/route.js`, and `app/page.js` lines 1–40, 242–314,
652–857, 2293–2315, 2449–2474, 3697–3710, 4150–4250. Load the `claude-api`
skill before writing any call to the Anthropic API so model ids and the
structured-output format are current.

Work on the branch this session was given. Commit in logical steps with clear
messages. Push and open a **draft** pull request at the end. Do not push to
`master`.

## Non-negotiable constraints from this repository

1. **Database calls are strictly sequential.** Never `Promise.all` queries
   against the Supabase transaction pooler. This is stated in
   `app/api/bootstrap/route.js:40-42` and it is not optional.
2. **Everything user-facing is Norwegian bokmål**: UI labels, email, pulse
   entries, error strings. Code and code comments are English. Every new file
   opens with a comment that says *why* it exists, in the style of the
   existing migrations and routes.
3. **No secrets in code.** The repo is public. Read everything from
   `process.env`. Never hard-code a fallback value for a key or URL.
4. **Degrade, never abort.** Each collector checks its own configuration
   first. Missing key → write one `seo.pulse` row of kind `konfig`, severity
   `notis`, title «<Steg> er ikke konfigurert», and return. Runtime failure →
   `fail("seo:<step>", message)` via `lib/integrations.js`, one pulse row of
   severity `viktig`, and continue to the next step. The brief and the email
   must still go out with whatever data exists.
5. **`vercel.json` keeps `crons: []`.** Do not touch `scheduled-jobs.yml`.
   The SEO job gets its own workflow file.
6. **Idempotent everywhere.** Re-running any step for the same week must not
   create duplicates. Use natural keys and `on conflict`.
7. **Use existing helpers, do not re-implement them:** `claude()` and
   `activeModel()` from `lib/ai.js`, `ok()/fail()/tracked()` from
   `lib/integrations.js`, `guarded()/json()/err()/withWatchdog()` from
   `lib/http.js` in API routes, the `Chart` SVG component and the
   `.htbl/.tscroll/.kpi/.sechead/.toggle` classes in the front end.
8. **Public-facts only in prompts.** The voice rules you embed for the brief
   and the blog drafts may include only facts already printed on the product
   or on verminord.com (see `CUSTOMER_BRIEF` in `lib/ai.js`). No wholesale
   price, no feedstock recipe, no supplier names. Never claim
   ABP-godkjenning, never write «økologisk sertifisert» (the correct term is
   Debio-registrert), never mention øl-mask, papp, biokull or
   «mykorrhiza-substrat» as råvarer. Voice: understated, farmer-meets-scientist,
   no exclamation marks, no buzzwords, first person from Martin is fine.

## Enabling ESM so the pipeline can import `lib/`

Add `"type": "module"` to `package.json`. Change the import in
`lib/integrations.js` from `@/lib/db` to `./db`. Run `npm run build` and
confirm the Next.js build is still green before anything else. If the build
breaks for a reason you cannot fix in ten minutes, fall back to a
self-contained `seo/lib/` with copies of the Claude client and the DB client,
and say so in the PR body.

## Deliverable 1 — migration `dash-scripts/migrations/008_seo.sql`

Header comment in the house style (summary line, the why, the apply command
`psql "$DASH_DATABASE_URL" -1 -f dash-scripts/migrations/008_seo.sql`).
Every statement idempotent. Contents:

- `create schema if not exists seo;` and grants to the role that owns
  `dash` (find it with `select tableowner from pg_tables where schemaname='dash' limit 1`
  via the Supabase MCP `execute_sql` on project `ftjxpivxeavxdgcfpsba`).
- All tables from PLAN.md §6 with these natural keys:
  - `seo.runs (id bigserial pk, week text, step text, started_at, finished_at, status text, error text, stats jsonb)`
  - `seo.sites (site_url text pk, gsc_property text, ga4_property_id text, active bool default true)`
  - `seo.keywords (keyword text pk, cluster text, priority int default 2, active bool default true, added_at)`
  - `seo.competitors (id bigserial pk, name, domain text unique, org_nr text, kind text check (kind in ('produsent','merke','forhandler','serp','kunnskap')), product_urls text[], blog_urls text[], sitemap_url text, meta_page_id text, google_advertiser text, active bool default true, discovered_from text, notes text)`
  - `seo.ai_prompts (id bigserial pk, prompt text unique, lang text default 'no', intent text, active bool default true)`
  - `seo.gsc_daily (date, site_url, page, query, country, device, clicks int, impressions int, ctr numeric, position numeric, primary key (date, site_url, page, query, country, device))`
  - `seo.ga4_daily (date, site_url, dimension_kind text, dimension text, sessions int, users int, engaged_sessions int, conversions numeric, primary key (date, site_url, dimension_kind, dimension))`
  - `seo.psi_audits (id bigserial pk, run_at, week, url, strategy, perf_score int, lcp_ms int, cls numeric, inp_ms int, fcp_ms int, tbt_ms int, crux jsonb, opportunities jsonb)`
  - `seo.serp_snapshots (week, keyword, rank int, url, domain, title, kind text, raw jsonb, primary key (week, keyword, kind, rank))`
  - `seo.competitor_snapshots (week, competitor_id, url, price_nok numeric, in_stock bool, stock_text, title, excerpt, hash text, changed bool, fetched_at, primary key (week, url))`
  - `seo.competitor_posts (url text pk, competitor_id, title, published_at date, first_seen timestamptz)`
  - `seo.competitor_tech (week, competitor_id, platform text, signals jsonb, primary key (week, competitor_id))`
  - `seo.company_facts (org_nr text pk, fetched_at, name, nace_code, nace_text, employees int, founded date, fiscal_year int, revenue_nok bigint, result_nok bigint, raw jsonb)`
  - `seo.ads (platform text, competitor_id, ad_key text, first_seen date, last_seen date, active bool, headline, body, landing_url, media_kind, raw jsonb, primary key (platform, ad_key))`
  - `seo.ai_visibility (week, engine text, prompt_id, model text, mentioned bool, mention_rank int, competitors_mentioned text[], citations jsonb, answer text, asked_at, primary key (week, engine, prompt_id))`
  - `seo.news (url text pk, title, source, published_at, summary, relevance int, tags text[], first_seen)`
  - `seo.leads (id bigserial pk, org_nr text, name, kind, region, url, source, icp_score int, reason, status text default 'ny' check (status in ('ny','kontaktet','ikke aktuell','kunde')), first_seen, unique (coalesce(org_nr, url)))` — implement the uniqueness with a unique index on `coalesce(org_nr, url)`.
  - `seo.pulse (id bigserial pk, at timestamptz default now(), week, source, kind, severity text check (severity in ('info','notis','viktig')), title, body, data jsonb, read bool default false)`
  - `seo.briefs (week text pk, generated_at, model, summary_md, brief jsonb, sent_at, email_id)`
  - `seo.content_drafts (id bigserial pk, week, kind text check (kind in ('blogg','instagram','facebook','linkedin','nyhetsbrev')), keyword, title, body_md, status text default 'utkast' check (status in ('utkast','godkjent','publisert','forkastet')), created_at, updated_at)`
  - `seo.calendar (id bigserial pk, title, kind text check (kind in ('sesong','kampanje','frist','hendelse')), starts_on date, ends_on date, note, recurring_yearly bool default true, sort int default 0)`
- Indexes on `seo.gsc_daily (site_url, date)`, `seo.gsc_daily (query)`, `seo.gsc_daily (page)`, `seo.pulse (week)`, `seo.serp_snapshots (keyword, week)`.
- `insert ... on conflict do nothing` into `dash.integrations` for keys
  `seo:gsc`, `seo:ga4`, `seo:psi`, `seo:serp`, `seo:competitors`, `seo:brreg`,
  `seo:ads`, `seo:news`, `seo:ai`, `seo:scout`, `seo:brief`, `seo:send`, all
  with `expected_interval_min = 10080` (weekly) and labels «SEO · Search Console»
  etc.
- Seed data from PLAN.md §7: `seo.sites` (verminord.com; property name comes
  from env at runtime, so store `site_url` only), `seo.keywords` (~30 with
  clusters: merke, produkt, bruk, kunnskap, lokal), `seo.ai_prompts` (16),
  `seo.competitors` (every row from PLAN.md §1.3 with kind, domain and the
  product/blog/sitemap URLs you can determine; Jordkompaniet with org data
  only), `seo.calendar` (the table in §7, as yearly recurring rows).

Apply it with the Supabase MCP `apply_migration` tool on project
`ftjxpivxeavxdgcfpsba` (name `008_seo`) or with psql if a connection string is
available, then verify with `list_tables` for schema `seo`. Do not expose the
`seo` schema through the Data API.

## Deliverable 2 — the pipeline: `seo/`

Plain Node 20, ESM, `.mjs` files. New runtime dependencies allowed:
`cheerio` (HTML parsing), `playwright` (ads only, chromium). Keep `postgres`
as the DB client. No SDKs for Google, OpenAI, Gemini, Perplexity or Serper:
use `fetch`, the same way `lib/ai.js` does.

```
seo/
  run.mjs                 CLI: node seo/run.mjs [--only step[,step]] [--week YYYY-Www] [--backfill] [--dry-run]
  README.md               how it works, how to run a step locally, how to add a keyword/competitor/prompt
  lib/
    db.mjs                own postgres client (same pooler rules as lib/db.js, statement_timeout 60s, max 1), plus week helpers
    google-auth.mjs       service-account JWT → access token (RS256 with node:crypto, no library). Scopes webmasters.readonly + analytics.readonly
    fetch.mjs             fetch with timeout, retry (429/5xx, 3 tries, backoff), UA "VerminordSEO/1.0 (+https://verminord.com)", 1–2 s politeness delay per host
    pulse.mjs             pulse(week, source, kind, severity, title, body, data)
    runs.mjs              startRun(week, step) / finishRun(id, status, error, stats); wraps tracked("seo:<step>", …)
    text.mjs              normalisers: domain from URL, NOK price from text, stock detection, ISO week
  steps/
    01-gsc.mjs
    02-ga4.mjs
    03-psi.mjs
    04-serp.mjs
    05-competitors.mjs
    06-brreg.mjs
    07-ads.mjs
    08-news.mjs
    09-ai.mjs
    10-scout.mjs
    11-analyze.mjs
    12-brief.mjs
    13-send.mjs
  prompts/
    voice.md              public-facts brand voice for the brief and drafts (see constraint 8)
    brief.md              the brief prompt + the JSON schema
    news-filter.md
    lead-score.md
    ai-mention.md         how to detect a mention (case-insensitive «Verminord», «VermiCast», «verminord.com/.no»; rank = order among named vendors)
  fixtures/               small HTML/JSON samples for tests
  test/                   node --test files for lib/text.mjs, 11-analyze.mjs scoring, mention detection
```

`run.mjs` resolves the week (`--week` or the ISO week containing today, in
Europe/Oslo), runs steps in order, never throws out of a step, prints a
one-line summary per step, and exits non-zero only if `send` was expected and
failed or if `DASH_DATABASE_URL` is missing. `--dry-run` runs collectors
against the network but writes nothing and prints what it would write.

### Step specifications

**01-gsc.** Env `GOOGLE_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL` (may be a
comma-separated list; store each in `seo.sites`). Endpoint
`POST https://www.googleapis.com/webmasters/v3/sites/{encoded siteUrl}/searchAnalytics/query`,
dimensions `["date","page","query","country","device"]`, `rowLimit` 25000
with `startRow` paging, date range = the 7 days ending 3 days before the run
date; with `--backfill` or when `seo.gsc_daily` is empty for the site: 16
months in 30-day chunks. Upsert. Also fetch the aggregate (no dimensions) for
the same window and store it as `page='*'`, `query='*'` so totals do not
depend on the 25 000-row cap. Pulse `info` with totals.

**02-ga4.** Env `GA4_PROPERTY_ID`. `POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport`
twice: by `sessionDefaultChannelGroup` and by `landingPagePlusQueryString`,
metrics `sessions, totalUsers, engagedSessions, conversions`, same 7-day
window. Upsert into `seo.ga4_daily` with `dimension_kind` = `kanal` / `landingsside`.

**03-psi.** `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=&strategy=mobile|desktop&category=performance[&key=]`
for the site root and the 5 pages with most clicks in `seo.gsc_daily` last 28
days. Store `performance score`, LCP, CLS, INP (fall back to TBT if INP is
absent), FCP, CrUX `loadingExperience` if present, and the top 5
`opportunities` (id, title, savings ms). Pulse `notis` when a score drops
more than 10 points vs the previous audit of the same url+strategy.

**04-serp.** Env `SERPER_API_KEY`. For each active keyword:
`POST https://google.serper.dev/search` with `{ q, gl: "no", hl: "no", num: 20 }`
→ organic (rank, link, title, snippet), `peopleAlsoAsk`, `answerBox`; and
`POST https://google.serper.dev/news` with `{ q, gl:"no", hl:"no" }` for the
keywords in cluster `merke` and `produkt` only. Store organic as
`kind='organisk'`, PAA as `kind='paa'` (rank = order), news items go to
`seo.news` with `relevance` null (step 08 scores them). Any domain in
organic top 10 that is not in `seo.competitors` and not a known non-vendor
(google.*, wikipedia, youtube, facebook, instagram, finn.no, nibio, nlr,
mattilsynet, permakultur.no, regjeringen.no) is inserted with
`kind='serp'`, `discovered_from='serp:<keyword>'`. Pulse `notis` for each
new domain.

**05-competitors.** For every active competitor with `product_urls`: fetch
each URL (cheerio; if the page has no price and no stock text and the HTML
contains `__NEXT_DATA__` or `window.Shopify` or a `data-product` JSON, try
the JSON first; if still nothing and Playwright is installed, render once).
Extract: title, price in NOK (first `\d{2,5}(?:[.,]\d{2})?\s?(kr|NOK|,-)`
near the product title or in `itemprop=price`/`og:price:amount`), stock:
`in_stock=false` when text matches `/utsolgt|ikke på lager|midlertidig tomt|sold out|kommer snart|ikke tilgjengelig/i`
or an add-to-cart button is `disabled`, `in_stock=true` when
`/på lager|legg i handlekurv|kjøp nå|add to cart/i` and none of the
out-of-stock patterns; else `null`. `hash` = sha1 of the normalised
(title, price, stock) tuple; `changed` = hash differs from the previous week.
Blog posts: parse `sitemap_url` (and nested sitemaps) for `<url><loc>` +
`<lastmod>`; anything under a `blog_urls` prefix with lastmod in the last 14
days or not yet in `seo.competitor_posts` is inserted; fall back to fetching
each `blog_urls` page and reading `<article>`/`<a>` links with dates. Tech:
platform from signatures (`cdn.shopify.com`→Shopify, `wp-content`→WordPress/
WooCommerce, `static.parastorage.com`→Wix, `squarespace`, `webflow`,
`mystore`, `24nettbutikk`, `quickbutik`, `magento`), and signals for GA4
(`G-XXXX`), Meta pixel (`fbq(`), Klaviyo, Hotjar, TikTok pixel. Pulse `viktig`
for a stock change or a price change > 5 %, `notis` for a new post, `info`
for tech.

**06-brreg.** For competitors with `org_nr` (resolve missing ones by name via
`GET https://data.brreg.no/enhetsregisteret/api/enheter?navn=<name>` and take
an exact-name match only): `GET https://data.brreg.no/enhetsregisteret/api/enheter/{orgnr}`
and `GET https://data.brreg.no/regnskapsregisteret/regnskap/{orgnr}`. Store
NACE, employees (`antallAnsatte`), founded (`stiftelsesdato`), and from the
latest regnskap: fiscal year, `salgsinntekter` or `sumDriftsinntekter` as
revenue, `aarsresultat` as result. Refresh only if `fetched_at` is older than
30 days. Pulse `info` once per refreshed company.

**07-ads.** Best-effort, Playwright chromium, 45 s budget per competitor.
Meta: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=NO&view_all_page_id=<meta_page_id>`
when `meta_page_id` is set, else the search variant with `q=<name>` and
`country=NO`; wait for the results container, read ad cards (start date,
body text, headline, landing link, media kind). Google:
`https://adstransparency.google.com/?region=NO&domain=<domain>`; read creative
cards. `ad_key` = platform id if visible, else sha1 of (advertiser, headline,
body). Upsert: `first_seen` stays, `last_seen` = today, `active` = seen this
run; ads not seen this run get `active=false`. Pulse `viktig` for each new
ad, `notis` when a competitor's active count changes. If neither page renders
in time → `fail("seo:ads", …)` and one pulse `notis` «Annonsedata mangler
denne uka». Skip the step entirely, without failing, when `SKIP_ADS=1`.

**08-news.** RSS/Atom (parse with a small regex/XML walk, no library):
Mattilsynet news + høringer, Landbruksdirektoratet, Debio, NIBIO, NLR,
regjeringen.no høringer for Landbruks- og matdepartementet — find the actual
feed URLs at implementation time and put them in `seo/steps/08-news.mjs` as a
constant with a comment on each; if a source has no feed, fetch its news
index page and read links. Merge with the unsorted Serper news rows. For every
row with `relevance is null`, ask Claude (Haiku-class via `DASH_AI_MODEL` if
set, else `activeModel()`) in one batched call per 20 items, structured
output: `{ url, relevance 0-5, tags[], summary (one Norwegian sentence: why it matters to Verminord) }`.
Delete rows with relevance < 2, keep ≥ 2, pulse `viktig` for ≥ 4.

**09-ai.** For every active prompt and every configured engine, ask once with
web search enabled and store the full answer:
- Anthropic: `lib/ai.js` cannot pass tools, so add an optional `tools` and
  `toolChoice` passthrough to `claude()` (keep the default behaviour
  unchanged) and use the web search tool per the `claude-api` skill.
- OpenAI (`OPENAI_API_KEY`): Responses API with the `web_search` tool, the
  current default general model per OpenAI docs at implementation time.
- Gemini (`GEMINI_API_KEY`): `generateContent` with `tools: [{ google_search: {} }]`, current Flash model.
- Perplexity (`PERPLEXITY_API_KEY`): chat completions, model `sonar`.
Then detect mentions with pure code (no LLM): `mentioned` = regex on
Verminord/VermiCast/verminord.(com|no); `mention_rank` = position of
Verminord among the ordered list of vendor names found from
`seo.competitors.name` + Verminord; `competitors_mentioned` = those names;
`citations` = URLs in the response metadata plus URLs in the text. Store the
model id actually used. Pulse `viktig` when a prompt flips from mentioned to
not mentioned (or the reverse) on the same engine vs last week.

**10-scout.** Brreg: `GET https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=<code>&kommunenummer=<nr>&fraRegistreringsdatoEnhetsregisteret=<last run date>&size=100`
for the NACE codes and municipalities in a constant (Rogaland municipalities
1101–1160 first; then fylke-level lists for Vestland, Agder, Viken/Oslo/
Innlandet), paging with `page`. Serper: 10 discovery queries per run, rotated
weekly from a list of ~40 («hagesenter Rogaland», «planteskole Jæren»,
«andelslandbruk Rogaland», «økologisk gård Vestland», «gartneri Stavanger»
…). Candidates not in `seo.leads`, not in `dash.partners` (by name,
case-insensitive), and not a competitor go to Claude in batches of 20 with the
ICP from PLAN.md §7 → `{ icp_score 0-100, kind, region, reason }`. Insert
those ≥ 40. Pulse `notis` per lead ≥ 70.

**11-analyze.** Pure code, no LLM. Computes and writes `seo.pulse` rows plus a
single JSON object it hands to step 12 (also persist it under
`seo.briefs.brief.analysis` for the week). Definitions:
- *Window*: this week = 7 days ending 3 days before run; previous = the 7
  before that; baseline = the 28 days before this week.
- *Totals* from the `page='*'` rows; *by query* and *by page* from detailed rows.
- *Movers*: queries with ≥ 20 impressions whose average position changed by
  ≥ 2 places or whose clicks changed by ≥ 30 % vs previous week.
- *Decay*: pages whose clicks this week are < 70 % of the 8-week weekly
  average and had ≥ 10 clicks/week on average.
- *Opportunities*: queries with average position between 8 and 20 this week,
  ≥ 30 impressions in the last 28 days; `score = impressions28 × (ctrTarget(5) − ctrNow) / (position − 5)`
  with a fixed CTR curve (pos1 .28, 2 .15, 3 .11, 4 .08, 5 .07, 6–10 .04, 11–20 .015).
  Top 10, each with the best current page for that query.
- *SERP side by side*: for the 10 highest-priority keywords, the rank of
  Verminord and of each competitor domain this week and last week.
- *Competitor changes*: rows with `changed=true`, new posts, new/ended ads,
  refreshed company facts (with a naive «anslått vermikompost-volum» only when
  the company's NACE is a fertiliser/soil code, computed as revenue ÷ 5 L unit
  price of their listed product ÷ an assumed 30 % category share, and always
  labelled «anslag»).
- *AI visibility*: mention rate per engine this week and last week, prompts
  that flipped, the three most-cited domains across engines.
- *News*: rows with relevance ≥ 3 first seen this week.
- *Leads*: new this week, top 5 by score.
- *Technical*: PSI deltas ≥ 10 points; any GSC page that returned to 0 clicks
  from ≥ 5.
- *Calendar*: `seo.calendar` rows active in the next 42 days.

**12-brief.** Claude (`activeModel()`), structured output. System prompt =
`prompts/voice.md` + `prompts/brief.md`. Input = the analysis JSON. Output
JSON schema:
```
{ headline: string,               // one sentence
  numbers: [{label, now, prev, base}],
  movements: [string],
  opportunities: [{query, page, action}],   // max 5
  competitors: [string],
  ai_visibility: string,
  news: [{title, why}],           // max 3
  leads: [{name, why}],           // max 3
  technical: [string],
  content_moves: [{title, keyword, angle, page, why_now}],  // exactly 3
  next_weeks: [string],
  blog_draft: {title, keyword, body_md}      // 600–1200 words, Norwegian
}
```
Also render `summary_md` from the JSON in code (not by the model) so the
layout is deterministic. Store both in `seo.briefs`, insert the blog draft in
`seo.content_drafts` (kind `blogg`, status `utkast`). Pulse `info` «Ukesbrief
generert».

**13-send.** Env `RESEND_API_KEY`, `SEO_BRIEF_EMAIL`, optional `ALERT_FROM`.
Subject «SEO-brief uke NN — <headline>». Send `html` (simple inline-styled
template: navy `#1B2B4A`, gold `#C9A84C`, cream `#FCFAF5`, system font, max
width 600 px, sections in the order of PLAN.md §4, a button «Åpne i
dashbordet» → `https://dash.verminord.app`) and `text` (the markdown). Store
`sent_at` and the Resend id. If the week's brief was already sent and
`--resend` is not passed, skip.

## Deliverable 3 — `.github/workflows/seo-weekly.yml`

Name «SEO ukesjobb». `schedule: - cron: "30 3 * * 1"`. `workflow_dispatch`
with input `job` (choice: `all`, plus each step name) and boolean `backfill`.
`concurrency: seo-weekly`, `timeout-minutes: 45`. Steps: checkout,
`actions/setup-node@v4` node 20 with npm cache, `npm ci`,
`npx playwright install --with-deps chromium` only when job is `all` or
`ads`, then `node seo/run.mjs --only <job or all> [--backfill]` with all
secrets from SETUP-CHECKLIST.md mapped to env. Header comment explaining why
this is not in `scheduled-jobs.yml` (different runtime needs, long duration)
and why 03:30 UTC (three hours of slack before the 07:00 Oslo brief). A
non-zero exit fails the job on purpose, same philosophy as the existing
workflow.

## Deliverable 4 — API routes `app/api/seo/*`

All `guarded`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`,
`maxDuration = 15`, sequential queries, Norwegian error strings:

- `GET /api/seo/overview` → latest brief, KPI totals (this/prev/base), integration statuses for `seo:*`, unread pulse count.
- `GET /api/seo/pulse?week=&source=&severity=&limit=` ; `PUT` `{ids, read}`.
- `GET /api/seo/search?range=7D|28D|90D|ALL` → totals by day (for `Chart`), tracked keywords with position series, decay list, opportunities from the latest brief analysis. `POST/DELETE /api/seo/keywords`.
- `GET /api/seo/competitors` → competitors with latest snapshot, posts (last 10), tech, company facts, ads (active), SERP side-by-side. `POST/PUT/DELETE /api/seo/competitors` (edit rights).
- `GET /api/seo/ai?weeks=12` → mention rate per engine per week, latest answers. `POST/DELETE /api/seo/prompts`.
- `GET /api/seo/leads?status=` ; `PUT /api/seo/leads/[id]` `{status}`.
- `GET/POST/PUT/DELETE /api/seo/calendar`.
- `GET /api/seo/content` ; `PUT /api/seo/content/[id]` `{status, title, body_md}`.
- `GET /api/seo/briefs?week=` → one brief or the list of weeks.

## Deliverable 5 — the «SEO» section in `app/page.js`

Add `["seo", "SEO"]` to `NAV_ARBEID`. Add `SeoView` following
`FeedingBatchesView` (lazy sub-tabs, own `load()`, `loadError` with retry,
Norwegian empty states that distinguish «ikke kjørt ennå» from «feil»).
Sub-tabs and content per PLAN.md §5. Reuse `Chart` for the search trend and
the AI-visibility trend. Tables use `.tscroll > table.htbl`. Mobile first:
Martin reads this on a phone; every table must scroll horizontally inside its
container, tap targets ≥ 44 px, and the Pulse list must be readable as cards
on narrow screens. Calendar: three toggles (År · Kvartal · Måned); year view
is 12 rows of month with items as pills; month view is a list. Keep the
component under ~900 lines; split into `SeoPulse`, `SeoSearch`,
`SeoCompetitors`, `SeoAi`, `SeoLeads`, `SeoCalendar`, `SeoContent` helpers in
the same file, matching how the file is organised today.

On `BriefView`: one extra KPI «Søk 7 d» (clicks, with the delta as caption)
sourced from a new `seo` block in `/api/bootstrap` (one sequential query on
`seo.gsc_daily` aggregate rows; skip silently if the schema is absent), and a
three-row «Siste fra SEO-agenten» block under the inbox digest that links to
the Pulse tab.

## Deliverable 6 — documentation

- `seo/README.md`: what runs when, how to run one step locally, how to add a
  keyword / competitor / prompt / calendar item, how to read the health
  banner, what each pulse severity means.
- New section «SEO-agent» in `DASHBOARD.md` (Norwegian), same tone as the
  cron section, listing the workflow, the schema, and the secrets by name.
- Update `docs/seo-agent/SETUP-CHECKLIST.md` if any secret name or step
  changed while implementing.

## Verification before you open the PR

1. `npm run build` green.
2. `node --test seo/test/` green, with fixtures for: price/stock parsing on
   three real competitor pages saved as fixtures, opportunity scoring,
   decay detection, mention detection (Norwegian text with and without
   Verminord, and with «Verminord» inside a URL only).
3. `node seo/run.mjs --dry-run --only gsc,serp,ai` with no keys set prints
   «ikke konfigurert» for each and exits 0.
4. With whatever keys are available in the environment, run
   `node seo/run.mjs --only analyze,brief --week <current>` against the real
   database and paste the generated `summary_md` into the PR body.
5. Migration applied and `seo` tables listed via Supabase MCP.
6. Screenshot or a description of the SEO tab on a 390 px wide viewport
   (Playwright is available: `npm run dev` + a headless screenshot).

## PR body

Draft PR titled «SEO-agent: ukentlig innsamling, Claude-brief, Pulse og
SEO-fane». Body in Norwegian: what was built, what Martin must do next (link
to SETUP-CHECKLIST.md), what is best-effort (ads), the generated brief from
verification step 4, and anything you deviated from in PLAN.md and why.
