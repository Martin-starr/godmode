// Step 6 — Brønnøysundregistrene: who the competitors are on paper.
//
// Enhetsregisteret gives NACE code, employees and founding date; the open
// part of Regnskapsregisteret gives the latest filed accounts (revenue,
// result). Both are free, unauthenticated and updated on weekdays. Company
// facts change once a year, so a row older than 30 days is refreshed and
// everything younger is left alone.
import { getJson, request } from "../lib/fetch.mjs";
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";

const ENHETER = "https://data.brreg.no/enhetsregisteret/api/enheter";
const REGNSKAP = "https://data.brreg.no/regnskapsregisteret/regnskap/";

function cleanName(n) {
  return String(n || "").toUpperCase().replace(/\s+/g, " ").trim();
}

// Exact name match only. "Nelson Garden" must match "NELSON GARDEN AS" and
// nothing else; a fuzzy match would happily pick a sole proprietorship with
// a similar name and attach its accounts to the wrong competitor.
export async function resolveOrgNr(name) {
  const data = await getJson(ENHETER + "?navn=" + encodeURIComponent(name) + "&size=10", { gapMs: 500 });
  const list = data?._embedded?.enheter || [];
  const target = cleanName(name);
  const hit = list.find((e) => {
    const n = cleanName(e.navn);
    return n === target || n === target + " AS" || n.replace(/ AS$/, "") === target.replace(/ AS$/, "");
  });
  return hit ? hit.organisasjonsnummer : null;
}

export function pickAccounts(list) {
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  const latest = arr
    .filter((r) => r?.regnskapsperiode?.fraDato)
    .sort((a, b) => String(b.regnskapsperiode.fraDato).localeCompare(String(a.regnskapsperiode.fraDato)))[0];
  if (!latest) return null;
  const res = latest.resultatregnskapResultat || {};
  const revenue = res.driftsresultat?.driftsinntekter?.sumDriftsinntekter ?? res.driftsresultat?.driftsinntekter?.salgsinntekter ?? null;
  return {
    fiscal_year: Number(String(latest.regnskapsperiode.fraDato).slice(0, 4)) || null,
    revenue_nok: revenue != null ? Math.round(Number(revenue)) : null,
    result_nok: res.aarsresultat != null ? Math.round(Number(res.aarsresultat)) : null,
  };
}

export async function run(ctx) {
  const db = ctx.dryRun ? null : sql();
  const competitors = db
    ? await db`select id, name, org_nr, kind from seo.competitors where active and kind in ('produsent','merke','forhandler') order by id`
    : [{ id: 0, name: "Grønn Vekst AS", org_nr: null, kind: "merke" }];
  const stats = { resolved: 0, refreshed: 0, skipped: 0 };

  for (const c of competitors) {
    let orgNr = c.org_nr;
    if (!orgNr) {
      try {
        orgNr = await resolveOrgNr(c.name);
      } catch (e) {
        ctx.log("brreg", `${c.name}: oppslag feilet: ${e.message}`);
        continue;
      }
      if (!orgNr) {
        ctx.log("brreg", `${c.name}: ingen eksakt treff i Enhetsregisteret`);
        continue;
      }
      stats.resolved += 1;
      if (db) await db`update seo.competitors set org_nr = ${orgNr} where id = ${c.id}`;
    }

    if (db) {
      const fresh = (await db`select 1 from seo.company_facts where org_nr = ${orgNr} and fetched_at > now() - interval '30 days'`).length > 0;
      if (fresh) { stats.skipped += 1; continue; }
    }

    let enhet;
    try {
      enhet = await getJson(ENHETER + "/" + orgNr, { gapMs: 500 });
    } catch (e) {
      ctx.log("brreg", `${c.name} (${orgNr}): ${e.message}`);
      continue;
    }
    let accounts = null;
    try {
      const r = await request(REGNSKAP + orgNr, { expect: "json", gapMs: 500, retries: 1 });
      if (r.ok) accounts = pickAccounts(r.json());
    } catch (e) {
      ctx.log("brreg", `${c.name} regnskap: ${e.message}`);
    }

    const row = {
      org_nr: orgNr,
      name: enhet.navn || c.name,
      nace_code: enhet.naeringskode1?.kode || null,
      nace_text: enhet.naeringskode1?.beskrivelse || null,
      employees: enhet.antallAnsatte ?? null,
      founded: enhet.stiftelsesdato || null,
      fiscal_year: accounts?.fiscal_year ?? null,
      revenue_nok: accounts?.revenue_nok ?? null,
      result_nok: accounts?.result_nok ?? null,
    };
    if (db) {
      await db`insert into seo.company_facts (org_nr, fetched_at, name, nace_code, nace_text, employees, founded, fiscal_year, revenue_nok, result_nok, raw)
        values (${row.org_nr}, now(), ${row.name}, ${row.nace_code}, ${row.nace_text}, ${row.employees}, ${row.founded}, ${row.fiscal_year}, ${row.revenue_nok}, ${row.result_nok},
                ${JSON.stringify({ enhet: { organisasjonsform: enhet.organisasjonsform?.kode, kommune: enhet.forretningsadresse?.kommune, poststed: enhet.forretningsadresse?.poststed }, accounts })}::jsonb)
        on conflict (org_nr) do update set fetched_at = now(), name = excluded.name, nace_code = excluded.nace_code, nace_text = excluded.nace_text,
          employees = excluded.employees, founded = excluded.founded, fiscal_year = excluded.fiscal_year, revenue_nok = excluded.revenue_nok, result_nok = excluded.result_nok, raw = excluded.raw`;
    }
    stats.refreshed += 1;
    await pulse(ctx, {
      source: "brreg", kind: "konkurrent", severity: "info",
      title: `${row.name}: ${row.employees ?? "?"} ansatte, omsetning ${row.revenue_nok != null ? Math.round(row.revenue_nok / 1e6 * 10) / 10 + " MNOK" : "ikke levert"}${row.fiscal_year ? " (" + row.fiscal_year + ")" : ""}`,
      body: [row.nace_code, row.nace_text].filter(Boolean).join(" ") || null,
      data: row,
    });
  }
  return stats;
}
