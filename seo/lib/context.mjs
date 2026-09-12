// The run context every step receives: which week, which date windows, what
// is configured, and whether writes are real. Built once by run.mjs.
import { isoWeek, osloToday, previousWeekKey, weekMonday, windows } from "./dates.mjs";
import { hasDbConfig } from "./db.mjs";
import { googleConfigured } from "./google-auth.mjs";

export function buildContext({ only = null, week = null, backfill = false, dryRun = false, resend = false } = {}) {
  const runDate = week ? weekMonday(week) : osloToday();
  const wk = week || isoWeek(runDate).key;
  const ctx = {
    runDate,
    week: wk,
    prevWeek: previousWeekKey(wk),
    windows: windows(runDate),
    only: only ? new Set(only) : null,
    backfill,
    dryRun,
    resend,
    summary: [],
    startedAt: new Date(),
    keys: {
      db: hasDbConfig(),
      google: googleConfigured(),
      gsc: !!process.env.GSC_SITE_URL,
      ga4: !!process.env.GA4_PROPERTY_ID,
      serper: !!process.env.SERPER_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      perplexity: !!process.env.PERPLEXITY_API_KEY,
      resend: !!process.env.RESEND_API_KEY && !!process.env.SEO_BRIEF_EMAIL,
    },
    log(step, msg) {
      const t = new Date().toISOString().slice(11, 19);
      console.log(`${t} [${step}] ${msg}`);
    },
  };
  return ctx;
}
