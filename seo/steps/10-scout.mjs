// Step 10 — Scout: new leads that fit the ideal customer profile.
//
// Two nets. Brønnøysund lists every company registered in Norway last week
// in the trades that stock or use vermicompost — garden centres, nurseries,
// growers, landscapers, farm suppliers — with an address, so a Klepp garden
// centre that opened on Tuesday is on Martin's list on Monday. Google
// (Serper) finds the ones that have been around for years but never crossed
// his path, ten discovery queries a week rotating through the regions.
//
// Claude scores each candidate against the profile in prompts/lead-score.md.
// Anything already in dash.partners, seo.leads or seo.competitors is dropped
// before scoring, so the same garden centre is never proposed twice.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getJson, postJson } from "../lib/fetch.mjs";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { aiEnabled, claudeJson } from "../lib/ai.mjs";
import { domainOf, normalizeWs, truncate } from "../lib/text.mjs";
import { weekNumber } from "../lib/dates.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ENHETER = "https://data.brreg.no/enhetsregisteret/api/enheter";

// NACE codes (SN2007) where a new registration is worth a look.
export const NACE = [
  "47.761", // Butikkhandel med blomster og planter — hagesentre
  "01.300", // Planteformering — planteskoler, gartnerier
  "01.130", // Dyrking av grønnsaker, meloner, rot- og knollvekster
  "01.190", // Dyrking av ettårige vekster ellers
  "01.250", // Dyrking av annen frukt som vokser på trær eller busker samt nøtter
  "01.610", // Tjenester tilknyttet planteproduksjon
  "81.300", // Beplantning av hager og parkanlegg
  "46.220", // Engroshandel med blomster og planter
  "46.210", // Engroshandel med korn, råtobakk, såvarer og fôrvarer
];

const DISCOVERY = [
  "hagesenter Rogaland", "hagesenter Jæren", "hagesenter Stavanger", "hagesenter Sandnes", "hagesenter Haugesund",
  "planteskole Rogaland", "gartneri Rogaland", "gartneri Jæren", "andelslandbruk Rogaland", "økologisk gård Rogaland",
  "hagesenter Vestland", "hagesenter Bergen", "planteskole Vestland", "andelslandbruk Vestland", "økologisk gård Vestland",
  "hagesenter Agder", "hagesenter Kristiansand", "planteskole Agder", "andelslandbruk Agder", "økologisk gård Agder",
  "hagesenter Oslo", "hagesenter Akershus", "planteskole Østlandet", "andelslandbruk Oslo", "urban dyrking Oslo",
  "hagesenter Trøndelag", "hagesenter Trondheim", "planteskole Trøndelag", "andelslandbruk Trøndelag", "økologisk gård Trøndelag",
  "skolehage Rogaland", "parsellhage Stavanger", "chili dyrking Norge forening", "tomatdyrker Norge", "drivhus gartneri Norge",
  "anleggsgartner Rogaland", "anleggsgartner Stavanger", "landbruksvarer Rogaland butikk", "felleskjøpet alternativ hagesenter", "økologisk grønnsaksdyrker Vestlandet",
];

const NOT_A_LEAD = /(^|\.)(facebook\.com|instagram\.com|finn\.no|gulesider\.no|proff\.no|1881\.no|purehelp\.no|brreg\.no|regnskapstall\.no|wikipedia\.org|google\.[a-z.]+|youtube\.com|linkedin\.com|tripadvisor\.[a-z]+|yelp\.[a-z]+)$/i;

function regionOf(kommunenummer, kommune) {
  const p = String(kommunenummer || "").slice(0, 2);
  const fylke = { "11": "Rogaland", "46": "Vestland", "42": "Agder", "03": "Oslo", "32": "Akershus", "31": "Østfold", "33": "Buskerud", "39": "Vestfold", "40": "Telemark", "34": "Innlandet", "50": "Trøndelag", "15": "Møre og Romsdal", "18": "Nordland", "55": "Troms", "56": "Finnmark" }[p];
  return [kommune, fylke].filter(Boolean).join(", ") || null;
}

async function fromBrreg(ctx, since) {
  const out = [];
  for (let page = 0; page < 5; page++) {
    const url = `${ENHETER}?naeringskode=${NACE.join(",")}&fraRegistreringsdatoEnhetsregisteret=${since}&size=100&page=${page}`;
    const data = await getJson(url, { gapMs: 500 });
    const list = data?._embedded?.enheter || [];
    for (const e of list) {
      if (e.konkurs || e.underAvvikling) continue;
      out.push({
        key: "org:" + e.organisasjonsnummer,
        org_nr: e.organisasjonsnummer,
        name: e.navn,
        kind_hint: e.naeringskode1?.beskrivelse || null,
        region: regionOf(e.forretningsadresse?.kommunenummer, e.forretningsadresse?.kommune),
        url: e.hjemmeside ? (e.hjemmeside.startsWith("http") ? e.hjemmeside : "https://" + e.hjemmeside) : null,
        source: "brreg:ny",
        context: `${e.organisasjonsform?.kode || ""} registrert ${e.registreringsdatoEnhetsregisteret || "?"}, ${e.antallAnsatte ?? "?"} ansatte`,
      });
    }
    if (list.length < 100) break;
  }
  return out;
}

export function rotate(list, week, n) {
  const start = ((week - 1) * n) % list.length;
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length]);
}

