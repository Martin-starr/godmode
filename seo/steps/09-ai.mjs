// Step 9 — does the AI answer mention Verminord?
//
// The same Norwegian questions a grower would type, asked of each engine
// with web search on, so the answer reflects what the engine finds today and
// not what it memorised a year ago. The whole answer is stored; the yes/no is
// decided by code, not by another model (seo/lib/text.mjs detectMentions).
// One week is noise; the dashboard shows the rate over 12 weeks.
import { postJson, sleep } from "../lib/fetch.mjs";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { aiEnabled, activeModel, claude, webSearchTool } from "../lib/ai.mjs";
import { detectMentions, extractUrls, truncate } from "../lib/text.mjs";

const OPENAI_MODEL = () => process.env.OPENAI_MODEL || "gpt-5";
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
const PERPLEXITY_MODEL = () => process.env.PERPLEXITY_MODEL || "sonar";

async function askAnthropic(prompt) {
  const data = await claude({ messages: [{ role: "user", content: prompt }], tools: [webSearchTool()], maxTokens: 2000, timeoutMs: 120000, raw: true });
  const texts = [];
  const cites = [];
  for (const b of data.content || []) {
    if (b.type === "text") {
      texts.push(b.text);
      for (const c of b.citations || []) if (c.url) cites.push({ url: c.url, title: c.title || null });
    }
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) cites.push({ url: r.url, title: r.title || null, kind: "search" });
    }
  }
  return { answer: texts.join("\n"), citations: cites, model: data.model || activeModel() };
}

async function askOpenAI(prompt) {
  const data = await postJson("https://api.openai.com/v1/responses", {
    model: OPENAI_MODEL(),
    input: prompt,
    tools: [{ type: "web_search" }],
  }, { headers: { authorization: "Bearer " + process.env.OPENAI_API_KEY }, timeoutMs: 120000, retries: 1 });
  const texts = [];
  const cites = [];
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if (c.type === "output_text") {
        texts.push(c.text);
        for (const a of c.annotations || []) if (a.type === "url_citation" && a.url) cites.push({ url: a.url, title: a.title || null });
      }
    }
  }
  return { answer: texts.join("\n"), citations: cites, model: data.model || OPENAI_MODEL() };
}

async function askGemini(prompt) {
  const model = GEMINI_MODEL();
  const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
  }, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY }, timeoutMs: 120000, retries: 1 });
  const cand = data.candidates?.[0];
  const answer = (cand?.content?.parts || []).map((p) => p.text || "").join("\n");
  const cites = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter((w) => w?.uri).map((w) => ({ url: w.uri, title: w.title || null }));
  return { answer, citations: cites, model: data.modelVersion || model };
}

async function askPerplexity(prompt) {
  const data = await postJson("https://api.perplexity.ai/chat/completions", {
    model: PERPLEXITY_MODEL(),
    messages: [{ role: "user", content: prompt }],
  }, { headers: { authorization: "Bearer " + process.env.PERPLEXITY_API_KEY }, timeoutMs: 120000, retries: 1 });
  const answer = data.choices?.[0]?.message?.content || "";
  const cites = [
    ...(data.search_results || []).map((r) => ({ url: r.url, title: r.title || null })),
    ...(data.citations || []).map((u) => ({ url: u, title: null })),
  ];
  return { answer, citations: cites, model: data.model || PERPLEXITY_MODEL() };
}

export function engines() {
  const list = [];
  if (aiEnabled()) list.push({ name: "anthropic", ask: askAnthropic });
  if (process.env.OPENAI_API_KEY) list.push({ name: "openai", ask: askOpenAI });
  if (process.env.GEMINI_API_KEY) list.push({ name: "gemini", ask: askGemini });
  if (process.env.PERPLEXITY_API_KEY) list.push({ name: "perplexity", ask: askPerplexity });
  return list;
}

export function vendorNames(rows) {
  const out = new Set();
  for (const r of rows) {
    const n = String(r.name || "").replace(/\s+(AS|ASA|SA|DA|ANS)$/i, "").trim();
    if (n.length >= 4) out.add(n);
  }
  return [...out];
}

