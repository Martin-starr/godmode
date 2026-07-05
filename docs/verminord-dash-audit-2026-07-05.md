# dash.verminord.app — Audit, mobilfix og videre plan

**Dato:** 2026-07-05
**Omfang:** https://dash.verminord.app (Vercel-prosjekt `verminord-dash`, Next.js 14)
**Utløst av:** «På mobil fikk jeg ikke lagt til prosjekt eller oppgave»

---

## 1. Rotårsak: det var ikke (bare) mobilen

Vercel-runtimeloggene viser hva som faktisk skjedde da du prøvde (natt til 5. juli):

| Tid (UTC) | Kall | Resultat |
|---|---|---|
| 01:47:42–01:47:48 | `POST /api/projects` × 5 | **504 — Task timed out after 300 seconds** |
| 01:47:49 | `GET /api/bootstrap` | 200 OK |
| 01:48:14–01:48:36 | `POST /api/tasks` × 7 | **504 — Task timed out after 300 seconds** |

Altså: *alle* skrive-kall for oppgaver/prosjekter hang i 5 minutter og døde,
mens lesing virket. Du fikk null tilbakemelding i appen (den ignorerte feil),
så det så ut som knappene var døde. De 12 loggede forsøkene er deg som trykker
igjen og igjen.

Backend kobler til Supabase-Postgres (skjema `dash`, rolle `dash_app`) gjennom
Supavisor-pooleren. Mønsteret — lesing OK i varme lambdaer, alle skrivinger fra
nye/kalde lambdaer i kø til evig tid — er den klassiske kombinasjonen
*session-mode pooling + serverless* (hver lambdainstans holder en pool-plass;
når plassene er brukt opp står nye tilkoblinger i kø uten timeout).

**I tillegg** var mobilopplevelsen reelt ødelagt: bunn-menyen var en horisontalt
scrollende stripe uten indikator, der bare de 4 første fanene (Brief, Logg,
Systemer, Hygienisering) var synlige. Oppgaver, Prosjekter, SOP og
Innstillinger lå utenfor skjermen. Og «Logg ut» fantes ikke på mobil.

## 2. Kompliserende funn: kildekoden fantes ikke

Appen ble i sin tid deployet **rett fra en midlertidig Claude-container** til
Vercel (CLI-deploy, ingen git-kobling). Repoet `Martin-starr/verminord-dash`
finnes ikke. Kildekoden var altså tapt — ingenting å fikse i.

Jeg har derfor **rekonstruert hele appen** fra produksjonsbundelen (JS + CSS
lastet ned fra Vercel-deployen) og databaseskjemaet, og lagt den i dette repoet:
**repo-roten** (`app/`, `lib/`, `public/` — lagt i roten slik at Vercels
git-integrasjon virker uten oppsett). Rute-tabellen fra `next build` matcher originalen
1:1 (samme 25 ruter, samme sidestørrelse ±0,4 kB). Fra nå av er appen
versjonskontrollert.

## 3. Hva som er fikset i rekonstruksjonen

**Backend (rotårsaken):**
- Transaction-pooler (port 6543) i stedet for session-mode, `prepare:false`,
  maks 1 tilkobling per lambda, 10 s connect-timeout, 8 s statement-timeout.
- `maxDuration` 15–25 s per API-rute — feil svarer på sekunder, aldri 300.
- Tilkoblingsstreng og Sheets-config auto-detekteres fra eksisterende
  env-variabler på Vercel-prosjektet (uansett variabelnavn).
- Passordsjekk er bakoverkompatibel med eksisterende hasher i `dash.team`
  (prøver scrypt/pbkdf2/sha256-varianter mot `salt:hash`-formatet).

**Mobil:**
- Bunn-meny som 2×4-grid — alle 8 seksjoner synlige uten scrolling.
- Safe-area-padding (iPhone), 16 px skriftstørrelse i inputs (hindrer at iOS
  zoomer inn ved fokus), større trykkflater på små knapper («+ Ny», «Endre»,
  avkrysninger), «Logg ut» tilgjengelig øverst.
- Feil vises som melding («Fikk ikke kontakt med serveren — prøv igjen»)
  i stedet for stille ingenting; 15 s klient-timeout; dobbelklikk-vern.

**Verifisert lokalt** (ekte Postgres med dash-skjemaet + produksjonsbygg +
Playwright i iPhone-størrelse): innlogging, alle 8 seksjoner nåbare, **oppgave
lagt til på 73 ms**, **prosjekt opprettet på 68 ms**, måling loggført, desktop
uendret, feil passord avvises. 11/11 tester grønne, skjermbilder tatt.

