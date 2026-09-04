// Deps-free Claude API client (raw fetch, key held server-side only).
// Every AI feature degrades gracefully when the key is absent — check
// aiEnabled() before calling claude().
export function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// DASH_AI_MODEL is the cost lever: claude-haiku-4-5 is ~5x cheaper than the
// default when draft quality allows it.
//
// Exported so the Innstillinger page reports the model that is ACTUALLY called.
// It used to be typed out separately in the bootstrap route, which meant a
// typo in either copy would leave the settings page cheerfully displaying one
// model while every AI feature failed against another.
export const DEFAULT_MODEL = "claude-opus-4-8";
export const activeModel = () => process.env.DASH_AI_MODEL || DEFAULT_MODEL;
const MODEL = activeModel;

const BASE_SYSTEM =
  "Du er Verminord sin interne assistent. Verminord AS er en vermikompost-produsent på Jæren " +
  "(meitemark, produksjonssystemer CFT/Wedge/Breeder Bin, kunder, partnere og leverandører i landbruket). " +
  "Svar på norsk (bokmål), kort og presist.";

// Calls /v1/messages and returns the concatenated text blocks.
// outputFormat (optional): a structured-outputs format object, e.g.
// { type: "json_schema", schema: {...} } — guarantees valid JSON text.
// tools / thinking / effort are optional passthroughs added for the SEO
// agent (web search for AI-visibility checks, adaptive thinking for the weekly
// brief). Defaults leave every existing caller's request byte-identical.
// raw:true returns the full response object instead of the joined text —
// needed when the caller has to read server-tool result blocks (citations).
export async function claude({ system = "", messages, maxTokens = 1024, outputFormat = null, timeoutMs = 25000,
  tools = null, thinking = null, effort = null, raw = false }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI er ikke konfigurert (ANTHROPIC_API_KEY mangler på Vercel-prosjektet).");

  const body = {
    model: MODEL(),
    max_tokens: maxTokens,
    system: system ? BASE_SYSTEM + "\n\n" + system : BASE_SYSTEM,
    messages,
  };
  if (outputFormat || effort) body.output_config = {};
  if (outputFormat) body.output_config.format = outputFormat;
  if (effort) body.output_config.effort = effort;
  if (tools) body.tools = tools;
  if (thinking) body.thinking = thinking;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if ((res.status === 429 || res.status === 529) && attempt < 2) {
      const wait = Math.min(Number(res.headers.get("retry-after")) * 1000 || 2000 * (attempt + 1), 8000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      console.error("claude api", res.status, JSON.stringify(detail.error || {}));
      throw new Error("AI-tjenesten svarte " + res.status + " — prøv igjen om litt.");
    }

    const data = await res.json();
    if (raw) return data;
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text) throw new Error("AI-tjenesten ga et tomt svar (" + (data.stop_reason || "ukjent") + ") — prøv igjen.");
    return text;
  }
}

