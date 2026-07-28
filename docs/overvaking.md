# Overvåking — to lag

Målet er enkelt: **du skal aldri være den som oppdager at noe har vært ødelagt
i to uker.** Gmail lå død fra 12. juli til 27. juli. Notion-speilet gikk fire
uker på tomgang under en overskrift som sa «oppdateres hvert 10. min».

Derfor to lag. Det ene fanger halvparten av feilene, det andre fanger resten.

---

## Lag 1 — innvendig vaktbikkje (`/api/health/check`)

Kjører hver time via Vercel cron. Sjekker, i den rekkefølgen ting faktisk har
gått i stykker:

1. **Konnektorer** — er noe stale eller feilende? Staleness *utledes* fra
   `expected_interval_min`, så en integrasjon som stille slutter å bli kalt
   fanges av alder, ikke av en feilmelding ingen leser.
2. **Daglig logg** — ingenting loggført innen 18:00 på en arbeidsdag?
   Sjekkes mot `dash.readings_all`, så en logg fra telefonen teller likt.
3. **Målinger utenfor mål** — temp/pH/fukt mot `dash.targets`.

**Sender e-post kun når noe er galt.** Ingen daglig «alt er bra»-melding: en
e-post som alltid kommer, slutter å bli lest — og da blir også den som betyr
noe skummet forbi.

Samme problem varsles maks én gang per 12 timer (`dash.meta`, nøkkel
`alert:*`). Uten det ville en død konnektor sendt 24 e-poster i døgnet og
endt i søppelpost, som er det samme som ingen varsling.

### Oppsett

Tre miljøvariabler på Vercel-prosjektet `verminord-dash`:

| Variabel | Verdi |
|---|---|
| `ALERT_EMAIL` | e-postadressen varsler skal til |
| `RESEND_API_KEY` | API-nøkkel fra [resend.com](https://resend.com) (gratis: 3 000/mnd) |
| `CRON_SECRET` | tilfeldig streng — hindrer at hvem som helst trigger varsel-e-post |

`ALERT_FROM` er valgfri. Uten eget domene bruk standardverdien; med domene,
verifiser det i Resend først.

Mangler `ALERT_EMAIL` eller `RESEND_API_KEY` kjører sjekken fortsatt og
returnerer resultatet som JSON — den logger bare at varselet ikke ble sendt.
Den feiler ikke stille.

### Teste den

    curl -H "Authorization: Bearer $CRON_SECRET" https://dash.verminord.app/api/health/check

Svarer med hva den fant og om e-post ble sendt.

---

## Lag 2 — utvendig oppetidssjekk

**Dette er lagd som fanger det lag 1 ikke kan.**

En vaktbikkje som bor inne i systemet den vokter, kan ikke melde fra om sin
egen død. Er Vercel nede, er Supabase utilgjengelig, eller slutter cron å
fyre — så kjører ikke lag 1, og da kommer det ingen e-post. Stillhet betyr da
«alt er bra» og «alt er nede» på nøyaktig samme måte.

Derfor må én ting stå utenfor.

### Oppsett (~5 min, gratis)

1. Lag konto på [uptimerobot.com](https://uptimerobot.com) (gratis: 50
   monitorer, 5 min intervall).
2. Ny monitor, type **HTTP(s)**:
   - `https://dash.verminord.app/api/health` — dashboardet
   - `https://log.verminord.app` — telefonloggeren
3. Varsling: e-post, og gjerne mobil-push via UptimeRobot-appen.

`/api/health` treffer databasen, så den svarer ikke OK hvis Supabase er nede.
Det gjør den til en ekte helsesjekk og ikke bare «svarer webserveren».

---

## Hva som IKKE er dekket

Ærlig liste, så du ikke tror dekningen er større enn den er:

- **Sensorene (Ecowitt)** — `autologger` har `expected_interval_min = 30`, så
  den varsler når gatewayen slutter å sende. Men den er ikke koblet til ennå;
  første ekte POST må inn før tallet betyr noe.
- **Feil data, riktig levert** — en sensor som melder 20 °C fordi den ligger
  på bakken i stedet for i bedet, ser helt frisk ut herfra.
- **Vercel-bygg som feiler** — Vercel sender egen e-post om det; ikke duplisert
  her.
- **Resend selv** — hvis Resend er nede kommer ikke varselet fram. Lag 2 dekker
  ikke dette. I praksis: to uavhengige leverandører må feile samtidig.
