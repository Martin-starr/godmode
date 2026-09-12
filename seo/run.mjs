#!/usr/bin/env node
// The weekly SEO agent, one step at a time.
//
//   node seo/run.mjs                      every step, this week
//   node seo/run.mjs --only gsc,serp      a subset
//   node seo/run.mjs --week 2026-W35      re-run a past week (windows follow)
//   node seo/run.mjs --backfill           first run: 16 months of Search Console
//   node seo/run.mjs --dry-run            collect, write nothing, print what would be written
//   node seo/run.mjs --resend             send this week's brief again
//   node seo/run.mjs --list               show the step order
//
// Steps run in order and never abort the run: a missing key is reported as
// "hoppet over", an exception as "feilet", and the next step starts either
// way. The exit code is non-zero only when the brief could not be sent (or
// there is no database at all) — that is the one failure the Monday reader
// would otherwise never hear about, and a red run in the Actions tab is the
// outer layer of monitoring (see .github/workflows/seo-weekly.yml).
import { parseArgs } from "node:util";
import { buildContext } from "./lib/context.mjs";
import { closeDb } from "./lib/db.mjs";
import { runStep } from "./lib/runs.mjs";

const STEPS = [
  ["gsc", "./steps/01-gsc.mjs"],
  ["ga4", "./steps/02-ga4.mjs"],
  ["psi", "./steps/03-psi.mjs"],
  ["serp", "./steps/04-serp.mjs"],
  ["competitors", "./steps/05-competitors.mjs"],
  ["brreg", "./steps/06-brreg.mjs"],
  ["ads", "./steps/07-ads.mjs"],
  ["news", "./steps/08-news.mjs"],
  ["ai", "./steps/09-ai.mjs"],
  ["scout", "./steps/10-scout.mjs"],
  ["analyze", "./steps/11-analyze.mjs"],
  ["brief", "./steps/12-brief.mjs"],
  ["send", "./steps/13-send.mjs"],
];

const { values } = parseArgs({
  options: {
    only: { type: "string" },
    week: { type: "string" },
    backfill: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    resend: { type: "boolean", default: false },
    list: { type: "boolean", default: false },
  },
});

if (values.list) {
  for (const [name] of STEPS) console.log(name);
  process.exit(0);
}

const only = values.only
  ? values.only.split(",").map((s) => s.trim()).filter(Boolean)
  : null;
if (only) {
  const known = new Set(STEPS.map(([n]) => n));
  const bad = only.filter((n) => !known.has(n) && n !== "all");
  if (bad.length) {
    console.error("Ukjent steg: " + bad.join(", ") + ". Kjør --list for gyldige navn.");
    process.exit(2);
  }
}

const ctx = buildContext({
  only: only && !only.includes("all") ? only : null,
  week: values.week || null,
  backfill: values.backfill,
  dryRun: values["dry-run"],
  resend: values.resend,
});

if (!ctx.keys.db && !ctx.dryRun) {
  console.error("DASH_DATABASE_URL mangler — ingenting kan lagres. Bruk --dry-run for å teste innsamlerne uten database.");
  process.exit(2);
}

ctx.log("run", `uke ${ctx.week} · vindu ${ctx.windows.this.start}–${ctx.windows.this.end}` +
  (ctx.dryRun ? " · DRY RUN (ingen skriving)" : "") + (ctx.backfill ? " · backfill" : ""));

for (const [name, file] of STEPS) {
  if (ctx.only && !ctx.only.has(name)) continue;
  let mod;
  try {
    mod = await import(file);
  } catch (e) {
    ctx.summary.push({ step: name, status: "feilet", ms: 0, note: "kunne ikke laste steget: " + e.message, failed: true });
    ctx.log(name, "kunne ikke laste steget: " + e.message);
    continue;
  }
  await runStep(ctx, name, mod.run);
}

console.log("\nOppsummering uke " + ctx.week);
for (const s of ctx.summary) {
  console.log(`  ${s.step.padEnd(12)} ${s.status.padEnd(12)} ${String((s.ms / 1000).toFixed(1)).padStart(6)} s  ${s.note || ""}`);
}

await closeDb();

const sendRan = ctx.summary.find((s) => s.step === "send");
const fatal = sendRan && sendRan.failed;
process.exit(fatal ? 1 : 0);
