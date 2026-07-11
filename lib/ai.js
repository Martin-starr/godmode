// Deps-free Claude API client (raw fetch, key held server-side only).
// Every AI feature degrades gracefully when the key is absent — check
// aiEnabled() before calling claude().
export function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// DASH_AI_MODEL is the cost lever: claude-haiku-4-5 is ~5x cheaper than the
// default when draft quality allows it.
const MODEL = () => process.env.DASH_AI_MODEL || "claude-opus-4-8";

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
