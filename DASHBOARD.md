# Verminord Intern Dashbord (dash.verminord.app)

Next.js 14-app for internal drift på Jæren: produksjonslogging (temp/pH/fukt),
systemoversikt, §19-hygienisering, oppgaver, prosjekter (kanban), partnere,
SOP-/dokumentbibliotek og innstillinger. Norsk UI, IBM Plex Sans, navy/gull.

## Bakgrunn

Appen ble opprinnelig deployet rett fra en midlertidig Claude Code-container
til Vercel-prosjektet `verminord-dash` **uten at kildekoden ble lagret noe
sted**. Denne mappen er en fullstendig rekonstruksjon fra produksjonsbundelen
(2026-07-05), pluss feilrettinger. Se `docs/verminord-dash-audit-2026-07-05.md`
i repo-roten for hele historikken.

Fikset i denne versjonen:

- **POST-endepunktene hang i 300 s (504)** — oppgaver/prosjekter kunne ikke
  legges til. Ny databaselag: Supavisor *transaction pooler* (port 6543),
  `prepare:false`, 1 tilkobling per lambda, 10 s connect-timeout, 8 s
  statement-timeout og `maxDuration` 15–25 s per rute, slik at feil svarer
  raskt i stedet for å henge.
- **Mobil:** bunn-menyen viste i praksis bare de 4 første fanene (horisontal
  scroll uten indikator) — Oppgaver/Prosjekter var utilgjengelige. Nå 2×4-grid
  med alle 8 seksjoner synlige, safe-area-padding, 16 px input-font (hindrer
  iOS-zoom), større trykkflater, og «Logg ut» tilgjengelig fra toppen.
- Feil vises nå (norsk feilmelding) i stedet for at knappene «ikke gjør noe».
- Dobbelklikk-vern på legg-til-knappene.

## Database

Dataene ligger i `dash`-skjemaet i Supabase-prosjektet
`ftjxpivxeavxdgcfpsba` (rolle `dash_app`). Tilkoblingsstrengen finnes
automatisk: `DASH_DATABASE_URL`/`DATABASE_URL`/`POSTGRES_URL` eller en hvilken
som helst env-variabel som inneholder en `postgres://…`-URL (slik at de
eksisterende variablene på Vercel-prosjektet fortsetter å virke uansett navn).
Session-pooler-URL-er (port 5432) skrives automatisk om til transaction-pooler
(6543).

Passord verifiseres mot eksisterende `salt:hash`-format med flere KDF-kandidater
(scrypt, pbkdf2, sha256-varianter); nye passord skrives som scrypt.

## Deploy

Nettverkspolicyen i Claude-miljøet blokkerer `api.vercel.com`, så deploy gjøres
via GitHub Actions eller lokalt:

**GitHub Actions (anbefalt):** Legg inn repo-secret `VERCEL_TOKEN`
(vercel.com → Settings → Tokens → Create), og kjør workflowen
«Deploy verminord-dash» (Actions-fanen). Prosjekt-ID-ene er allerede i
workflowfila.

**Lokalt:**

```bash

npm install
npx vercel pull --yes --environment=production   # logg inn når CLI spør
npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

## Planlagte jobber (cron)

Kjøres fra **GitHub Actions**, ikke fra `vercel.json`
(`.github/workflows/scheduled-jobs.yml`):

| Jobb | Endepunkt | Frekvens |
|---|---|---|
| Vakthund | `/api/health/check` | Hver time |
| Innboks-triage | `/api/inbox/enrich` | Hver time (:15) |
| Dokumentasjonskontroll | `/api/compliance/gaps` | Månedlig, 1. kl. 07:00 UTC |

Vercel-kontoen er på **Hobby**, som avviser enhver cron som kjører oftere enn
daglig. Den timesbaserte vakthunden fra #26 gjorde derfor at *hver eneste ferske
produksjonsbygging feilet* — stille, siden en mislykket bygging bare lar forrige
deploy bli stående. Produksjon sto låst til en redeploy av en pre-cron-bygging
fra 2026-07-30 mens #29–#32 ble merget uten å nå ut.

`vercel.json` beholder derfor en tom `crons: []` med vilje. **Ikke legg crons
tilbake der** uten å oppgradere til Vercel Pro først.

Krever repo-secret `CRON_SECRET` (samme verdi som env-variabelen på Vercel).
Valgfri repo-variabel `DASH_BASE_URL` overstyrer `https://dash.verminord.app`.
Jobbene kan kjøres manuelt fra Actions-fanen («Run workflow» → velg jobb).

