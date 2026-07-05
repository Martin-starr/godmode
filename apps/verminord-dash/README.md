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
cd apps/verminord-dash
npm install
npx vercel pull --yes --environment=production   # logg inn når CLI spør
npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

## Lokal utvikling

```bash
# Postgres med dash-skjema + testdata (passord: test123)
psql ... -f scripts/schema.sql
psql ... -v pw="<scrypt-hash>" -f scripts/seed-local.sql

DASH_DATABASE_URL=postgresql://... DASH_DB_NO_SSL=1 npm run dev
```

## Kjente hull etter rekonstruksjon

- **Google Sheets-synk:** logikken er reimplementert (timesynk ved bootstrap +
  «Synk nå»), og config plukkes opp fra env-variabler med vanlige navn eller en
  `AIza…`-nøkkel. Sjekk «Innstillinger → Datakilde» etter deploy: står det
  «Ikke tilkoblet», sett `DASH_SHEETS_ID` (regnearkets ID) og
  `DASH_SHEETS_API_KEY` på Vercel-prosjektet. Kolonneoverskrifter i arket
  gjenkjennes på navn (dato/system/temp/ph/fukt/fôr/notat/hvem).
- **Logoene** (`logo-dark.png`/`logo-white.png`) er binærfiler som ikke kunne
  hentes ut herfra; deploy-workflowen kopierer dem fra det kjørende nettstedet.
  Uten dem vises et tekst-ordmerke i samme stil.
- **Center 374-parseren** (hygienisering) er skrevet på nytt og er tolerant for
  CSV/TSV med dato+tid og opptil 4 temperaturkolonner — test med en ekte
  eksportfil.