export async function run(ctx) {
  const list = engines();
  if (!list.length) return { skipped: "Ingen AI-nøkler (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, PERPLEXITY_API_KEY)" };
  const db = ctx.dryRun ? null : sql();
  const prompts = db
    ? await db`select id, prompt, lang from seo.ai_prompts where active order by id`
    : [{ id: 1, prompt: "Hvor kan jeg kjøpe vermikompost i Norge?", lang: "no" }];
  const vendors = vendorNames(db ? await db`select name from seo.competitors where active and kind in ('produsent','merke','forhandler')` : [{ name: "Grønn Vekst AS" }, { name: "Nelson Garden" }]);

  const stats = { asked: 0, mentioned: 0, failed: 0, flips: 0 };
  const perEngine = {};
  for (const eng of list) {
    perEngine[eng.name] = { asked: 0, mentioned: 0 };
    for (const p of prompts) {
      let res;
      try {
        res = await eng.ask(p.prompt);
      } catch (e) {
        stats.failed += 1;
        ctx.log("ai", `${eng.name} «${truncate(p.prompt, 50)}»: ${e.message.split("\n")[0]}`);
        await sleep(1000);
        continue;
      }
      const det = detectMentions(res.answer, vendors);
      const citeUrls = new Map();
      for (const c of res.citations) if (c.url && !citeUrls.has(c.url)) citeUrls.set(c.url, c);
      for (const u of extractUrls(res.answer)) if (!citeUrls.has(u)) citeUrls.set(u, { url: u, title: null, kind: "tekst" });
      const citations = [...citeUrls.values()].slice(0, 30);

      let prev = null;
      if (db) {
        prev = (await db`select mentioned from seo.ai_visibility where week = ${ctx.prevWeek} and engine = ${eng.name} and prompt_id = ${p.id}`)[0] || null;
        await db`insert into seo.ai_visibility (week, engine, prompt_id, model, mentioned, mention_rank, competitors_mentioned, citations, answer, asked_at)
          values (${ctx.week}, ${eng.name}, ${p.id}, ${res.model}, ${det.mentioned}, ${det.mention_rank}, ${det.competitors_mentioned}, ${JSON.stringify(citations)}::jsonb, ${truncate(res.answer, 12000)}, now())
          on conflict (week, engine, prompt_id) do update set model = excluded.model, mentioned = excluded.mentioned, mention_rank = excluded.mention_rank,
            competitors_mentioned = excluded.competitors_mentioned, citations = excluded.citations, answer = excluded.answer, asked_at = now()`;
      }
      stats.asked += 1;
      perEngine[eng.name].asked += 1;
      if (det.mentioned) { stats.mentioned += 1; perEngine[eng.name].mentioned += 1; }
      ctx.log("ai", `${eng.name} «${truncate(p.prompt, 50)}»: ${det.mentioned ? "NEVNT (#" + det.mention_rank + ")" : "ikke nevnt"}${det.competitors_mentioned.length ? " · " + det.competitors_mentioned.join(", ") : ""}`);
      if (prev && prev.mentioned !== det.mentioned) {
        stats.flips += 1;
        await pulse(ctx, {
          source: "ai", kind: "ai", severity: "viktig",
          title: `${eng.name}: Verminord ${det.mentioned ? "nevnes nå" : "nevnes ikke lenger"} på «${truncate(p.prompt, 70)}»`,
          body: det.competitors_mentioned.length ? "Nevnt i stedet/i tillegg: " + det.competitors_mentioned.join(", ") : null,
          data: { engine: eng.name, prompt_id: p.id, mentioned: det.mentioned, prev: prev.mentioned },
        });
      }
      await sleep(400);
    }
  }
  const line = Object.entries(perEngine).map(([k, v]) => `${k} ${v.mentioned}/${v.asked}`).join(" · ");
  await pulse(ctx, {
    source: "ai", kind: "tall", severity: "info",
    title: `AI-synlighet: Verminord nevnt i ${stats.mentioned} av ${stats.asked} svar`,
    body: line + (stats.failed ? ` · ${stats.failed} spørsmål feilet` : ""), data: { ...stats, perEngine },
  });
  return stats;
}
