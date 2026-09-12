# SEO-agenten

Ukentlig innsamling, analyse og brev for Verminord. Kjører som et Node-skript i
GitHub Actions (`.github/workflows/seo-weekly.yml`, mandag 03:30 UTC), skriver til
skjema `seo` i Supabase, og vises i fanen **SEO** på dash.verminord.app. Planen
og bakgrunnen ligger i `docs/seo-agent/PLAN.md`; det Martin må sette opp selv
ligger i `docs/seo-agent/SETUP-CHECKLIST.md`.

## Slik kjører den

```
node seo/run.mjs                      alle 13 steg for inneværende uke
node seo/run.mjs --only gsc,serp      bare noen steg
node seo/run.mjs --week 2026-W35      kjør en tidligere uke på nytt
node seo/run.mjs --backfill           første kjøring: 16 måneder Search Console
node seo/run.mjs --dry-run            hent, men skriv ingenting
node seo/run.mjs --resend             send ukens brev på nytt
node seo/run.mjs --list               stegene i rekkefølge
npm test                              enhetstestene (node --test)
```

Lokalt trengs `DASH_DATABASE_URL` og de nøklene steget bruker; se tabellen i
`SETUP-CHECKLIST.md`. Uten en nøkkel hopper steget over og sier det i Pulse.

| Steg | Fil | Henter | Skriver |
|---|---|---|---|
| gsc | `steps/01-gsc.mjs` | Search Console per dag × side × søkeord × land × enhet, pluss tre aggregater | `seo.gsc_daily` |
| ga4 | `steps/02-ga4.mjs` | Økter, brukere, engasjerte økter, nøkkelhendelser per kanal og landingsside | `seo.ga4_daily` |
| psi | `steps/03-psi.mjs` | PageSpeed for forsiden og topp 5 sider, mobil og desktop | `seo.psi_audits` |
| serp | `steps/04-serp.mjs` | Google Norge topp 20 per søkeord, «Folk spør også», Google Nyheter. Nye domener i topp 10 → konkurrent av type `serp` | `seo.serp_snapshots`, `seo.competitors`, `seo.news` |
| competitors | `steps/05-competitors.mjs` | Pris og lager på produktsider, nye innlegg fra sitemap, plattform-fingeravtrykk | `seo.competitor_snapshots`, `seo.competitor_posts`, `seo.competitor_tech` |
| brreg | `steps/06-brreg.mjs` | Enhetsregisteret og Regnskapsregisteret per org.nr (oppdateres hver 30. dag) | `seo.company_facts` |
| ads | `steps/07-ads.mjs` | Meta Ad Library og Google Ads Transparency Center via Playwright (best effort) | `seo.ads` |
| news | `steps/08-news.mjs` | Mattilsynet, Landbruksdirektoratet, Debio, NIBIO, NLR, høringer + Google Nyheter; Claude gir relevans 0–5 | `seo.news` |
| ai | `steps/09-ai.mjs` | Spørsmålene i `seo.ai_prompts` til Claude, ChatGPT, Gemini og Perplexity med websøk | `seo.ai_visibility` |
| scout | `steps/10-scout.mjs` | Nyregistrerte selskaper (Brønnøysund) i relevante NACE-koder + Google-søk per region; Claude scorer mot kundeprofilen | `seo.leads` |
| analyze | `steps/11-analyze.mjs` | Ren regning: deltaer, forfall, muligheter, SERP side om side, konkurrentendringer, AI-rate | `seo.briefs.brief->analysis`, `seo.pulse` |
| brief | `steps/12-brief.mjs` | Claude skriver brevet som JSON; markdown rendres i kode | `seo.briefs`, `seo.content_drafts` |
| send | `steps/13-send.mjs` | Resend, HTML + tekst, til `SEO_BRIEF_EMAIL` | `seo.briefs.sent_at` |

Hvert steg registreres i `seo.runs` og i `dash.integrations` som `seo:<steg>`,
så det dukker opp i helsebanneret på Brief når det feiler eller uteblir.

## Pulse

Alt agenten finner går til `seo.pulse` med en alvorlighet:

- **viktig** — noe endret seg som Martin bør se: konkurrent utsolgt eller ny pris, ny annonse, AI-svar som snudde, nyhet med relevans 4–5, steg som feilet.
- **notis** — verdt å vite: nytt domene i topp 10, nytt konkurrentinnlegg, forfall, muligheter, lead med score ≥ 70, steg som ikke er konfigurert.
- **info** — tall og kvitteringer: klikk denne uka, hvor mange sider som ble lest.

Samme uke + kilde + tittel skrives aldri to ganger, så et steg kan kjøres om igjen.

## Legge til noe

Alt redigeres i dashbordet (SEO → Søk / Konkurrenter / AI-synlighet / Årshjul),
eller direkte i tabellene:

- **Søkeord:** `seo.keywords` (klynge: merke, produkt, bruk, kunnskap, lokal; prioritet 1–3; de 10 første i prioritetsrekkefølge er «kjerneordene» i SERP-tabellen).
- **Konkurrent:** `seo.competitors`. `product_urls` er sidene som leses for pris/lager, `blog_urls` og `sitemap_url` for nye innlegg, `meta_page_id` for Ad Library. Sett `active = false` i stedet for å slette, så historikken beholdes.
- **AI-spørsmål:** `seo.ai_prompts`, slik en kunde ville stilt det.
- **Årshjul:** `seo.calendar`. Datoer lagres med ett år; `recurring_yearly` flytter dem til året som vises.

## Når noe leses feil

Pris- og lagerlesningen ligger i `lib/text.mjs` (`parsePriceNok`, `detectStock`)
og `steps/05-competitors.mjs` (`readProductPage`). Lagre siden som en fixture i
`fixtures/`, legg til en test i `test/text.test.mjs`, juster mønsteret, kjør
`npm test`. Samme oppskrift for «nevnt»-logikken (`detectMentions`) og
mulighets-scoringen (`steps/11-analyze.mjs`).

## Hva som ikke er verifisert mot nett

Byggemiljøet hadde ikke nettverkstilgang til Brønnøysund, konkurrentsidene,
Meta eller Google. Testene bruker syntetiske fixtures, og API-formene er
skrevet fra dokumentasjon. Første ekte kjøring i Actions viser hva som må
justeres; hvert steg som feiler sier fra i Pulse og i helsebanneret.
