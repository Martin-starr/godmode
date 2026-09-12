import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeek, previousWeekKey, weekMonday, windows } from "../lib/dates.mjs";
import { parseSerperDate, pickDiscoveries } from "../steps/04-serp.mjs";
import { pickAccounts } from "../steps/06-brreg.mjs";
import { vendorNames } from "../steps/09-ai.mjs";
import { rotate } from "../steps/10-scout.mjs";
import { compactAnalysis, renderMarkdown } from "../steps/12-brief.mjs";
import { renderHtml } from "../steps/13-send.mjs";

test("ISO weeks around new year", () => {
  assert.equal(isoWeek(new Date("2024-12-30T00:00:00Z")).key, "2025-W01");
  assert.equal(isoWeek(new Date("2021-01-03T00:00:00Z")).key, "2020-W53");
  assert.equal(isoWeek(new Date("2026-09-07T00:00:00Z")).key, "2026-W37");
  assert.equal(weekMonday("2026-W37").toISOString().slice(0, 10), "2026-09-07");
  assert.equal(previousWeekKey("2026-W01"), "2025-W52");
});

test("analysis windows end three days before the run", () => {
  const w = windows(new Date("2026-09-07T00:00:00Z"));
  assert.deepEqual(w.this, { start: "2026-08-29", end: "2026-09-04" });
  assert.deepEqual(w.prev, { start: "2026-08-22", end: "2026-08-28" });
  assert.equal(w.base.end, "2026-08-28");
  assert.equal(w.eight.end, "2026-08-28");
});

test("pickDiscoveries ignores known, own and platform domains", () => {
  const organic = [
    { position: 1, link: "https://www.gronnvekst.no/x", title: "Grønn Vekst" },
    { position: 2, link: "https://verminord.com/", title: "Verminord" },
    { position: 3, link: "https://no.wikipedia.org/wiki/Vermikompost", title: "Wiki" },
    { position: 4, link: "https://www.newshop.no/vermikompost", title: "Ny butikk" },
    { position: 12, link: "https://www.deep.no/", title: "Utenfor topp 10" },
  ];
  const out = pickDiscoveries(organic, new Set(["gronnvekst.no"]), new Set(["verminord.com"]));
  assert.deepEqual(out.map((d) => d.domain), ["newshop.no"]);
});

test("parseSerperDate handles relative dates", () => {
  const now = new Date("2026-09-07T12:00:00Z");
  assert.equal(parseSerperDate("2 days ago", now).slice(0, 10), "2026-09-05");
  assert.equal(parseSerperDate("nonsense", now), null);
});

test("pickAccounts takes the latest fiscal year", () => {
  const list = [
    { regnskapsperiode: { fraDato: "2024-01-01" }, resultatregnskapResultat: { driftsresultat: { driftsinntekter: { sumDriftsinntekter: 1000 } }, aarsresultat: 10 } },
    { regnskapsperiode: { fraDato: "2025-01-01" }, resultatregnskapResultat: { driftsresultat: { driftsinntekter: { sumDriftsinntekter: 2000 } }, aarsresultat: 20 } },
  ];
  assert.deepEqual(pickAccounts(list), { fiscal_year: 2025, revenue_nok: 2000, result_nok: 20 });
  assert.equal(pickAccounts([]), null);
});

test("vendorNames strips company suffixes and dedupes", () => {
  assert.deepEqual(vendorNames([{ name: "Grønn Vekst AS" }, { name: "Grønn Vekst" }, { name: "NLR" }]), ["Grønn Vekst"]);
});

test("rotate walks through the list week by week without gaps", () => {
  const list = Array.from({ length: 12 }, (_, i) => "q" + i);
  const seen = new Set();
  for (let w = 1; w <= 6; w++) for (const q of rotate(list, w, 4)) seen.add(q);
  assert.equal(seen.size, 12);
});

const sample = {
  headline: "Rolig uke.", numbers: [{ label: "Klikk", now: "12", prev: "10", base: "11" }], movements: ["a"],
  opportunities: [{ query: "vermikompost", page: "/", action: "Legg inn dosering" }], competitors: ["b"], ai_visibility: "Ingen data.",
  news: [], leads: [], technical: [], content_moves: [{ title: "T", keyword: "k", angle: "a", page: "p", why_now: "w" }], next_weeks: ["n"],
  blog_draft: { title: "Blogg", keyword: "k", body_md: "# x" },
};

test("renderMarkdown and renderHtml are deterministic and complete", () => {
  const md = renderMarkdown("2026-W37", sample);
  assert.match(md, /^# SEO-brief uke 37 \(2026\)/);
  assert.match(md, /## Tre innholdsgrep/);
  assert.match(md, /Ingenting som betyr noe denne uka/);
  const html = renderHtml("2026-W37", sample, "https://dash.verminord.app/?view=seo");
  assert.match(html, /Åpne i dashbordet/);
  assert.match(html, /&lt;/.test(html) ? /&lt;/ : /Rolig uke/);
  assert.equal(renderMarkdown("2026-W37", sample), md);
});

test("compactAnalysis drops the daily series and trims lists", () => {
  const c = compactAnalysis({ daily: [1, 2], top_queries: Array(20).fill({ q: 1 }), competitor_changes: { facts: [{ org_nr: "1", name: "x" }] } });
  assert.equal(c.daily, undefined);
  assert.equal(c.top_queries.length, 12);
  assert.equal(c.competitor_changes.facts[0].org_nr, undefined);
});
