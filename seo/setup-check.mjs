// Setup-sjekk for SEO-agenten: verifiserer hver hemmelighet uten å skrive ut
// verdien av noen av dem.
//
// Kjøres fra .github/workflows/seo-setup-check.yml. Hensikten er at en feil
// oppsettsverdi skal gi én tydelig linje her i stedet for en kryptisk
// stack trace tjue minutter inn i ukesjobben.
//
// Supavisor-vertsnavnet finnes i to varianter (aws-0-… og aws-1-…) og
// Supabase-dashbordet viser bare den ene. Begge slår opp i DNS, så feil valg
// gir timeout og ikke en navnefeil. Derfor prøver db-sjekken søskenverten når
// den oppgitte ikke svarer, og sier hvilken som faktisk virker.
import { accessToken } from "./lib/google-auth.mjs";

const lines = [];
let failed = false;

const ok = (name, detail) => lines.push(`  OK      ${name}${detail ? " — " + detail : ""}`);
const warn = (name, detail) => lines.push(`  MANGLER ${name}${detail ? " — " + detail : ""}`);
const bad = (name, detail) => { failed = true; lines.push(`  FEIL    ${name}${detail ? " — " + detail : ""}`); };

function siblingHost(host) {
  const m = host.match(/^aws-(\d)-(.+\.pooler\.supabase\.com)$/);
  if (!m) return null;
  return `aws-${m[1] === "0" ? "1" : "0"}-${m[2]}`;
}

async function tryConnect(url) {
  const { default: postgres } = await import("postgres");
  const client = postgres(url, {
    prepare: false,
    max: 1,
    connect_timeout: 15,
    idle_timeout: 5,
    ssl: "require",
  });
  try {
    const [row] = await client`select current_user as who, has_schema_privilege(current_user,'seo','usage') as seo`;
    return { ok: true, who: row.who, seo: row.seo };
  } catch (e) {
    return { ok: false, err: e.code || e.message };
  } finally {
    await client.end({ timeout: 5 }).catch(() => {});
  }
}

async function checkDb() {
  const raw = process.env.DASH_DATABASE_URL;
  if (!raw) return bad("DASH_DATABASE_URL", "ikke satt — ingenting kan lagres");

  let u;
  try {
    u = new URL(raw);
  } catch {
    return bad("DASH_DATABASE_URL", "er ikke en gyldig URL (mangler postgresql://?)");
  }
  if (u.hostname.endsWith("pooler.supabase.com") && u.port === "5432") u.port = "6543";

  const first = await tryConnect(u.toString());
  if (first.ok) {
    ok("DASH_DATABASE_URL", `koblet til som ${first.who}, tilgang til seo-skjema: ${first.seo ? "ja" : "NEI"}`);
    if (!first.seo) bad("DASH_DATABASE_URL", `rollen ${first.who} mangler USAGE på seo-skjemaet`);
    return;
  }

  const alt = siblingHost(u.hostname);
  if (!alt) return bad("DASH_DATABASE_URL", `fikk ikke kontakt (${first.err})`);

  const altUrl = new URL(u.toString());
  altUrl.hostname = alt;
  const second = await tryConnect(altUrl.toString());
  if (second.ok) {
    return bad(
      "DASH_DATABASE_URL",
      `feil vertsnavn. Bytt "${u.hostname}" til "${alt}" i hemmeligheten — alt annet i strengen er riktig.`,
    );
  }
  bad("DASH_DATABASE_URL", `fikk ikke kontakt mot verken ${u.hostname} (${first.err}) eller ${alt} (${second.err})`);
}