## 4. Slik deployes fiksen (kun klikk — ingen tasting)

Claude-miljøets nettverkspolicy blokkerer `api.vercel.com`, så deploy skjer via
Vercels git-integrasjon. Appen ligger i repo-roten nettopp for at standard-
innstillingene skal stemme:

1. vercel.com → prosjektet **verminord-dash** → **Settings** → **Git**
2. **Connect Git Repository** → GitHub → velg **Martin-starr/godmode**
3. Ferdig — alle standardvalg er riktige (Root Directory `./`,
   production branch `master`). Hver push til master deployer automatisk.

Claude overvåker prosjektet og dytter en deploy så snart koblingen er på
plass. (Fallback: GitHub-workflowen «Deploy verminord-dash» med et
`VERCEL_TOKEN`-secret, eller `npx vercel deploy` lokalt — se DASHBOARD.md.)

**Sjekk etter deploy:** Innstillinger → Datakilde. Står Google Sheets som
«Ikke tilkoblet», sett `DASH_SHEETS_ID` + `DASH_SHEETS_API_KEY` på
Vercel-prosjektet (auto-detekteringen fant da ikke de gamle variabelnavnene).
Alle må også logge inn på nytt én gang (ny session-cookie).

## 5. Sikkerhetsnotater (ikke blokkerende)

- `dash`-skjemaet har RLS av, men er kun tilgjengelig for rollen `dash_app`
  (ikke anon/service_role via API) — greit slik.
- Passordhasher ligger i `dash.team.pw` med per-bruker-salt — greit.
- Vurder å rotere `dash_app`-passordet og legge den nye URL-en som
  `DASH_DATABASE_URL` når dere først er inne i Vercel-innstillingene, siden
  den gamle strengen har ligget i en tapt container.
- Fra forrige audit (www.verminord.app): anon-nøkkelen gir fortsatt
  skrivetilgang til enkelte `public`-tabeller — står fremdeles åpen.

## 6. Forslag videre — enkelt og effektivt

Rangert etter nytte/innsats. Alt kan bygges inn i dashbordet som allerede er
skjermen dere ser på hver dag.

### A. E-post-triage via Gmail (det du beskrev)
Du har M365-posten videresendt til Gmail, og Gmail-connectoren er allerede
koblet til Claude. Det gjør dette til den enkleste av alle integrasjonene:

- En **daglig Claude-rutine** (07:00) leser innboksen via Gmail-connectoren,
  filtrerer bort støy, og plukker de 3–5 e-postene som faktisk krever noe
  («svar tilbudsforespørselen», «Mattilsynet ber om dokumentasjon», «faktura
  forfaller»).
- Resultatet skrives inn i dashbordet som en **«Innboks»-seksjon på Brief**
  (én ny tabell + ett API-endepunkt) — og de som krever handling kan
  opprettes rett som Oppgaver, med lenke til e-posten.
- Du åpner aldri innboksen for å *lete*; du ser bare det som betyr noe,
  der du allerede er.

Effekten: e-post slutter å være et sted du kvier deg for å gå inn i.
Jeg kan bygge dette som neste steg — si ifra, så setter jeg opp rutinen og
Brief-seksjonen.

### B. AI-morgenbrief med plan og trender
En seksjon øverst på Brief (eller egen «I dag»-side) generert hver morgen:

- **Dagens plan:** åpne oppgaver + rutiner + det e-post-triagen fant, sortert
  i anbefalt rekkefølge («CFT2 har ikke fått måling på 2 dager — start der»).
- **Trender fra loggene:** «CFT1-temp har falt 4 dager på rad», «fukt i Wedge 1
  ligger 6 % under mål denne uka», «pH stabil i alle systemer». Enkle regler +
  én LLM-setning per funn — ikke noe tungt.
- Været på Jæren inn i planen (gratis Yr-API) siden drift er væravhengig.

### C. Små driftsvakter (ingen AI, bare nyttig)
- **Stale-varsel:** system uten måling på >48 t flagges på Brief.
- **Avviksstreker:** tre målinger på rad utenfor målområdet → gull-badge.
- **PWA:** manifest + ikon slik at dashbordet kan legges på hjemskjermen som
  app — 30 minutters jobb, stor mobilgevinst.

### D. Senere, hvis behovet melder seg
- Ukesrapport på e-post (fredag): produksjon, avvik, fullførte oppgaver.
- Foto-logg: ta bilde av benken ved måling, lagres på avlesningen.
- Notion-tokobling for prosjektene (dere har allerede sync-infrastrukturen
  fra forrige runde).

**Anbefaling:** A først (størst smerte, minst jobb siden connectoren er klar),
deretter B i enkel form, C underveis.
