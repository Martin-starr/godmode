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
export async function claude({ system = "", messages, maxTokens = 1024, outputFormat = null, timeoutMs = 25000 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI er ikke konfigurert (ANTHROPIC_API_KEY mangler på Vercel-prosjektet).");

  const body = {
    model: MODEL(),
    max_tokens: maxTokens,
    system: system ? BASE_SYSTEM + "\n\n" + system : BASE_SYSTEM,
    messages,
  };
  if (outputFormat) body.output_config = { format: outputFormat };

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
export async function draftReply(m, opts = {}) {
  return claude({
    system:
      "Skriv et utkast til svar på e-posten under. Kort, vennlig og profesjonelt. " +
      "Ikke finn på fakta, priser eller datoer — bruk plassholdere i klammer der noe må fylles inn, f.eks. [dato]. " +
      "Signer med 'Martin / Verminord'. Returner KUN selve e-postteksten, uten emnelinje og uten kommentarer.",
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
