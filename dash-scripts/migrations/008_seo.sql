-- 008 — the weekly SEO agent: schema `seo`, connector-health rows, seed data.
--
-- Why a separate schema: everything the agent collects is history. Search
-- Console rows, SERP snapshots, competitor prices, AI answers — each week is
-- kept, never overwritten, so the dashboard can show a trend instead of a
-- snapshot. That is a different life cycle from the operational tables in
-- `dash` (which are edited in place), and keeping it apart means a mistake in
-- a collector can never touch a production log.
--
-- Why seeds live here: the agent learns from lists, not from memory. The
-- keywords, competitors, AI prompts and årshjul below are the starting point
-- Martin edits in the dashboard afterwards; they are `on conflict do nothing`
-- so re-running this file never undoes an edit. The competitor list is the
-- result of research on 2026-09-04 (see docs/seo-agent/PLAN.md §1.3).
--
-- Why RLS is on: the Supabase advisor flags every table without it. The app
-- role gets a permissive policy so nothing changes for it; anon/authenticated
-- have no grants and the schema is not exposed through the Data API anyway.
--
-- Every statement is idempotent; re-running is safe.
--
-- Apply with:
--   psql "$DASH_DATABASE_URL" -1 -f dash-scripts/migrations/008_seo.sql
-- or through the Supabase MCP `apply_migration` on project ftjxpivxeavxdgcfpsba.

create schema if not exists seo;

-- ---------------------------------------------------------------------------
-- 1. Bookkeeping and configuration
-- ---------------------------------------------------------------------------

create table if not exists seo.runs (
  id          bigserial primary key,
  week        text not null,                 -- ISO week, e.g. 2026-W36
  step        text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'kjører'
              check (status in ('kjører','ok','hoppet over','feilet')),
  error       text,
  stats       jsonb
);
create index if not exists runs_week_idx on seo.runs (week, step);

create table if not exists seo.sites (
  site_url        text primary key,          -- bare host, e.g. verminord.com
  gsc_property    text,                      -- sc-domain:verminord.com or https://www.verminord.com/
  ga4_property_id text,
  active          boolean not null default true
);

create table if not exists seo.keywords (
  keyword  text primary key,
  cluster  text not null default 'produkt'
           check (cluster in ('merke','produkt','bruk','kunnskap','lokal')),
  priority integer not null default 2 check (priority between 1 and 3),
  active   boolean not null default true,
  added_at timestamptz not null default now()
);

create table if not exists seo.competitors (
  id               bigserial primary key,
  name             text not null,
  domain           text not null unique,     -- bare host, punycode where needed
  org_nr           text,
  kind             text not null
                   check (kind in ('produsent','merke','forhandler','serp','kunnskap')),
  product_urls     text[] not null default '{}',
  blog_urls        text[] not null default '{}',
  sitemap_url      text,
  meta_page_id     text,
  google_advertiser text,
  active           boolean not null default true,
  discovered_from  text,
  notes            text,
  added_at         timestamptz not null default now()
);

create table if not exists seo.ai_prompts (
  id      bigserial primary key,
  prompt  text not null unique,
  lang    text not null default 'no',
  intent  text,
  active  boolean not null default true
);

-- ---------------------------------------------------------------------------
-- 2. Collected data (append-only per week / per date)
-- ---------------------------------------------------------------------------

create table if not exists seo.gsc_daily (
  date        date not null,
  site_url    text not null,
  page        text not null,                 -- '*' on the aggregate row
  query       text not null,                 -- '*' on the aggregate row
  country     text not null default '*',
  device      text not null default '*',
  clicks      integer not null default 0,
  impressions integer not null default 0,
  ctr         numeric,
  position    numeric,
  primary key (date, site_url, page, query, country, device)
);
create index if not exists gsc_daily_site_date_idx on seo.gsc_daily (site_url, date);
create index if not exists gsc_daily_query_idx on seo.gsc_daily (query);
create index if not exists gsc_daily_page_idx on seo.gsc_daily (page);

create table if not exists seo.ga4_daily (
  date             date not null,
  site_url         text not null,
  dimension_kind   text not null,            -- 'kanal' | 'landingsside'
  dimension        text not null,
  sessions         integer not null default 0,
  users            integer not null default 0,
  engaged_sessions integer not null default 0,
  conversions      numeric not null default 0,
  primary key (date, site_url, dimension_kind, dimension)
);

