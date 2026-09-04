// Step 12 — Claude writes the Monday brief and one blog draft.
//
// The model gets the analysis JSON and the two prompt files, and returns a
// JSON object with fixed fields. The markdown that goes into the e-mail is
// rendered here in code from that object, so the layout is the same every
// Monday and a missing section is an empty heading, never a missing e-mail.
// The blog draft is inserted once per week; if Martin has already touched
// this week's draft it is left alone.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { aiEnabled, activeModel, claudeJson } from "../lib/ai.mjs";
import { weekNumber } from "../lib/dates.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const str = { type: "string" };
export const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "numbers", "movements", "opportunities", "competitors", "ai_visibility", "news", "leads", "technical", "content_moves", "next_weeks", "blog_draft"],
  properties: {
    headline: str,
    numbers: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "now", "prev", "base"], properties: { label: str, now: str, prev: str, base: str } } },
    movements: { type: "array", items: str },
    opportunities: { type: "array", items: { type: "object", additionalProperties: false, required: ["query", "page", "action"], properties: { query: str, page: str, action: str } } },
    competitors: { type: "array", items: str },
    ai_visibility: str,
    news: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "why"], properties: { title: str, why: str } } },
    leads: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "why"], properties: { name: str, why: str } } },
    technical: { type: "array", items: str },
    content_moves: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "keyword", "angle", "page", "why_now"], properties: { title: str, keyword: str, angle: str, page: str, why_now: str } } },
    next_weeks: { type: "array", items: str },
    blog_draft: { type: "object", additionalProperties: false, required: ["title", "keyword", "body_md"], properties: { title: str, keyword: str, body_md: str } },
  },
};

// Trims the analysis to what the model needs: no raw answers, no long lists.
export function compactAnalysis(a) {
  const c = JSON.parse(JSON.stringify(a));
  delete c.daily;
  if (c.competitor_changes) {
    c.competitor_changes.stock_now = (c.competitor_changes.stock_now || []).slice(0, 25);
    c.competitor_changes.facts = (c.competitor_changes.facts || []).slice(0, 12).map((f) => ({ ...f, org_nr: undefined }));
  }
  if (c.top_queries) c.top_queries = c.top_queries.slice(0, 12);
  if (c.top_pages) c.top_pages = c.top_pages.slice(0, 8);
  return c;
}

export function renderMarkdown(week, b) {
  const wk = weekNumber(week);
  const year = week.slice(0, 4);
  const L = [];
  L.push(`# SEO-brief uke ${wk} (${year})`, "", `**${b.headline}**`, "");
  L.push("## Tallene", "", "| | Denne uka | Forrige uke | 4-ukers snitt |", "|---|---|---|---|");
  for (const n of b.numbers || []) L.push(`| ${n.label} | ${n.now} | ${n.prev} | ${n.base} |`);
  L.push("", "## Bevegelser", "");
  for (const m of b.movements || []) L.push(`- ${m}`);
  if (!(b.movements || []).length) L.push("- Ingen bevegelser verdt å nevne.");
  L.push("", "## Muligheter", "");
  (b.opportunities || []).forEach((o, i) => L.push(`${i + 1}. **${o.query}** — ${o.page}: ${o.action}`));
  if (!(b.opportunities || []).length) L.push("Ingen søkeord i posisjon 8–20 med nok visninger ennå.");
  L.push("", "## Konkurrenter", "");
  for (const c of b.competitors || []) L.push(`- ${c}`);
  if (!(b.competitors || []).length) L.push("- Ingen endringer registrert.");
  L.push("", "## AI-synlighet", "", b.ai_visibility || "Ingen data.");
  L.push("", "## Nyheter og regelverk", "");
  for (const n of b.news || []) L.push(`- **${n.title}** — ${n.why}`);
  if (!(b.news || []).length) L.push("- Ingenting som betyr noe denne uka.");
  L.push("", "## Leads", "");
  for (const l of b.leads || []) L.push(`- **${l.name}** — ${l.why}`);
  if (!(b.leads || []).length) L.push("- Ingen nye.");
  if ((b.technical || []).length) { L.push("", "## Teknisk", ""); for (const t of b.technical) L.push(`- ${t}`); }
  L.push("", "## Tre innholdsgrep", "");
  (b.content_moves || []).forEach((m, i) => L.push(`${i + 1}. **${m.title}** (${m.keyword}) — ${m.angle} Side: ${m.page}. Hvorfor nå: ${m.why_now}`));
  L.push("", "## Neste fire uker", "");
  for (const n of b.next_weeks || []) L.push(`- ${n}`);
  L.push("", "---", "", `Blogg-utkast «${b.blog_draft?.title || ""}» ligger under SEO → Innhold på dash.verminord.app.`);
  return L.join("\n");
}

export async function run(ctx) {
  if (!aiEnabled()) return { skipped: "ANTHROPIC_API_KEY mangler" };
  const db = ctx.dryRun ? null : sql();
  let analysis = ctx.analysis;
  if (!analysis && db) analysis = (await db`select brief->'analysis' as a from seo.briefs where week = ${ctx.week}`)[0]?.a || null;
  if (!analysis) throw new Error("Ingen analyse for uke " + ctx.week + " — kjør steget analyze først.");

  const voice = await readFile(join(here, "..", "prompts", "voice.md"), "utf8");
  const brief = await readFile(join(here, "..", "prompts", "brief.md"), "utf8");
  const compact = compactAnalysis(analysis);
  const out = await claudeJson({
    system: voice + "\n\n" + brief,
    user: `Uke ${ctx.week}. Analysen:\n\n\`\`\`json\n${JSON.stringify(compact)}\n\`\`\``,
    schema: BRIEF_SCHEMA,
    maxTokens: 9000,
    timeoutMs: 300000,
    thinking: true,
  });
  if (!Array.isArray(out.content_moves) || out.content_moves.length !== 3) {
    out.content_moves = (out.content_moves || []).slice(0, 3);
  }
  const md = renderMarkdown(ctx.week, out);
  const model = activeModel();

  if (db) {
    await db`insert into seo.briefs (week, generated_at, model, summary_md, brief)
      values (${ctx.week}, now(), ${model}, ${md}, ${JSON.stringify({ brief: out })}::jsonb)
      on conflict (week) do update set generated_at = now(), model = ${model}, summary_md = ${md},
        brief = coalesce(seo.briefs.brief, '{}'::jsonb) || ${JSON.stringify({ brief: out })}::jsonb`;
    const existing = await db`select 1 from seo.content_drafts where week = ${ctx.week} and kind = 'blogg' limit 1`;
    if (!existing.length && out.blog_draft?.body_md) {
      await db`insert into seo.content_drafts (week, kind, keyword, title, body_md) values (${ctx.week}, 'blogg', ${out.blog_draft.keyword}, ${out.blog_draft.title}, ${out.blog_draft.body_md})`;
    }
  } else {
    ctx.log("brief", "\n" + md);
  }
  await pulse(ctx, { source: "brief", kind: "brief", severity: "info", title: `Ukesbrief generert: ${out.headline}`, body: `Modell ${model}. Blogg-utkast: «${out.blog_draft?.title || "(ingen)"}».` });
  return { headline: out.headline, words: md.split(/\s+/).length, model };
}
