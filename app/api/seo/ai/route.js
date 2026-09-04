// AI-synlighet: mention rate per engine per week, and the latest answer per
// prompt so Martin can read what ChatGPT actually said.
import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const weeks = Math.min(52, Math.max(1, Number(u.searchParams.get("weeks")) || 12));
  const sql = db();
  const rates = await sql`select week, engine, count(*)::int as asked, count(*) filter (where mentioned)::int as mentioned
    from seo.ai_visibility group by week, engine order by week desc limit ${weeks * 6}`;
  const [latest] = await sql`select max(week) as week from seo.ai_visibility`;
  const answers = latest?.week
    ? await sql`select v.engine, v.prompt_id, p.prompt, v.model, v.mentioned, v.mention_rank, v.competitors_mentioned, v.citations, v.answer, v.asked_at
        from seo.ai_visibility v join seo.ai_prompts p on p.id = v.prompt_id where v.week = ${latest.week} order by p.id, v.engine`
    : [];
  const prompts = await sql`select id, prompt, lang, intent, active from seo.ai_prompts order by id`;
  const cited = latest?.week
    ? await sql`select regexp_replace(lower(c->>'url'), '^https?://(www\\.)?([^/]+).*$', '\\2') as domain, count(*)::int as n
        from seo.ai_visibility, jsonb_array_elements(coalesce(citations, '[]'::jsonb)) c where week = ${latest.week} group by 1 order by 2 desc limit 12`
    : [];
  return json({ rates: rates.reverse(), latestWeek: latest?.week || null, answers, prompts, cited });
});

export const POST = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const prompt = String(b.prompt || "").trim();
  if (!prompt) return err("Skriv inn et spørsmål.");
  const [row] = await db()`insert into seo.ai_prompts (prompt, lang, intent) values (${prompt}, ${b.lang === "en" ? "en" : "no"}, ${b.intent || null})
    on conflict (prompt) do update set active = true returning id, prompt, lang, intent, active`;
  return json(row);
}, { edit: true });

export const PUT = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return err("Mangler id.");
  const [row] = await db()`update seo.ai_prompts set active = ${!!b.active} where id = ${id} returning id, prompt, lang, intent, active`;
  if (!row) return err("Fant ikke spørsmålet.", 404);
  return json(row);
}, { edit: true });

export const DELETE = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return err("Mangler id.");
  await db()`delete from seo.ai_prompts where id = ${id}`;
  return json({ ok: true });
}, { edit: true });
