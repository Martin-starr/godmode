# Eie ordet

*Skrevet 2026-09-22. Planen for å bli kilden AI-motorene siterer når noen i
Norge spør hva vermikompost, meitemarkkompost eller markkompost er.*

## Kort fortalt

Den mest siterte studien av hva som får innhold med i AI-svar (Aggarwal mfl.,
«GEO: Generative Engine Optimization», KDD 2024,
[arXiv:2311.09735](https://arxiv.org/abs/2311.09735)) fant at kilder,
sitater og tall løftet synligheten med opptil 40 %, mens søkeordfylling ikke
hjalp. Retningen er klar selv om tallene er veiledende: det andre skriver om
deg teller mer enn det du skriver om deg selv.

Fem grep. Grep 3 og 5 er bygget inn i SEO-agenten i denne PR-en. Grep 2 er
skrevet ferdig som utkast. Grep 1 og 4 må Martin gjøre selv; det som kan
forberedes, ligger her.

| # | Grep | Status |
|---|---|---|
| 1 | Én stavemåte og én adresse | Agenten sjekker det hver uke (steget `site`). Resten er klikking, se sjekklista under. |
| 2 | Pilarside: «Vermikompost i Norge — den komplette guiden» | Utkast i [`vermikompost-i-norge.md`](vermikompost-i-norge.md). Martin legger inn bilder, sjekker kildene og publiserer. |
| 3 | Writer annenhver uke, ett ekte spørsmål per innlegg | Gikk allerede annenhver uke (PR #46). Nå svarer hvert utkast på ett spørsmål fra Search Console, lenker til pilarsiden og siterer bare fra [`seo/prompts/sources.md`](../../seo/prompts/sources.md). |
| 4 | Omtale fra tredjeparter | Utkast i [`utkast-henvendelser.md`](utkast-henvendelser.md). Martin sender. |
| 5 | Måling | Tre nye AI-spørsmål, ett per ord (migrasjon 009). Første mandagsbrev hver måned har seksjonen «Eier vi ordet?». |

## 1. Én stavemåte og én adresse (ca. 1 time)

Fakta-arket sier **Verminord** (én stor bokstav, ingen mellomrom) og
**Verminord AS**. Produktet er **VermiCast**. Når navnet staves ulikt,
garderer AI-motorene seg.

- [ ] Nettstedet: tittel, footer, «om»-side, bildetekster. Steget `site` flagger «VermiNord», «Vermi Nord» og lignende i Pulse hver uke til det er borte.
- [ ] Wix: språk og region står som engelsk/USA (PLAN.md §1.2). Sett norsk/Norge.
- [ ] Google-bedriftsprofil: navn «Verminord», samme adresse som Brønnøysund.
- [ ] Brønnøysund: registrert som VERMINORD AS. Store bokstaver er registerets stil og er greit. Sjekk at adresse og nettadresse stemmer.
- [ ] Sekker, etiketter og produktdeklarasjon.
- [ ] Instagram, Facebook, YouTube, e-postsignatur.
- [ ] **Omdiriger verminord.com til verminord.no med 301**, for hele domenet og ikke bare forsiden. Den gamle teksten fra testperioden ligger fortsatt i Google. Steget `site` sier fra hver uke til omdirigeringen er permanent, og sier fra med «viktig» hvis den slutter å virke.
- [ ] Legg inn Organization-schema på forsiden (under).

Organization-schema til forsiden (Wix: Sideinnstillinger → SEO → Avansert →
Strukturert data). Legg Instagram-, Facebook- og YouTube-adressene inn i
`sameAs`, og sjekk Brønnøysund-lenken:

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Verminord AS",
  "alternateName": "Verminord",
  "url": "https://www.verminord.no/",
  "founder": { "@type": "Person", "name": "Martin Folkestad" },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Orstadvegen 229",
    "postalCode": "4353",
    "addressLocality": "Klepp Stasjon",
    "addressRegion": "Rogaland",
    "addressCountry": "NO"
  },
  "identifier": { "@type": "PropertyValue", "propertyID": "Organisasjonsnummer", "value": "935948878" },
  "sameAs": ["https://virksomhet.brreg.no/nb/oppslag/enheter/935948878"]
}
```

## 2. Pilarsiden

Utkastet er [`vermikompost-i-norge.md`](vermikompost-i-norge.md). Det dekker
definisjonen, alle tre ordene, kompostmeitemark mot hagemeitemark, hvordan det
lages, hva metaanalysene fant, regelverket i Norge, økologisk bruk, hva du bør
se etter når du kjøper, dosering, labtallene for VermiCast, vanlige spørsmål og
en kildeliste med 14 kilder.

Publiser den på **https://www.verminord.no/blogg/vermikompost-i-norge**. Bloggutkastene lenker
dit, og steget `site` sjekker den adressen. Blir adressen en annen, sett
GitHub-variabelen `SEO_PILLAR_URL`.

### Sjekk før publisering

Kildene ble funnet med websøk, men byggemiljøet fikk ikke åpne sidene selv. Hvert
sitat og tall under må sjekkes mot kilden før siden går live. Slik ser en ekte kilde ut
for en AI-motor, og en feil her koster mer enn den tjener.

- [ ] NIBIO, «Kompost»: definisjonen av meitemarkkompost, ordrett.
- [ ] SNL «kaldkompost»: ca. 40 °C, og at meitemark trives. SNL «meitemark»: *Eisenia fetida*, 6–12 cm.
- [ ] Agropub «Meitemark»: 19 arter i Norge; grå meitemark over 80 % i åker og eng; kompostmeitemark lever ikke i dyrket jord. Sjekk hvem som står bak siden.
- [ ] Blouin mfl. 2019: 26 % / 13 % / 78 % / 57 %, størst effekt ved 30–50 %, sterkere uten annen gjødsel. Les sammendraget.
- [ ] Ma mfl. 2022: 40–60 % som beste andel.
- [ ] Lovdata FOR-2025-01-29-116: i kraft 1. februar 2025.
- [ ] Mattilsynet, registrering: plikt før oppstart; unntak for eget bruk.
- [ ] Mattilsynet, tungmetallklasser: fire klasser (0, I, II, III); høyeste metall avgjør.
- [ ] Hygiene (salmonella, E. coli, ugressfrø) og plastkrav fra 2026: finn paragrafene i veilederen og vurder om lenker skal inn.
- [ ] EU 2021/1165 vedlegg II: «dejecta of worms (vermicompost)».
- [ ] Debio: «kan brukes i økologisk produksjon» som riktig formulering.
- [ ] NORSØK-publikasjonene: titler, år og medforfatter på «Studere meitemark i skolehagen».
- [ ] Egne opplysninger: CFT-høsting gjennom rist, kilebed, doseringstabellen, forklaringen av rottegrad.

### Strukturert data til pilarsiden

Article + FAQPage. Svarene er de samme som på siden; endres siden, endre dette
også.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Vermikompost i Norge — den komplette guiden",
      "inLanguage": "nb",
      "author": { "@type": "Person", "name": "Martin Folkestad" },
      "publisher": { "@type": "Organization", "name": "Verminord AS", "url": "https://www.verminord.no/" },
      "about": ["vermikompost", "meitemarkkompost", "markkompost"],
      "mainEntityOfPage": "https://www.verminord.no/blogg/vermikompost-i-norge"
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "Er vermikompost det samme som meitemarkkompost og markkompost?", "acceptedAnswer": { "@type": "Answer", "text": "Ja. Det er tre ord for samme ting: kompost laget av kompostmeitemark." } },
        { "@type": "Question", "name": "Hva er forskjellen på vermikompost og vanlig kompost?", "acceptedAnswer": { "@type": "Answer", "text": "Vanlig kompost brytes ned av mikroorganismer, ofte i en varm haug. Vermikompost lages av kompostmeitemark i en kald prosess, under ca. 40 °C. Resultatet er som regel finkornet og jevnt." } },
        { "@type": "Question", "name": "Kan jeg bruke meitemark fra hagen?", "acceptedAnswer": { "@type": "Answer", "text": "Nei, ikke særlig godt. Den vanligste meitemarken i norsk åker og eng, grå meitemark, lever i jorda. Til vermikompost trenger du kompostmeitemark, som regel Eisenia fetida, som lever i øverste lag av gjødsel og kompost." } },
        { "@type": "Question", "name": "Kan jeg lage vermikompost selv?", "acceptedAnswer": { "@type": "Answer", "text": "Ja. En kasse, kompostmeitemark, fuktig strø og jevnlig påfyll av organisk materiale er nok. Til eget bruk trenger du ikke registrere deg hos Mattilsynet." } },
        { "@type": "Question", "name": "Er vermikompost tillatt i økologisk dyrking?", "acceptedAnswer": { "@type": "Answer", "text": "Ja. Vermikompost står på EUs liste over gjødselvarer som kan brukes i økologisk produksjon, og Debio fører et register over driftsmidler i Norge." } },
        { "@type": "Question", "name": "Hvor mye vermikompost skal jeg bruke?", "acceptedAnswer": { "@type": "Answer", "text": "Omtrent 10 % innblandet i jord og potter, 20–30 % ved omplanting, og 100–200 g per m² som toppdressing." } },
        { "@type": "Question", "name": "Hva betyr rottegrad V?", "acceptedAnswer": { "@type": "Answer", "text": "Rottegrad er et mål på hvor moden en kompost er, fra I til V. V betyr fullt moden, altså at nedbrytingen er ferdig og komposten er stabil." } }
      ]
    }
  ]
}
```

## 3. Writer

Bloggutkastet skrives annenhver uke (oddetallsuker), som før. Det som er nytt:

- `analyze` samler spørsmålene folk faktisk har søkt på de siste 90 dagene
  (søk som begynner med hva, hvordan, hvorfor, kan, er … eller har spørsmålstegn).
- `brief` velger det mest viste spørsmålet som ingen tidligere utkast har brukt,
  og ber om et innlegg der første avsnitt svarer direkte. Det er avsnittet
  AI-motorene løfter ut.
- Hvert utkast lenker til pilarsiden. Glemmer modellen det, legger koden til
  lenken nederst.
- Kilder og tall fra forskning kommer bare fra `seo/prompts/sources.md`, samme
  liste som pilarsiden.
- Finnes det ingen ubesvarte spørsmål i Search Console, brukes ukens beste
  innholdsgrep, som før.

## 4. Omtale fra tredjeparter

Det er dette som faktisk flytter AI-svarene. Utkastene ligger i
[`utkast-henvendelser.md`](utkast-henvendelser.md):

- **SNL:** forslag til fagansvarlig om vermikompost i kompost-artikkelen, med kilder. Du kan ikke skrive artikkelen selv, men du kan peke på gode kilder.
- **Reidun Pommeresche, NORSØK:** en faglig samtale, ikke et salg.
- **Permakulturforeningen** og **Hagetidend** (Det norske hageselskap): gjesteartikkel.
- **Juliannes dyrkedagbok og YouTube-episodene:** last opp rene transkripsjoner; AI-motorene leser tekst, ikke lyd. Regelen om rensede kilder gjelder fortsatt.

Merk: **Oikos heter nå Økologisk Norge** (okologisknorge.no), ifølge søket. Skolehager i Norge er startet av dem.

## 5. Måling

- Migrasjon [`009_eie_ordet.sql`](../../dash-scripts/migrations/009_eie_ordet.sql) legger inn «Hva er vermikompost?», «Hva er meitemarkkompost?» og «Hva er markkompost?» med intent `begrep`. De stilles hver uke til alle AI-motorene som har nøkkel.
- Første mandagsbrev i måneden har seksjonen **«Eier vi ordet?»**: per ord, hvor ofte Verminord nevnes, hvor ofte en av Verminords sider siteres, og hvilke domener som siteres i stedet. Samme tall går til Pulse som en notis.
- AI-fanen i dashbordet viser svarene og kildene per spørsmål, som før.
- Spørsmål lagt til i dashbordet ble aldri stilt fordi de manglet intent. Det er rettet: de stilles nå.

## Status 2026-09-23

Gjort:

- Migrasjon 009 er kjørt i Supabase (prosjekt ftjxpivxeavxdgcfpsba). De tre spørsmålene stilles fra neste mandag.
- Guiden ligger som utkast (`draft: true`) i nettsiden, repoet `verminord-site`, fil `content/blogg/2026-09-23-vermikompost-i-norge.md`. Den vises i Vercel-forhåndsvisningen av grenen, ikke på verminord.no ennå. Adressen blir https://www.verminord.no/blogg/vermikompost-i-norge.
- Dosering i guiden og i agentens stemme følger nå bruksguiden på verminord.no.
- E-postutkastene ligger som kladder i Gmail.

Gjenstår (må gjøres i en nettleser):

1. **Gjør omdirigeringen permanent.** Første kjøring av steget `site` (2026-09-22) viste at verminord.com allerede sender videre til www.verminord.no, men med 307 (midlertidig). Rett det slik: Vercel → prosjekt verminord-site-final → Settings → Domains → verminord.com og www.verminord.com → Edit → velg 308 (Permanent) i stedet for 307.
2. **Sjekk kildene** i lista over, og si fra. Da settes `draft: false` og guiden går live.
3. **Send e-postene** fra Gmail-kladdene når guiden er live. Legg inn mottaker der det mangler.
4. Stavemåten på sekker, Google-profil og sosiale medier (sjekklista under grep 1).

## Ikke bekreftet

- Grønn Vekst / Vermigrand: registreringsnummer 9217 dukket opp i søk på den offentlige varedeklarasjonen ([produktfakta.no](https://www.produktfakta.no/vermikompost-varedeklarasjon-1261887/fil-files/Vermikompost+fra+Vermigrand+norsk+varedeklarasjon.pdf)). pH 8,6 ble ikke funnet.
- Torontostudien fra 2025 om at AI-søk siterer uavhengige kilder oftere enn merkevarens egne sider: ikke funnet eller sjekket.
- Tallene per metode i GEO-studien (Tabell 1) varierer mellom sekundærkilder. Bruk bare «opptil 40 %» fra sammendraget.