create table if not exists seo.psi_audits (
  id            bigserial primary key,
  run_at        timestamptz not null default now(),
  week          text not null,
  url           text not null,
  strategy      text not null check (strategy in ('mobile','desktop')),
  perf_score    integer,
  lcp_ms        integer,
  cls           numeric,
  inp_ms        integer,
  fcp_ms        integer,
  tbt_ms        integer,
  crux          jsonb,
  opportunities jsonb
);
create index if not exists psi_audits_url_idx on seo.psi_audits (url, strategy, run_at desc);

create table if not exists seo.serp_snapshots (
  week    text not null,
  keyword text not null,
  kind    text not null,                     -- 'organisk' | 'paa' | 'svarboks'
  rank    integer not null,
  url     text,
  domain  text,
  title   text,
  raw     jsonb,
  primary key (week, keyword, kind, rank)
);
create index if not exists serp_keyword_week_idx on seo.serp_snapshots (keyword, week);
create index if not exists serp_domain_idx on seo.serp_snapshots (domain);

create table if not exists seo.competitor_snapshots (
  week          text not null,
  competitor_id bigint references seo.competitors (id) on delete cascade,
  url           text not null,
  price_nok     numeric,
  in_stock      boolean,
  stock_text    text,
  title         text,
  excerpt       text,
  hash          text,
  changed       boolean not null default false,
  fetched_at    timestamptz not null default now(),
  primary key (week, url)
);

create table if not exists seo.competitor_posts (
  url           text primary key,
  competitor_id bigint references seo.competitors (id) on delete cascade,
  title         text,
  published_at  date,
  first_seen    timestamptz not null default now()
);

create table if not exists seo.competitor_tech (
  week          text not null,
  competitor_id bigint references seo.competitors (id) on delete cascade,
  platform      text,
  signals       jsonb,
  primary key (week, competitor_id)
);

create table if not exists seo.company_facts (
  org_nr      text primary key,
  fetched_at  timestamptz not null default now(),
  name        text,
  nace_code   text,
  nace_text   text,
  employees   integer,
  founded     date,
  fiscal_year integer,
  revenue_nok bigint,
  result_nok  bigint,
  raw         jsonb
);

create table if not exists seo.ads (
  platform      text not null check (platform in ('meta','google')),
  competitor_id bigint references seo.competitors (id) on delete cascade,
  ad_key        text not null,
  first_seen    date not null default current_date,
  last_seen     date not null default current_date,
  active        boolean not null default true,
  headline      text,
  body          text,
  landing_url   text,
  media_kind    text,
  raw           jsonb,
  primary key (platform, ad_key)
);
create index if not exists ads_competitor_idx on seo.ads (competitor_id, active);

create table if not exists seo.ai_visibility (
  week                  text not null,
  engine                text not null,       -- 'openai' | 'anthropic' | 'gemini' | 'perplexity'
  prompt_id             bigint references seo.ai_prompts (id) on delete cascade,
  model                 text,
  mentioned             boolean not null default false,
  mention_rank          integer,
  competitors_mentioned text[] not null default '{}',
  citations             jsonb,
  answer                text,
  asked_at              timestamptz not null default now(),
  primary key (week, engine, prompt_id)
);

create table if not exists seo.news (
  url          text primary key,
  title        text,
  source       text,
  published_at timestamptz,
  summary      text,
  relevance    integer check (relevance between 0 and 5),
  tags         text[] not null default '{}',
  first_seen   timestamptz not null default now()
);
create index if not exists news_first_seen_idx on seo.news (first_seen desc);

create table if not exists seo.leads (
  id         bigserial primary key,
  org_nr     text,
  name       text not null,
  kind       text,
  region     text,
  url        text,
  source     text,
  icp_score  integer check (icp_score between 0 and 100),
  reason     text,
  status     text not null default 'ny'
             check (status in ('ny','kontaktet','ikke aktuell','kunde')),
  first_seen timestamptz not null default now()
);
-- One lead per organisation, or per URL when no org.nr is known.
create unique index if not exists leads_identity_idx on seo.leads ((coalesce(org_nr, url, lower(name))));

