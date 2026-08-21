# verminord.no — landingsside v2

Designprototype for de fire skjermene i briefen. Ekte HTML/CSS/JS, ikke
mockups: kalkulatoren regner, lenkene virker, og layouten er mobil først.
Alt er statisk og selvstendig — ingen bygg, ingen avhengigheter, ingen
tredjepartskall.

| Fil | Hva det er |
|---|---|
| `index.html` | Skjerm 1–3. Hero, dokumentasjonsstripe, engros, overgang, kalkulator |
| `lokalt-utsalg.html` | Skjerm 4. Uoppført side, `noindex, nofollow` |
| `verminord.css` | Hele designsystemet |
| `kalkulator.js` | Dyrkersporet — fire spørsmål, ett om gangen |
| `fonts/` | IBM Plex Sans variabel, selvhostet |
| `sjekk.mjs` | Maskinell kontroll av briefens harde regler |
| `build-artefakt.mjs` | Pakker alt til én HTML-fil for deling |

Åpne `index.html` direkte i en nettleser. Ingen server nødvendig.

---

## Tre registre, aldri blandet

Hierarkiet fra v1 står. Det er bygget inn i knappesystemet, ikke bare i
rekkefølgen på siden — fire nivåer, ett per register:

| Nivå | Utseende | Hvem |
|---|---|---|
| 1 | Gull, fylt | Forhandler-CTA i heroen |
| 2 | Navy, fylt | Innsending av engrosskjemaet — samme handling, du er alt framme |
| 3 | Navy, omriss | Dyrkerens «Send meg planen» |
| 4 | Ren tekst | Dyrkergaffelen i heroen, og lenken til lokalt utsalg |

Gull forekommer **nøyaktig én gang** på hele nettstedet: hero-knappen.
Ordmerket er navy, fokusringen er navy, ingenting annet tar den fargen.
`sjekk.mjs` teller dette i beregnet stil og feiler om tallet ikke er 1.

Sidens rekkefølge holder kjøperen øverst: hero → dokumentasjon → engros →
overgang → kalkulator. Engrosblokka ligger **før** overgangen, slik at en
forhandler aldri må scrolle gjennom dyrkerinnhold for å finne fram.

## Lokalt utsalg

Fire ting holder siden vanskelig å snuble over, og alle fire sjekkes:

- ikke i topbar, ikke i footer, ikke lenket fra heroen
- `<meta name="robots" content="noindex, nofollow">`
- én inngang på nettstedet: tekstlenka nederst i kalkulatorsvaret, som
  først finnes etter at alle fire spørsmål er besvart
- ingen gull, ingen knapp, ingen pris

Siden lenker heller ikke til seg selv fra sin egen footer.

## Kalkulatoren

Fire spørsmål, ett om gangen, med stegteller og tilbakepil. Svar bevares
når du går tilbake. Treffflatene er minst 66 px høye — dette brukes med
skitne hender i et drivhus.

1. Hva skal du bruke den til? — styrer om støttelinja leder med innblanding
   eller toppdressing
2. Hva dyrker du? — Potter og kar / Bed og grønnsakshage / Drivhus / Plen / Annet
3. Hvor stort? — teller, presets, og for potter også typisk pottestørrelse
4. Har du gitt vermikompost her før? — plasserer deg i det dokumenterte bandet

Alle tall kommer fra Verminords egen dokumentasjon:

- toppdressing 100–200 g/m² · første sesong 200, av og til 150, hvert år 100
- innblanding 5–10 % av pottejordvolumet · 10 %, 7,5 %, 5 %
- salgsenhet 5 liters sekk, alltid rundet opp til hel sekk

Den briefede stien — *Begge deler → Bed og grønnsakshage → 20 m² → Ja, men
ikke hvert år* — gir ordrett setningen fra briefen. `sjekk.mjs` sammenlikner
tegn for tegn.

## Tre ting Martin må fylle inn

1. **Tettheten.** Regnestykket antar **5 L ≈ 2 kg** (0,4 kg/l). Briefens
   eget eksempel (3 kg ≈ 2 sekker) forutsetter noe mellom 1,5 og 3 kg per
   sekk, og 2 kg treffer midt i. Veier du en sekk og får noe annet, står
   tallet ett sted: `KG_PER_LITER` øverst i `kalkulator.js`.
2. **Adresse og Vipps-nummer** på lokalt utsalg. Står som `[Martin fyller
   inn]` og `[nummer]`, slik briefen ber om. Merk at footeren viser
   forretningsadressen (Orstadvegen 229) — den er offentlig i
   Brønnøysund, men om hentepunktet er samme sted og du vil holde det
   utenfor indeksert tekst, ta adressen ut av footeren.
3. **Hvor engrosskjemaet sender.** Skjemaet poster ingensteds ennå.

## Lagt til utover briefen

Tre ting briefen ikke spesifiserer, men som siden ikke fungerer uten:

- **Engrosblokka.** Hero-knappen måtte peke et sted. Navn, butikk, e-post,
  én linje om hva de selger i dag. Ingen priser.
- **Personvern i footeren.** Samtykkeavkryssingen trenger noe å lenke til.
  Bør bli en egen side før lansering.
- **Micro-overskriften «Vil du ha den skriftlig?»** over e-postfeltet, slik
  at feltet ikke dukker opp uten kontekst.

Topbar og footer er minimale og inneholder ingen navigasjon utover
ordmerket og én engroslenke.

## Fakta og språk

Alle tall og registreringer er hentet fra `verminord-brand-voice`
(faktaversjon 2026-08-14): N/P/K er friskvekttallene fra etiketten,
rapportnummeret er NO2604972, org.nr. 935 948 878.

Siden sier **Debio-registrert**, ikke sertifisert, og nevner ikke
ABP-godkjenning — den er fortsatt under behandling. Teksten er
gjennomgående «jeg», aldri «vi» eller «teamet».

## Tilgjengelighet

Gråtonene er satt etter kontrast, ikke etter smak: all tekst ligger over
4,5:1 mot kremen, alle kontrollkanter over 3:1. Hierarkiet bæres av
størrelse, vekt og sperring — ikke av blass farge.

Kalkulatoren melder stegbytte via `aria-live`, flytter fokus til det nye
spørsmålet, og merker valgt alternativ med `aria-pressed`. Fokusringen er
navy, ikke gull. Bildeplassholderen er merket i teksten, ikke bare i CSS.

## Sjekk og pakking

```
npm i playwright
node sjekk.mjs            # 19 kontroller mot briefens harde regler
node build-artefakt.mjs   # én selvstendig HTML-fil
```

`sjekk.mjs` leter etter pris i synlig tekst, utbytte- og vekstpåstander,
formuleringer som antyder ansatte, utropstegn, emoji, feil bruk av gull,
for tidlige lenker til lokalt utsalg, forhåndsavhuket samtykke og for små
treffflater. Den avslutter med kode 1 ved brudd, så den kan stå i CI.
