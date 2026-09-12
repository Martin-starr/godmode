# SEO-agent — oppsett Martin gjør selv

Alt her gjøres i nettleseren, ingenting krever kode. Regn med 45 minutter
første gang. Rekkefølgen er valgt slik at agenten kan kjøre med det som er
gjort så langt: mangler en nøkkel, hopper den over den delen og sier fra i
brevet.

Nøklene limes inn på GitHub: **github.com/Martin-starr/godmode → Settings →
Secrets and variables → Actions → New repository secret.** Navnene må være
nøyaktig som under.

## Trinn 1 — Google (Search Console + GA4), 15 min, viktigst

1. Gå til [console.cloud.google.com](https://console.cloud.google.com) med
   Google-kontoen som eier Search Console for verminord.com. Opprett prosjekt
   «verminord-seo».
2. **APIs & Services → Enable APIs**: slå på «Google Search Console API» og
   «Google Analytics Data API». (PageSpeed Insights API kan også slås på, valgfritt.)
3. **IAM & Admin → Service Accounts → Create**: navn `seo-agent`. Ingen roller
   trengs. Åpne kontoen → **Keys → Add key → JSON**. Fila lastes ned.
4. Kopier e-postadressen til tjenestekontoen (ser ut som
   `seo-agent@verminord-seo.iam.gserviceaccount.com`).
5. [search.google.com/search-console](https://search.google.com/search-console)
   → velg property for verminord.com → **Innstillinger → Brukere og
   tillatelser → Legg til bruker** → lim inn adressen, tilgang «Full».
   Noter hvordan property-en heter: enten `sc-domain:verminord.com` eller
   `https://www.verminord.com/`.
6. GA4: [analytics.google.com](https://analytics.google.com) → **Admin →
   Property → Property access management → +** → lim inn adressen, rolle
   «Viewer». Noter **Property ID** (tall, står under Admin → Property details).
   Har du ikke GA4 på verminord.com: opprett en property, og koble den i Wix
   under **Marketing & SEO → Marketing Integrations → Google Analytics**.
7. GitHub-secrets:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = hele innholdet i JSON-fila (åpne den i
     et tekstprogram, marker alt, lim inn).
   - `GSC_SITE_URL` = property-navnet fra punkt 5.
   - `GA4_PROPERTY_ID` = tallet fra punkt 6 (kan vente).

## Trinn 2 — Serper (Google-søk for Norge), 5 min

1. [serper.dev](https://serper.dev) → registrer deg. 2 500 søk gratis.
   Agenten bruker ~100 i uka. Når de er brukt opp: kjøp 50 000 for 50 USD,
   de varer i 6 måneder.
2. Dashboard → API key → kopier.
3. GitHub-secret `SERPER_API_KEY`.

## Trinn 3 — AI-motorer for synlighetsmåling, 15 min (kan gjøres senere)

Anthropic-nøkkelen finnes allerede på Vercel. Kopier den samme verdien inn som
GitHub-secret `ANTHROPIC_API_KEY` (Vercel → verminord-dash → Settings →
Environment Variables → vis verdi).

- OpenAI: [platform.openai.com](https://platform.openai.com) → API keys →
  Create. Legg inn 5 USD i forhåndsbetaling. Secret `OPENAI_API_KEY`.
- Gemini: [aistudio.google.com](https://aistudio.google.com) → Get API key.
  Gratis kvote holder. Secret `GEMINI_API_KEY`.
- Perplexity: [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
  → Generate. Legg inn 5 USD. Secret `PERPLEXITY_API_KEY`.

## Trinn 4 — Database og e-post, 5 min

Disse finnes på Vercel-prosjektet allerede. Kopier verdiene til GitHub-secrets
med samme navn:

- `DASH_DATABASE_URL` (Supabase-tilkoblingen, samme som appen bruker)
- `RESEND_API_KEY`
- `SEO_BRIEF_EMAIL` = adressen brevet skal til (f.eks. `Martin@verminord.no`).
  Uten verifisert domene i Resend må dette være adressen Resend-kontoen er
  registrert på.

`CRON_SECRET` finnes som GitHub-secret fra før og brukes ikke av SEO-jobben.

## Trinn 5 — To rettinger i Wix, 5 min

1. **Språk og region.** Wix-siden «Verminord AS» står med språk *engelsk* og
   land *USA*. Sett **Settings → Language & Region** til Norsk (bokmål) og
   Norge. Det påvirker hvordan Google leser siden.
2. **Bekreft GA4** er koblet (se trinn 1, punkt 6).

## Trinn 6 — Første kjøring

1. GitHub → **Actions → «SEO ukesjobb» → Run workflow → job: `all`**.
   Første gang henter den 16 måneder Search Console-historikk og tar 10–20
   minutter.
2. Sjekk e-posten. Åpne dash.verminord.app → **SEO**.
3. Gå gjennom **Konkurrenter** og **Søk** og fjern eller legg til det som er
   feil. Agenten lærer av lista, ikke av hukommelsen.

## Oversikt over alle secrets

| Navn | Påkrevd | Hva stopper hvis den mangler |
|---|---|---|
| `DASH_DATABASE_URL` | Ja | Alt |
| `ANTHROPIC_API_KEY` | Ja | Brevet, innholdsgrep, nyhetsfilter, lead-scoring |
| `RESEND_API_KEY` + `SEO_BRIEF_EMAIL` | Ja | E-posten (brevet ligger likevel i dashbordet) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` + `GSC_SITE_URL` | Ja | Søkedata, forfall, muligheter |
| `GA4_PROPERTY_ID` | Nei | Økter og konverteringer |
| `SERPER_API_KEY` | Nei, men anbefalt | SERP side om side, nyheter, lead-søk |
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY` | Nei | AI-synlighet på den motoren |
| `PSI_API_KEY` | Nei | Ingenting (høyere kvote) |

## Valgfrie variabler (GitHub → Settings → Secrets and variables → Actions → Variables)

| Navn | Hva |
|---|---|
| `DASH_AI_MODEL` | Overstyr Claude-modellen for brevet (standard er den appen bruker). |
| `OPENAI_MODEL`, `GEMINI_MODEL` | Overstyr modell-id for AI-synlighet hvis standardvalget blir utdatert (`gpt-5`, `gemini-2.5-flash`). |
| `ALERT_FROM` | Avsender for brevet når domenet er verifisert i Resend, f.eks. `Verminord <agent@verminord.no>`. |
| `DASH_BASE_URL` | Lenken i brevet (standard `https://dash.verminord.app`). |
| `SKIP_ADS` | Sett til `1` for å hoppe over annonsesteget helt. |
