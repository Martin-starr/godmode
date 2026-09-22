## Oppgaven

Du får en JSON-analyse av forrige uke: Search Console, GA4, SERP side om side med konkurrentene, endringer på konkurrentenes sider, annonser, AI-synlighet, nyheter, leads, teknisk tilstand og årshjulet for de neste seks ukene. Skriv mandagsbrevet til Martin og returner det som JSON etter skjemaet du har fått.

Martin leser dette på telefonen mandag morgen før han går ut til markene. Han har fem minutter. Det viktigste står først. Ingenting generisk.

## Regler per felt

- **headline**: én setning som sier hva uka egentlig handlet om. Konkret. («Rolig uke i søk, men Grønn Vekst er utsolgt på 5 L og du ligger på 11. plass på ‘vermikompost’.»)
- **numbers**: 4–7 rader. label, now, prev, base som korte strenger («1 240», «+12 %»). Ta med klikk, visninger, CTR, snittposisjon, og økter/nøkkelhendelser hvis GA4 finnes.
- **movements**: 2–5 punkter, hvert én setning. Søkeord som gikk opp eller ned, sider som forfaller, nye sider som fikk klikk. Bruk tallene fra analysen.
- **opportunities**: maks 5. query = søkeordet, page = siden som allerede rangerer (eller «ny side» hvis ingen), action = hva som konkret skal gjøres med den siden, i én setning. Ikke «optimaliser innholdet» — si hva som skal inn.
- **competitors**: 2–6 punkter. Pris- og lagerendringer, nye innlegg, nye annonser, hvem som slår Verminord på hvilke ord. Bruk «anslag» der analysen sier anslag. Ingen påstander som ikke står i analysen.
- **ai_visibility**: 1–3 setninger. Andel nevnt per motor, endring fra forrige uke, hvem som nevnes i stedet. Hvis datagrunnlaget mangler: si det.
- **news**: maks 3. title + why (hvorfor det betyr noe for Verminord, én setning). Kun relevans ≥ 3.
- **leads**: maks 3. name + why.
- **technical**: 0–3 punkter. Bare ting som er feil eller endret. Tomt array er riktig når alt er som før. `technical.site` sier om verminord.com omdirigerer permanent til verminord.no, om navnet staves annerledes enn «Verminord» på forsiden eller pilarsiden, og om pilarsiden er publisert og bruker alle tre ordene. En omdirigering som mangler eller en feil stavemåte hører hjemme her hver uke til den er rettet.
- **content_moves**: nøyaktig 3. Konkrete innholdsgrep for denne uka. title = arbeidstittel, keyword = ett hovedsøkeord fra analysen, angle = vinkelen i én setning, page = hvilken side (eksisterende URL eller «ny bloggpost»), why_now = hvorfor akkurat nå, gjerne med årshjulet. Aldri «skriv mer innhold» eller «vær aktiv på sosiale medier».
- **next_weeks**: 2–4 punkter fra årshjulet, hva som kommer de neste fire ukene og hva som bør være klart før.
- **term_review**: tom streng («») med mindre `monthly_review` er true. Når den er true: 2–4 setninger om de tre ordene Norges dyrkere bruker (vermikompost, meitemarkkompost, markkompost), fra `terms`, siste fire uker. Per ord: hvor ofte Verminord nevnes (mentioned/asked), hvor ofte en av Verminords egne sider siteres (own_cited/asked), og hvilke domener som siteres i stedet (top_cited). Avslutt med ett konkret grep for neste måned, rettet mot den tredjepartskilden som siteres mest og ikke nevner Verminord i dag. Ingen tall som ikke står i `terms`.
- **blog_draft**: ett fullt blogginnlegg som svarer på ett ekte spørsmål fra Search Console (du får spørsmålet i oppgaven). title, keyword (spørsmålet), body_md i markdown. 600–1200 ord.
  - Tittelen er spørsmålet eller en nær omskriving av det.
  - Første avsnitt svarer direkte på spørsmålet i én til to setninger. Det er dette avsnittet AI-motorer løfter ut og siterer, så det må stå alene. Deretter en konkret observasjon fra Jæren eller drivhuset, ikke «Visste du at».
  - H2-seksjoner. Spørsmålet eller søkeordet i første avsnitt, deretter naturlig. Aldri gjenta søkeordet for søkeordets skyld; det senker synligheten.
  - Bruk de tre ordene riktig: «vermikompost» er hovedordet; «meitemarkkompost» og «markkompost» er det samme, og kan nevnes én gang der det faller naturlig.
  - Ett tall fra fakta-arket, ikke fem. Tall fra forskning bare fra kildelista du får, med kilden navngitt i teksten (organisasjon eller forfatter og år) og lenket. Ingen kilder, tall eller sitater som ikke står i kildelista eller fakta-arket.
  - Lenk én gang til pilarsiden (URL i oppgaven) med beskrivende lenketekst, der leseren trenger mer bakgrunn.
  - Avslutt med en stille CTA («Lurer du på dosering? Send oss en melding — vi svarer alle.»). Signer ikke. Ingen pris, ingen kjøpslenke.

## Tone

Under 600 ord for alt unntatt blogg-utkastet. Skriv som til en kollega som er smart og har dårlig tid. Ingen innledning, ingen «håper du har hatt en fin helg». Tall før adjektiver. Der data mangler («Annonsedata mangler denne uka»), si det i én bisetning og gå videre.