// Shared by /api/inbox/draft (manual, one email) and /api/inbox/enrich
// (auto, best-effort). One prompt in one place — before this they were two
// separately hand-typed copies that could quietly drift out of sync.
//
// Draft-only, on purpose: this never touches Gmail and never sends. It writes
// text a human reads and approves. That boundary is the whole point — an AI
// that can draft a reply about a payment or a regulator and one that can send
// it unsupervised are very different levels of risk, and this app only ever
// does the first.
// Product and voice brief for customer replies.
//
// Why this exists: the previous prompt said only "kort, vennlig og
// profesjonelt" and "ikke finn på fakta" — with no facts supplied, the model
// had nothing to answer WITH, so every draft came back as a generic Norwegian
// business email full of [plassholder] and had to be rewritten by hand. A
// draft you rewrite is not a draft, it is a worse blank page.
//
// Everything below is information already printed on the sack or published on
// verminord.com. Nothing internal belongs here: no forkompost-oppskrift, no
// blandingsforhold, no leverandørnavn, no batch-interne rutiner. This file is
// in a public repository — keep it that way.
//
// Numbers that appear here also appear on the label and in the SOP-pakke. If
// one of them changes, it changes in all of those places or the product is
// mislabelled. Single source of truth is a compliance requirement here, not a
// style preference.
const CUSTOMER_BRIEF = `
PRODUKTFAKTA (bruk disse direkte — ikke bruk plassholder for noe som står her):
- Produkt: VermiCast, premium norsk vermikompost. 5 L PP-vevet sekk. 389 NOK D2C.
- Produsert på Jæren av Eisenia fetida i Continuous Flow-Through-bed.
- Råvarer (som på etiketten): lamamøkk, brukt soppsubstrat, lauvmuld, papp, sagflis, biokull.
- Lab: ALS NO2604972. Rottegrad V. Salmonella ikke påvist. Tungmetall Klasse I (laveste/beste klasse).
- Sertifisering: Debio-registrert, Mattilsynet-registrert. Følger gjødselvareforskriften.
- Næring til kunde (friskvekt, som på sekken): N 0,49 % · P 0,20 % · K 0,22 %. pH 7,1. TS 41,3 %.
- Næring til faglig/lab-diskusjon (tørrstoff): N 1,16 % · P 0,48 % · K 0,51 %.
- Oppbevaring: tørt og mørkt, 5–25 °C. Holdbarhet 24 måneder. Produktet er levende — ikke la sekken tørke helt ut eller stå i sterk sol.
- Frakt: Posten/Bring fra Jæren. 2–4 dager Sør-Norge, 4–6 dager nordover. Bestilling før kl. 13 på hverdager går samme dag.
- Retur: 14 dagers angrerett, uåpnet sekk. Feil eller skadet vare ordnes direkte.

ALDRI si "tungmetallklasse 0" — utdatert. Riktig term er Klasse I.
ALDRI oppgi tørrstoff-tallene til en vanlig kunde — de skal ha friskvekt.

DOSERING (vanligste spørsmål):
- Pottejord: bland inn 5–10 % etter volum. Næringskrevende (chili, tomat, agurk) 10 %; urter og sukkulenter 5 %.
- Toppdressing potte: 1–2 ss per potte hver 6.–8. uke i vekstsesong.
- Bed og drivhus: 100–200 g/m² (en lett håndfull per m²), vannes inn. 2–3 ganger per sesong.
- Plen: 100 g/m² før eller etter lufting, vannes inn. Vår, eventuelt også høst.
- Frøstart: 20 % VermiCast i 80 % frøstart-miks.
- Planting/omplanting: en neve (~30–50 g) i plantehullet.
- Innendørs potteplanter: 1 ss på toppen hver 4.–6. uke.
- Én 5 L sekk dekker ca. 10 m² toppdressing, eller ca. 20 potteplanter i 3 L potter.
- Kan ikke svi røtter — rottegrad V, fullt moden. Man kan plante direkte i 100 %, men 5–10 % er mest kostnadseffektivt.

STEMME:
- Norsk bokmål. Kvitter for henvendelsen i én kort setning, så svar direkte.
- Konkret framfor vagt: tall, forhold, tidsrom. "Slik gjør jeg det selv:" er sterkere enn "Den anbefalte fremgangsmåten er".
- Førsteperson fra Martin er greit og ofte bedre.
- 4–8 setninger for de fleste svar. Ved tvil: kortere.
- Ingen emojis med mindre kunden brukte dem først. Ingen utropstegn i brødteksten.
- Ingen buzzwords, ingen hype. Lab-dokumentasjon framfor superlativer.
- Signer:
  Vennlig hilsen,
  Martin
  Verminord

SPESIALTILFELLER:
- Spør om store volum, engrospris eller videresalg → ikke oppgi D2C-pris som om det var tilbudet. Be om estimert årlig volum og tilby et engrostilbud.
- Klage → kvitter helt uten forsvar i første setning, still ett konkret oppklarende spørsmål (batchnummer, kjøpsdato, bilde), og tilby konkret løsning i samme e-post.
- Spørsmål utenfor fagområdet → si det ærlig. Ikke dikt. Tilby å videresende til NLR Rogaland.
- Vil krangle om lab-tall → oppgi fakta én gang, tilby ALS-rapporten, og stopp der.
`;

export async function draftReply(m, opts = {}) {
  // Only customer-shaped mail gets the product brief. An invoice, a Mattilsynet
  // letter or a brewery arranging a pickup does not need a dosing table in the
  // prompt — it just gives the model more surface to say something irrelevant.
  const isCustomer = !/faktura|regnskap|tilsyn|leverand/i.test(
    String(m.category || "") + " " + String(m.subject || "")
  );

  return claude({
    system:
      "Skriv et utkast til svar på e-posten under. Returner KUN selve e-postteksten, " +
      "uten emnelinje og uten kommentarer.\n" +
      (isCustomer
        ? CUSTOMER_BRIEF +
          "\nBruk faktaene over direkte. Bruk plassholder i klammer, f.eks. [dato], KUN for " +
          "opplysninger som ikke står i briefen — ordrenummer, konkrete datoer, saksdetaljer. " +
          "Ikke dikt opp priser, leveringstider eller analysetall som ikke står over."
        : "Kort, vennlig og profesjonelt. Norsk bokmål. Ikke finn på fakta, priser eller " +
          "datoer — bruk plassholdere i klammer der noe må fylles inn, f.eks. [dato]. " +
          "Signer med 'Martin / Verminord'."),
    messages: [
      {
        role: "user",
        content:
          "Fra: " + m.sender + "\nEmne: " + m.subject + "\nMottatt: " + m.received_at +
          (m.summary ? "\nOppsummering: " + m.summary : "") +
          (m.snippet ? "\n\nUtdrag av e-posten:\n" + m.snippet : ""),
      },
    ],
    maxTokens: 700,
    timeoutMs: opts.timeoutMs || 25000,
  });
}