async function checkGoogle() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return bad("GOOGLE_SERVICE_ACCOUNT_JSON", "ikke satt");

  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    return bad("GOOGLE_SERVICE_ACCOUNT_JSON", "er ikke gyldig JSON — lim inn hele filen, inkludert { og }");
  }
  if (!sa.client_email || !sa.private_key) {
    return bad("GOOGLE_SERVICE_ACCOUNT_JSON", "mangler client_email eller private_key");
  }
  ok("GOOGLE_SERVICE_ACCOUNT_JSON", `tjenestekonto ${sa.client_email}`);

  const site = process.env.GSC_SITE_URL;
  if (!site) {
    bad("GSC_SITE_URL", "ikke satt");
  } else {
    try {
      const token = await accessToken(["https://www.googleapis.com/auth/webmasters.readonly"]);
      const res = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (res.ok) ok("GSC_SITE_URL", `${site} er lesbar for tjenestekontoen`);
      else if (res.status === 403)
        bad("GSC_SITE_URL", `${site}: tjenestekontoen er ikke lagt til som bruker i Search Console (403)`);
      else if (res.status === 404)
        bad("GSC_SITE_URL", `${site}: finnes ikke. Domeneeiendom skrives "sc-domain:verminord.no" (404)`);
      else bad("GSC_SITE_URL", `${site}: HTTP ${res.status}`);
    } catch (e) {
      bad("GSC_SITE_URL", `oppslag feilet: ${e.message}`);
    }
  }

  const ga4 = process.env.GA4_PROPERTY_ID;
  if (!ga4) {
    bad("GA4_PROPERTY_ID", "ikke satt");
  } else if (!/^\d+$/.test(ga4.trim())) {
    bad("GA4_PROPERTY_ID", `skal være bare tall (fikk "${ga4.trim().slice(0, 12)}")`);
  } else {
    try {
      const token = await accessToken(["https://www.googleapis.com/auth/analytics.readonly"]);
      const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${ga4.trim()}:runReport`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
            metrics: [{ name: "sessions" }],
          }),
        },
      );
      if (res.ok) ok("GA4_PROPERTY_ID", `eiendom ${ga4.trim()} svarer`);
      else {
        const body = await res.text();
        if (res.status === 403 && /Data API/i.test(body))
          bad("GA4_PROPERTY_ID", "Google Analytics Data API er ikke slått på i Google Cloud");
        else if (res.status === 403)
          bad("GA4_PROPERTY_ID", "tjenestekontoen er ikke lagt til som Leser på GA4-eiendommen (403)");
        else bad("GA4_PROPERTY_ID", `HTTP ${res.status}: ${body.slice(0, 160)}`);
      }
    } catch (e) {
      bad("GA4_PROPERTY_ID", `oppslag feilet: ${e.message}`);
    }
  }
}

async function checkSerper() {
  const key = process.env.SERPER_API_KEY;
  if (!key) return warn("SERPER_API_KEY", "ikke satt — SERP-steget hoppes over");
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "content-type": "application/json" },
      body: JSON.stringify({ q: "verminord", gl: "no", hl: "no", num: 1 }),
    });
    if (res.ok) ok("SERPER_API_KEY", "nøkkelen virker");
    else if (res.status === 401 || res.status === 403) bad("SERPER_API_KEY", "nøkkelen ble avvist");
    else bad("SERPER_API_KEY", `HTTP ${res.status}`);
  } catch (e) {
    bad("SERPER_API_KEY", `oppslag feilet: ${e.message}`);
  }
}

async function checkAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad("ANTHROPIC_API_KEY", "ikke satt — ingen brief kan skrives");
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (res.ok) ok("ANTHROPIC_API_KEY", "nøkkelen virker");
    else if (res.status === 401) bad("ANTHROPIC_API_KEY", "nøkkelen ble avvist (401)");
    else if (res.status === 400) bad("ANTHROPIC_API_KEY", "tom saldo eller ugyldig konto (400)");
    else bad("ANTHROPIC_API_KEY", `HTTP ${res.status}`);
  } catch (e) {
    bad("ANTHROPIC_API_KEY", `oppslag feilet: ${e.message}`);
  }
}

async function checkResend() {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SEO_BRIEF_EMAIL;
  if (!key) bad("RESEND_API_KEY", "ikke satt — ukebrevet kan ikke sendes");
  else {
    try {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { authorization: `Bearer ${key}` },
      });
      if (res.ok) ok("RESEND_API_KEY", "nøkkelen virker");
      else if (res.status === 401) bad("RESEND_API_KEY", "nøkkelen ble avvist (401)");
      else bad("RESEND_API_KEY", `HTTP ${res.status}`);
    } catch (e) {
      bad("RESEND_API_KEY", `oppslag feilet: ${e.message}`);
    }
  }
  if (!to) bad("SEO_BRIEF_EMAIL", "ikke satt — ingen mottaker for ukebrevet");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) bad("SEO_BRIEF_EMAIL", "ser ikke ut som en e-postadresse");
  else ok("SEO_BRIEF_EMAIL", to.trim());
}

console.log("SEO-agent — setup-sjekk\n");
await checkDb();
await checkGoogle();
await checkSerper();
await checkAnthropic();
await checkResend();
console.log(lines.join("\n"));
console.log("");

if (failed) {
  console.log("::error::Oppsettet er ikke komplett. Se linjene merket FEIL over.");
  process.exit(1);
}
console.log("Alt klart. Kjør «SEO ukesjobb» med backfill=true for første kjøring.");
