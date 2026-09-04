# Hvordan «nevnt» avgjøres

Ingen språkmodell vurderer om en språkmodell nevnte Verminord. Det avgjøres av
kode i `seo/lib/text.mjs` (`detectMentions`), slik at det kan testes og aldri
driver.

- **mentioned**: teksten inneholder «Verminord», «VermiCast» eller
  «verminord.com/.no», uavhengig av store og små bokstaver.
- **mention_rank**: rekkefølgen Verminord kommer i blant navngitte aktører.
  Aktørlista er navnene i `seo.competitors` (produsent, merke, forhandler) med
  «AS»-suffiks fjernet, pluss Verminord. Første aktør nevnt i svaret får 1.
- **competitors_mentioned**: de andre aktørene fra lista som forekommer, i
  rekkefølgen de nevnes.
- **citations**: URL-er fra motorens egne kildehenvisninger, pluss URL-er som
  står i selve svarteksten. Maks 30.

Spørsmålene ligger i `seo.ai_prompts` og redigeres i dashbordet. Motorene
spørres uten systemprompt, med websøk slått på, slik en vanlig bruker ville
fått svaret.