Et ikke-2xx-svar feiler jobben med rødt kryss i Actions. Det er ytterste
overvåkingslag: vakthunden kan ikke melde fra om sin egen død.

## Lokal utvikling

```bash
# Postgres med dash-skjema + testdata (passord: test123)
psql ... -f dash-scripts/schema.sql
psql ... -v pw="<scrypt-hash>" -f dash-scripts/seed-local.sql

DASH_DATABASE_URL=postgresql://... DASH_DB_NO_SSL=1 npm run dev
```

## Ferdigstillings-runden 12.07.2026

- **Logg:** høyere trendgraf, «Skriv ut historikk» skriver ut valgfri
  dato-periode som tett regneark-tabell (tilsynsdokumentasjon). Tomme felt
  lagres som NULL («—»), aldri som 0.
- **Systemer:** større grafer i Brief-stil med periodevelger (7D–ALL).
- **Innboks:** én faneline (Åpne · Svar kreves · Utkast klare · Ferdige ·
  Alle), tydelig sammendragslinje per e-post, «AI-triage»-knapp
  (`/api/inbox/enrich`), og heuristikken flagger Verminord-infrafeil som
  viktige i stedet for å arkivere dem (finn.no/engangskoder arkiveres).
- **Oppgaver:** prioritet + frist (migrasjon 004), filtrering/sortering,
  global toast (før var suksess/feil usynlig utenfor Logg-siden).
- **Prosjekter:** hjernedump også her; kortene åpner et stort detaljvindu;
  hurtigflytting mellom Planlagt/Pågår/Fullført.
- **Innstillinger:** team-administrasjon (legg til/endre/slett + passord,
  kun Admin), AI-oppsettguide og «Test AI» (`/api/ai/test`).

## Kjente hull etter rekonstruksjon

- **Google Sheets-synk:** den timebaserte synken er pensjonert; app-loggene
  leses live fra `public.logs` via viewet `dash.readings_all`
  (migrasjon 001/003). Gmail-innboksen synkes deterministisk via Apps
  Script-broen (`Synk nå`/`Oppdater` i appen).
- **Logoene** (`logo-dark.png`/`logo-white.png`) er binærfiler som ikke kunne
  hentes ut herfra; deploy-workflowen kopierer dem fra det kjørende nettstedet.
  Uten dem vises et tekst-ordmerke i samme stil.
- **Center 374-parseren** (hygienisering) er skrevet på nytt og er tolerant for
  CSV/TSV med dato+tid og opptil 4 temperaturkolonner — test med en ekte
  eksportfil.

## SEO-agent

Fanen **SEO** viser det den ukentlige SEO-agenten samler inn: ukesbrief,
Pulse-strøm, Search Console-trender, konkurrenter, AI-synlighet, leads,
årshjul og innholdsutkast. Selve innsamlingen kjører **ikke** i denne appen
(Hobby-lambdaer tåler ikke 10–15 minutter), men som et Node-skript i GitHub
Actions:

| Jobb | Fil | Frekvens |
|---|---|---|
| SEO ukesjobb | `.github/workflows/seo-weekly.yml` → `node seo/run.mjs` | Mandag 03:30 UTC, eller «Run workflow» med valg av steg |

Data ligger i skjemaet `seo` (migrasjon `dash-scripts/migrations/008_seo.sql`,
anvendt 2026-09-04). Appen leser via `app/api/seo/*`; Brief får en «SEO-agenten
· siste 7 dager»-blokk fra `/api/bootstrap` (utelates om skjemaet mangler).
Helsen til hvert steg vises i helsebanneret som `seo:<steg>`.

Secrets på GitHub (ikke Vercel): `DASH_DATABASE_URL`, `ANTHROPIC_API_KEY`,
`RESEND_API_KEY`, `SEO_BRIEF_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_JSON`,
`GSC_SITE_URL`, og valgfritt `GA4_PROPERTY_ID`, `SERPER_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`, `PSI_API_KEY`.
Trinn for trinn i `docs/seo-agent/SETUP-CHECKLIST.md`; hvordan agenten virker
i `seo/README.md`.

Merk: `package.json` har nå `"type": "module"` slik at `seo/` kan importere
`lib/ai.js`, `lib/db.js` og `lib/integrations.js` direkte. Next-bygget er
uendret av det.