create table if not exists seo.pulse (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  week     text not null,
  source   text not null,                    -- step name: gsc, serp, ads …
  kind     text not null,                    -- konfig, endring, mulighet, nyhet, lead, teknisk, brief …
  severity text not null check (severity in ('info','notis','viktig')),
  title    text not null,
  body     text,
  data     jsonb,
  read     boolean not null default false
);
create index if not exists pulse_week_idx on seo.pulse (week, at desc);
create index if not exists pulse_unread_idx on seo.pulse (read) where read = false;

create table if not exists seo.briefs (
  week         text primary key,
  generated_at timestamptz not null default now(),
  model        text,
  summary_md   text,
  brief        jsonb,
  sent_at      timestamptz,
  email_id     text
);

create table if not exists seo.content_drafts (
  id         bigserial primary key,
  week       text not null,
  kind       text not null check (kind in ('blogg','instagram','facebook','linkedin','nyhetsbrev')),
  keyword    text,
  title      text not null,
  body_md    text not null,
  status     text not null default 'utkast'
             check (status in ('utkast','godkjent','publisert','forkastet')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seo.calendar (
  id               bigserial primary key,
  title            text not null,
  kind             text not null check (kind in ('sesong','kampanje','frist','hendelse')),
  starts_on        date not null,
  ends_on          date,
  note             text,
  recurring_yearly boolean not null default true,
  sort             integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 3. Access: same role as the rest of the app, RLS on with a permissive policy
-- ---------------------------------------------------------------------------

grant usage on schema seo to dash_app;
grant select, insert, update, delete on all tables in schema seo to dash_app;
grant usage, select on all sequences in schema seo to dash_app;
alter default privileges in schema seo grant select, insert, update, delete on tables to dash_app;
alter default privileges in schema seo grant usage, select on sequences to dash_app;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'seo' loop
    execute format('alter table seo.%I enable row level security', t.tablename);
    if not exists (
      select 1 from pg_policies where schemaname = 'seo' and tablename = t.tablename and policyname = 'seo_app_all'
    ) then
      execute format('create policy seo_app_all on seo.%I for all to dash_app using (true) with check (true)', t.tablename);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Connector health rows. 10080 min = one week: the Brief goes gul after a
--    missed Monday and rød after two. NULL would never go stale.
-- ---------------------------------------------------------------------------

insert into dash.integrations (key, label, expected_interval_min) values
  ('seo:gsc',         'SEO · Search Console',        10080),
  ('seo:ga4',         'SEO · GA4',                   10080),
  ('seo:psi',         'SEO · PageSpeed',             10080),
  ('seo:serp',        'SEO · SERP (Serper)',         10080),
  ('seo:competitors', 'SEO · Konkurrentsider',       10080),
  ('seo:brreg',       'SEO · Brønnøysund',           10080),
  ('seo:ads',         'SEO · Annonser',              10080),
  ('seo:news',        'SEO · Nyheter og regelverk',  10080),
  ('seo:ai',          'SEO · AI-synlighet',          10080),
  ('seo:scout',       'SEO · Scout (leads)',         10080),
  ('seo:brief',       'SEO · Ukesbrief',             10080),
  ('seo:send',        'SEO · E-post',                10080)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Seeds
-- ---------------------------------------------------------------------------

insert into seo.sites (site_url) values ('verminord.com') on conflict do nothing;

insert into seo.keywords (keyword, cluster, priority) values
  ('Verminord',                        'merke',    1),
  ('VermiCast',                        'merke',    1),
  ('vermikompost',                     'produkt',  1),
  ('vermikompost kjøp',                'produkt',  1),
  ('norsk vermikompost',               'produkt',  1),
  ('meitemarkkompost',                 'produkt',  1),
  ('markkompost',                      'produkt',  1),
  ('mark kompost',                     'produkt',  2),
  ('meitemark gjødsel',                'produkt',  2),
  ('ormekompost',                      'produkt',  3),
  ('worm castings norge',              'produkt',  3),
  ('biohumus',                         'produkt',  2),
  ('kompost til chili',                'bruk',     1),
  ('kompost til tomat',                'bruk',     1),
  ('vermikompost te',                  'bruk',     2),
  ('kompostte',                        'bruk',     3),
  ('AACT',                             'bruk',     3),
  ('hvordan bruke vermikompost',       'bruk',     2),
  ('jord til chili',                   'bruk',     2),
  ('økologisk pottejord',              'bruk',     2),
  ('gjødsel til potteplanter økologisk','bruk',    3),
  ('frøstart vermikompost',            'bruk',     3),
  ('hva er vermikompost',              'kunnskap', 1),
  ('vermikompost vs kompost',          'kunnskap', 2),
  ('mikroliv i jord',                  'kunnskap', 3),
  ('regenerativt jordbruk gjødsel',    'kunnskap', 3),
  ('Debio gjødsel',                    'kunnskap', 2),
  ('økologisk gjødsel',                'kunnskap', 1),
  ('organisk gjødsel',                 'kunnskap', 2),
  ('jordforbedring',                   'kunnskap', 2),
  ('vermikompost Rogaland',            'lokal',    2),
  ('vermikompost Jæren',               'lokal',    2),
  ('vermikompost Stavanger',           'lokal',    2),
  ('kompost Jæren',                    'lokal',    3)
on conflict (keyword) do nothing;

insert into seo.ai_prompts (prompt, lang, intent) values
  ('Hvor kan jeg kjøpe vermikompost i Norge?',                          'no', 'kjøp'),
  ('Hvilke norske produsenter lager vermikompost?',                     'no', 'produsent'),
  ('Hva er den beste vermikomposten i Norge?',                          'no', 'anbefaling'),
  ('Anbefal en økologisk gjødsel til chili i potte',                    'no', 'anbefaling'),
  ('Hva er forskjellen på vermikompost og vanlig kompost?',             'no', 'kunnskap'),
  ('Finnes det norskprodusert meitemarkkompost?',                       'no', 'produsent'),
  ('Hvilken jordforbedring bør jeg bruke i drivhus på Vestlandet?',     'no', 'anbefaling'),
  ('Hvem selger vermikompost i Rogaland?',                              'no', 'lokal'),
  ('Er vermikompost tillatt i økologisk dyrking i Norge?',              'no', 'kunnskap'),
  ('Hvordan lager jeg kompost-te av vermikompost?',                     'no', 'bruk'),
  ('Hva koster vermikompost i Norge?',                                  'no', 'pris'),
  ('Beste økologiske gjødsel til tomater i drivhus',                    'no', 'anbefaling'),
  ('Hva er VermiCast?',                                                 'no', 'merke'),
  ('Hva er Verminord?',                                                 'no', 'merke'),
  ('Where can I buy vermicompost in Norway?',                           'en', 'kjøp'),
  ('Norwegian vermicompost producers',                                  'en', 'produsent')
on conflict (prompt) do nothing;

insert into seo.competitors (name, domain, kind, product_urls, blog_urls, sitemap_url, notes) values
  ('Mark og Grøde', 'xn--markoggrde-7cb.no', 'produsent',
   array['https://xn--markoggrde-7cb.no/handle/vermikompost/vermikompost-5-liter/',
         'https://xn--markoggrde-7cb.no/handle/vermikompost/vermikompost-bulk/'],
   array['https://xn--markoggrde-7cb.no/'],
   'https://xn--markoggrde-7cb.no/sitemap.xml',
   'markoggrøde.no. «Norges første produksjonsanlegg for meitemarkkompost». Nærmest Verminord i posisjonering.'),
  ('Reve Kompost AS', 'revekompost.no', 'produsent',
   array['https://www.revekompost.no/nettbutikk', 'https://www.revekompost.no/salg-av-kompost', 'https://www.revekompost.no/meitemark'],
   array['https://www.revekompost.no/'],
   'https://www.revekompost.no/sitemap.xml',
   'Klepp, Jæren. Levende jord, kompost, Hungrybin, meitemark. Lokal nabo.'),
  ('Edelmark AS', 'edelmark.no', 'produsent',
   array['http://edelmark.no/product/edel-meitemarker/'],
   array['http://edelmark.no/'],
   'http://edelmark.no/sitemap.xml',
   'Kompostmark (Eisenia) og betalt vermikompost-guide. Grunnlegger Alene Tesfamichael.'),
  ('Jordkompaniet AS', 'jordkompaniet.no', 'produsent',
   '{}', '{}', null,
   'Søreidgrend/Bergen, registrert 2001, gjødselbransjen. Ingen nettside funnet 2026-09-04 — Martin bekrefter.'),
  ('Grønn Vekst AS', 'gronnvekst.no', 'merke',
   array['https://www.gronnvekst.no/gjodsel/vermikompost'],
   array['https://www.gronnvekst.no/naturens-beste-gjodsel/vermikompost'],
   'https://www.gronnvekst.no/sitemap.xml',
   'Norges største produsent av kompostjord. Vermikompost 5 L spann fra Vermigrand (Østerrike). Sterkest organisk på «vermikompost».'),
  ('Nelson Garden', 'nelsongarden.no', 'merke',
   array['https://www.nelsongarden.no/produkter/vermikompost-biohumus-terra-p-7053',
         'https://www.nelsongarden.no/plantevern/gjodsel-og-plantenaering/vermikompost-biohumus-p-7052/'],
   '{}',
   'https://www.nelsongarden.no/sitemap.xml',
   'Svensk. Biohumus Terra 5 L (219–239 kr) og Biohumus vermikompost. Mest utbredte hyllevaren.'),
  ('Spiselig hage', 'spiselighage.no', 'forhandler',
   array['https://spiselighage.no/product/vermikompost-5l/'], '{}', 'https://spiselighage.no/sitemap.xml',
   'Vermikompost 5 L, trolig Grønn Vekst/Vermigrand.'),
  ('Garden Living', 'gardenliving.no', 'forhandler', '{}', '{}', null,
   'Fører Nelson Garden Biohumus Terra. Legg inn produkt-URL.'),
  ('Din Kjøkkenhage', 'dinkjokkenhage.no', 'forhandler',
   array['https://dinkjokkenhage.no/products/biohumus-terra-5l'], '{}', 'https://dinkjokkenhage.no/sitemap.xml',
   'Biohumus Terra 5 L.'),
  ('Nygård Hagebruk', 'hagebruk.no', 'forhandler',
   array['https://www.hagebruk.no/products/biohumus-terravermikompost-5-liter',
         'https://www.hagebruk.no/products/biohumus-vermikompost-5-liter'], '{}', 'https://www.hagebruk.no/sitemap.xml',
   'Biohumus Terra og Biohumus vermikompost.'),
  ('Planteliv', 'planteliv.no', 'forhandler',
   array['https://www.planteliv.no/product-page/soil-ninja-worm-castings'], '{}', null,
   'Soil Ninja Worm Castings (UK), stueplanter.'),
  ('Mikrogartneriet', 'mikrogartneriet.no', 'forhandler',
   array['https://www.mikrogartneriet.no/products/plagron-mega-worm-25l'], '{}', 'https://www.mikrogartneriet.no/sitemap.xml',
   'Plagron Mega Worm 25 L, growshop.'),
  ('Drivhussenter', 'drivhussenter.no', 'forhandler',
   array['https://drivhussenter.no/product-category/jord-og-gjodsel/'], '{}', null,
   'Biohumus-kategori.'),
  ('Zenso', 'zenso.no', 'forhandler',
   array['https://zenso.no/kategori/okologisk-dyrking/vermikompostering/'], '{}', null,
   'Vermikompostering-kategori (kasser).'),
  ('Plukkselv', 'plukkselv.no', 'forhandler',
   array['https://plukkselv.no/web/side/59'], '{}', null,
   'Innhold om vermikompost-te.'),
  ('Dyrkeland', 'dyrkeland.no', 'forhandler', '{}', '{}', null,
   'Verminord-forhandler. Legg inn produkt-URL for VermiCast når listet.'),
  ('Gartnerbutikken', 'gartnerbutikken.no', 'forhandler', '{}', array['https://blogg.gartnerbutikken.no/'], null,
   'Verminord-forhandler. Legg inn produkt-URL for VermiCast når listet.'),
  ('Smartvekst', 'smartvekst.no', 'forhandler', '{}', '{}', null,
   'Verminord-forhandler. Legg inn produkt-URL for VermiCast når listet.'),
  ('Plantasjen', 'plantasjen.no', 'forhandler', '{}', '{}', null, 'Kjede. Kategori-tilstedeværelse.'),
  ('Hageland', 'hageland.no', 'forhandler', '{}', '{}', null, 'Kjede. Kategori-tilstedeværelse.'),
  ('Felleskjøpet', 'felleskjopet.no', 'forhandler', '{}', '{}', null, 'Kjede. Kategori-tilstedeværelse.'),
  ('Mester Grønn', 'mestergronn.no', 'forhandler', '{}', '{}', null, 'Kjede. Kategori-tilstedeværelse.'),
  ('Norsk Permakulturforening', 'permakultur.no', 'kunnskap', '{}', '{}', null, 'Rangerer på meitemarkkompost.'),
  ('NIBIO', 'nibio.no', 'kunnskap', '{}', '{}', null, 'Kunnskapskilde.'),
  ('NLR', 'nlr.no', 'kunnskap', '{}', '{}', null, 'Kunnskapskilde.'),
  ('Skolehager i Norge', 'skolehagerinorge.no', 'kunnskap', '{}', '{}', null, 'Kunnskapskilde.'),
  ('Hagepraten', 'hagepraten.no', 'kunnskap', '{}', '{}', null, 'Forum.'),
  ('Mattilsynet', 'mattilsynet.no', 'kunnskap', '{}', '{}', null, 'Regelverk.')
on conflict (domain) do nothing;

-- Årshjul. Dates are for 2026; recurring_yearly means the dashboard shifts
-- them to the current year. Everything here is a suggestion Martin edits.
insert into seo.calendar (title, kind, starts_on, ends_on, note, sort)
select * from (values
  ('Chili-såing starter',                    'sesong',   date '2026-01-10', date '2026-02-28', 'Innhold: frøstart med vermikompost. Martins spesialfelt.', 10),
  ('Hagesentre forhåndsbestiller vårvarer',  'kampanje', date '2026-01-15', date '2026-03-15', 'B2B-pitch-vindu. Forhandlere legger vårsortimentet nå.', 20),
  ('Vår-stell før planting',                 'sesong',   date '2026-03-01', date '2026-04-30', 'Toppdressing bed, pottejord, såing. Høysesong i søk.', 30),
  ('Påske',                                  'hendelse', date '2026-04-02', date '2026-04-06', 'Hagesentre har trafikk. Innlegg før påske.', 40),
  ('Hagemessen, Lillestrøm',                 'hendelse', date '2026-04-10', date '2026-04-12', 'Dato bekreftes årlig.', 50),
  ('17. mai og utplanting',                  'sesong',   date '2026-05-01', date '2026-05-31', 'Salgstopp i hagesentre. Utplanting av tomat og chili.', 60),
  ('Toppdressing i drivhus',                 'sesong',   date '2026-06-01', date '2026-07-31', 'Sommer. Lavere trafikk i fellesferien.', 70),
  ('Høsting: tomat og chili',                'sesong',   date '2026-08-01', date '2026-08-31', 'Resultat-innhold. Bilder fra drivhuset.', 80),
  ('Høst-tilbakeføring til jorda',           'sesong',   date '2026-09-01', date '2026-10-31', 'Bed og plen om høsten. Løvmold-innsamling med kommunen.', 90),
  ('Dyrsku''n, Seljord',                     'hendelse', date '2026-09-11', date '2026-09-13', 'Dato bekreftes årlig.', 100),
  ('Black Friday i nettbutikkene',           'kampanje', date '2026-11-20', date '2026-11-30', 'Konkurrentenes priser overvåkes ekstra.', 110),
  ('Gaver til dyrkere',                      'kampanje', date '2026-11-15', date '2026-12-20', 'Julegave-vinkel for forhandlere.', 120),
  ('Vinterkompost-innhold',                  'sesong',   date '2026-12-01', date '2027-02-28', 'Hva mark gjør når det er kaldt. Årsoppsummering.', 130),
  ('Debio-revisjon',                         'frist',    date '2026-06-01', null, 'Dato bekreftes av Martin.', 140),
  ('Mattilsynet-rapportering',               'frist',    date '2026-03-01', null, 'Dato bekreftes av Martin.', 150)
) as v(title, kind, starts_on, ends_on, note, sort)
where not exists (select 1 from seo.calendar);
