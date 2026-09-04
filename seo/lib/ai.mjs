// Claude for the pipeline: the house client from lib/ai.js plus a JSON helper.
//
// Model choice is not made here. activeModel() reads DASH_AI_MODEL with the
// repo's single default, so the brief, the inbox triage and the settings page
// all report the same model — the reason lib/ai.js exports it.
import { claude, activeModel, aiEnabled } from "../../lib/ai.js";

export { claude, activeModel, aiEnabled };

// Adaptive thinking and the dynamic-filtering web search tool exist on the
// 4.6+ generation; older ids fall back to the basic tool and no thinking.
export function modernModel(model = activeModel()) {
  return /opus-4-[6-9]|opus-5|sonnet-4-6|sonnet-5|fable|mythos/i.test(model);
}

export function webSearchTool(model = activeModel()) {
  return {
    type: modernModel(model) ? "web_search_20260209" : "web_search_20250305",
    name: "web_search",
    max_uses: 3,
    user_location: { type: "approximate", country: "NO", timezone: "Europe/Oslo" },
  };
}

// One structured call. On a parse failure or a rejected thinking parameter
// the call is retried once without thinking — a brief with plain reasoning
// beats no brief.
export async function claudeJson({ system, user, schema, maxTokens = 4000, timeoutMs = 120000, thinking = false, effort = null }) {
  const attempt = async (withThinking) => {
    const text = await claude({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens,
      timeoutMs,
      outputFormat: { type: "json_schema", schema },
      thinking: withThinking && modernModel() ? { type: "adaptive" } : null,
      effort: effort && modernModel() ? effort : null,
    });
    return JSON.parse(text);
  };
  try {
    return await attempt(thinking);
  } catch (e) {
    if (!thinking) throw new Error("Klarte ikke å tolke svaret fra AI: " + e.message);
    return attempt(false);
  }
}
