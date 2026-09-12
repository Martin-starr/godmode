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
- **technical**: 0–3 punkter. Bare ting som er feil eller endret. Tomt array er riktig når alt er som før.
- **content_moves**: nøyaktig 3. Konkrete innholdsgrep for denne uka. title = arbeidstittel, keyword = ett hovedsøkeord fra analysen, angle = vinkelen i én setning, page = hvilken side (eksisterende URL eller «ny bloggpost»), why_now = hvorfor akkurat nå, gjerne med årshjulet. Aldri «skriv mer innhold» eller «vær aktiv på sosiale medier».
- **next_weeks**: 2–4 punkter fra årshjulet, hva som kommer de neste fire ukene og hva som bør være klart før.
- **blog_draft**: ett fullt blogginnlegg som svarer på det beste innholdsgrepet. title, keyword (hovedsøkeordet), body_md i markdown. 600–1200 ord. Start med en konkret observasjon fra Jæren eller drivhuset, ikke med «Visste du at». H2-seksjoner. Hovedsøkeordet i første avsnitt, deretter naturlig. Ett tall fra fakta-arket, ikke fem. Avslutt med en stille CTA («Lurer du på dosering? Send oss en melding — vi svarer alle.»). Signer ikke. Ingen pris, ingen kjøpslenke.

## Tone

Under 600 ord for alt unntatt blogg-utkastet. Skriv som til en kollega som er smart og har dårlig tid. Ingen innledning, ingen «håper du har hatt en fin helg». Tall før adjektiver. Der data mangler («Annonsedata mangler denne uka»), si det i én bisetning og gå videre.
