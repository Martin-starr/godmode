// Runs one step under the three rules that keep the Monday brief arriving:
// a step that is not configured says so and returns; a step that fails is
// recorded (seo.runs, dash.integrations, Pulse) and the pipeline continues;
// nothing here ever throws to the caller.
//
// Health goes through lib/integrations.js so the SEO collectors show up in
// the same banner on Brief as Gmail and the autologger. A skipped step calls
// neither ok() nor fail(): "not configured" is not a failure, and it must
// not look like a success either — it stays "ukjent" until the key exists.
import { ok, fail } from "../../lib/integrations.js";
import { sql } from "./db.mjs";
import { pulse } from "./pulse.mjs";

export const LABELS = {
  gsc: "Search Console",
  ga4: "GA4",
  psi: "PageSpeed",
  serp: "SERP (Serper)",
  competitors: "Konkurrentsider",
  brreg: "Brønnøysund",
  ads: "Annonser",
  news: "Nyheter og regelverk",
  ai: "AI-synlighet",
  scout: "Scout (leads)",
  analyze: "Analyse",
  brief: "Ukesbrief",
  send: "E-post",
};

async function startRun(ctx, step) {
  if (ctx.dryRun) return null;
  try {
    const [row] = await sql()`insert into seo.runs (week, step) values (${ctx.week}, ${step}) returning id`;
    return row.id;
  } catch (e) {
    ctx.log(step, "kunne ikke registrere kjøring: " + e.message);
    return null;
  }
}

async function finishRun(ctx, id, status, error, stats) {
  if (ctx.dryRun || id == null) return;
  try {
    await sql()`update seo.runs set finished_at = now(), status = ${status},
      error = ${error ? String(error).slice(0, 1000) : null},
      stats = ${stats ? JSON.stringify(stats) : null}::jsonb where id = ${id}`;
  } catch (e) {
    ctx.log("runs", "kunne ikke avslutte kjøring: " + e.message);
  }
}

export async function runStep(ctx, step, fn) {
  const label = LABELS[step] || step;
  const t0 = Date.now();
  ctx.log(step, "starter");
  const runId = await startRun(ctx, step);
  let outcome;
  try {
    const result = (await fn(ctx)) || {};
    if (result.skipped) {
      await finishRun(ctx, runId, "hoppet over", null, { reason: result.skipped });
      await pulse(ctx, { source: step, kind: "konfig", severity: "notis", title: label + " er ikke konfigurert", body: result.skipped });
      outcome = { step, status: "hoppet over", ms: Date.now() - t0, note: result.skipped };
    } else {
      if (!ctx.dryRun && step !== "analyze") await ok("seo:" + step);
      await finishRun(ctx, runId, "ok", null, result);
      outcome = { step, status: "ok", ms: Date.now() - t0, note: summarize(result) };
    }
  } catch (e) {
    const msg = e?.message || String(e);
    ctx.log(step, "FEILET: " + msg);
    if (!ctx.dryRun && step !== "analyze") await fail("seo:" + step, msg);
    await finishRun(ctx, runId, "feilet", msg, null);
    await pulse(ctx, { source: step, kind: "feil", severity: "viktig", title: label + " feilet", body: msg.slice(0, 500) });
    outcome = { step, status: "feilet", ms: Date.now() - t0, note: msg.slice(0, 120), failed: true };
  }
  ctx.summary.push(outcome);
  ctx.log(step, `${outcome.status} (${(outcome.ms / 1000).toFixed(1)} s)${outcome.note ? " — " + outcome.note : ""}`);
  return outcome;
}

function summarize(result) {
  try {
    const parts = Object.entries(result)
      .filter(([, v]) => typeof v === "number" || typeof v === "string")
      .slice(0, 6)
      .map(([k, v]) => k + "=" + v);
    return parts.join(" ");
  } catch {
    return "";
  }
}
