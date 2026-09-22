-- 009 — «Eie ordet»: the three Norwegian words for the product, tracked in
-- AI answers, plus the health row for the new `site` step.
--
-- Norwegians search with three words for the same thing: vermikompost,
-- meitemarkkompost and markkompost. Whoever the AI engines cite when asked
-- «Hva er …?» owns the word. These three prompts get the intent 'begrep',
-- which seo/steps/09-ai.mjs asks every week and seo/steps/11-analyze.mjs
-- reviews monthly (first Monday brief of each month).
--
-- The keywords are already seeded in 008 at priority 1; they are re-activated
-- here in case one was switched off, without touching anything else.
--
-- Every statement is idempotent; re-running is safe.
--
-- Apply with:
--   psql "$DASH_DATABASE_URL" -1 -f dash-scripts/migrations/009_eie_ordet.sql
-- or through the Supabase MCP `apply_migration` on project ftjxpivxeavxdgcfpsba.

insert into seo.ai_prompts (prompt, lang, intent) values
  ('Hva er vermikompost?',     'no', 'begrep'),
  ('Hva er meitemarkkompost?', 'no', 'begrep'),
  ('Hva er markkompost?',      'no', 'begrep')
on conflict (prompt) do update set intent = excluded.intent, active = true;

insert into seo.keywords (keyword, cluster, priority) values
  ('vermikompost',     'produkt', 1),
  ('meitemarkkompost', 'produkt', 1),
  ('markkompost',      'produkt', 1)
on conflict (keyword) do update set active = true;

-- The site step: old-domain redirect, brand spelling, pillar page.
insert into dash.integrations (key, label, expected_interval_min) values
  ('seo:site', 'SEO · Egen side', 10080)
on conflict (key) do nothing;