async function fromSerper(ctx) {
  const out = [];
  for (const q of rotate(DISCOVERY, weekNumber(ctx.week), 10)) {
    let data;
    try {
      data = await postJson("https://google.serper.dev/search", { q, gl: "no", hl: "no", num: 10 }, { headers: { "x-api-key": process.env.SERPER_API_KEY }, gapMs: 250 });
    } catch (e) {
      ctx.log("scout", `«${q}»: ${e.message}`);
      continue;
    }
    for (const r of data.organic || []) {
      const d = domainOf(r.link);
      if (!d || NOT_A_LEAD.test(d)) continue;
      const name = normalizeWs(String(r.title || d).split(/\s[-–|·]\s/)[0]).slice(0, 80);
      out.push({ key: "url:" + d, org_nr: null, name, kind_hint: null, region: null, url: "https://" + d, source: "serper:" + q, context: truncate(r.snippet || "", 200) });
    }
  }
  return out;
}

export async function run(ctx) {
  const db = ctx.dryRun ? null : sql();
  const stats = { brreg: 0, serper: 0, candidates: 0, scored: 0, inserted: 0, strong: 0 };

  let since = null;
  if (db) since = (await db`select started_at from seo.runs where step = 'scout' and status = 'ok' order by started_at desc limit 1`)[0]?.started_at || null;
  since = (since ? new Date(since) : new Date(ctx.runDate.getTime() - 14 * 864e5)).toISOString().slice(0, 10);

  let candidates = [];
  try {
    const b = await fromBrreg(ctx, since);
    stats.brreg = b.length;
    candidates.push(...b);
  } catch (e) {
    ctx.log("scout", "Brønnøysund: " + e.message);
  }
  if (process.env.SERPER_API_KEY) {
    const s = await fromSerper(ctx);
    stats.serper = s.length;
    candidates.push(...s);
  }

  // Dedupe against everything Martin already knows.
  const seen = new Set();
  candidates = candidates.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
  if (db) {
    const leads = await db`select org_nr, url, lower(name) as name from seo.leads`;
    const partners = await db`select lower(name) as name from dash.partners`;
    const comps = await db`select domain, lower(name) as name from seo.competitors`;
    const knownOrg = new Set(leads.map((l) => l.org_nr).filter(Boolean));
    const knownDomain = new Set([...leads.map((l) => domainOf(l.url || "")), ...comps.map((c) => c.domain)].filter(Boolean));
    const knownName = new Set([...leads.map((l) => l.name), ...partners.map((p) => p.name), ...comps.map((c) => c.name)]);
    candidates = candidates.filter((c) => !(c.org_nr && knownOrg.has(c.org_nr)) && !(c.url && knownDomain.has(domainOf(c.url))) && !knownName.has(c.name.toLowerCase()));
  }
  stats.candidates = candidates.length;
  if (!candidates.length) {
    await pulse(ctx, { source: "scout", kind: "tall", severity: "info", title: "Scout: ingen nye kandidater denne uka", body: `Brønnøysund siden ${since}: ${stats.brreg}, Google: ${stats.serper}, alle kjent fra før.` });
    return stats;
  }

  let scored = new Map();
  if (aiEnabled()) {
    const system = await readFile(join(here, "..", "prompts", "lead-score.md"), "utf8");
    const schema = {
      type: "object", additionalProperties: false, required: ["items"],
      properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "icp_score", "kind", "region", "reason"],
        properties: { key: { type: "string" }, icp_score: { type: "integer", minimum: 0, maximum: 100 }, kind: { type: "string" }, region: { type: "string" }, reason: { type: "string" } } } } },
    };
    for (let i = 0; i < candidates.length; i += 20) {
      const batch = candidates.slice(i, i + 20);
      try {
        const res = await claudeJson({
          system,
          user: "Vurder disse kandidatene. Returner én rad per nøkkel (key).\n\n" +
            batch.map((c) => `key: ${c.key}\n  navn: ${c.name}\n  bransje: ${c.kind_hint || "ukjent"}\n  region: ${c.region || "ukjent"}\n  nettsted: ${c.url || "ukjent"}\n  kilde: ${c.source}\n  kontekst: ${c.context || ""}`).join("\n\n"),
          schema, maxTokens: 4000, timeoutMs: 120000,
        });
        for (const it of res.items || []) scored.set(it.key, it);
        stats.scored += (res.items || []).length;
      } catch (e) {
        ctx.log("scout", "scoring feilet: " + e.message);
      }
    }
  }

  for (const c of candidates) {
    const s = scored.get(c.key);
    if (aiEnabled() && (!s || s.icp_score < 40)) continue;
    if (!aiEnabled() && !c.org_nr) continue; // unscored web hits are too noisy to keep
    const row = {
      org_nr: c.org_nr, name: c.name, kind: s?.kind || c.kind_hint || null, region: s?.region || c.region || null,
      url: c.url, source: c.source, icp_score: s?.icp_score ?? null,
      reason: s?.reason || (aiEnabled() ? null : "Ikke scoret (ANTHROPIC_API_KEY mangler). " + (c.context || "")),
    };
    if (db) {
      await db`insert into seo.leads (org_nr, name, kind, region, url, source, icp_score, reason)
        values (${row.org_nr}, ${row.name}, ${row.kind}, ${row.region}, ${row.url}, ${row.source}, ${row.icp_score}, ${row.reason})
        on conflict do nothing`;
    }
    stats.inserted += 1;
    if ((row.icp_score ?? 0) >= 70) {
      stats.strong += 1;
      await pulse(ctx, {
        source: "scout", kind: "lead", severity: "notis",
        title: `Lead ${row.icp_score}: ${row.name}${row.region ? " (" + row.region + ")" : ""}`,
        body: row.reason, data: row,
      });
    }
  }
  await pulse(ctx, {
    source: "scout", kind: "tall", severity: "info",
    title: `Scout: ${stats.inserted} nye leads, ${stats.strong} sterke`,
    body: `${stats.candidates} kandidater (Brønnøysund ${stats.brreg}, Google ${stats.serper}) siden ${since}.`, data: stats,
  });
  return stats;
}
