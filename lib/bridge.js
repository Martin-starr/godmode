// Read-only Apps Script bridge (Gmail). The deployed script runs as the
// Google account that receives forwarded verminord mail and serves
// `?action=gmail`.
//
// The URL and token used to sit here as hardcoded fallbacks. This repo is
// public, so those were a live credential in public git history — and a
// fallback that silently takes over when the env var is missing also hides
// the misconfiguration it is covering for, which is how a rotated token
// turns into "Gmail-broen avviste kallet (unauthorized)" two weeks later
// with nothing pointing at the cause. Both are now required, and their
// absence fails loudly with the fix in the message.
//
// Rotating is: redeploy the Apps Script with a new token → set
// APPS_SCRIPT_URL and APPS_SCRIPT_TOKEN on the Vercel project → redeploy.
export function bridgeConfig() {
  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;
  const missing = [
    !url && "APPS_SCRIPT_URL",
    !token && "APPS_SCRIPT_TOKEN",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      "Gmail-broen er ikke konfigurert — mangler " +
        missing.join(" og ") +
        " på Vercel-prosjektet verminord-dash."
    );
  }
  return { url, token };
}

// Last ~7 days of inbox threads (max 50), as
// { id, subject, from:{name,email}, snippet, date, unread, labels,
//   messageCount, hasDraft, permalink }.
// A cold Apps Script + Gmail search of 50 threads regularly takes 15-25s,
// so the caller must run with watchdog:false and a matching maxDuration.
export async function fetchGmailThreads() {
  const { url, token } = bridgeConfig();
  let res;
  try {
    res = await fetch(url + "?action=gmail&token=" + encodeURIComponent(token), {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      throw new Error("Gmail-broen brukte for lang tid (kald start hos Google) — prøv igjen om et halvt minutt.");
    }
    throw new Error("Fikk ikke kontakt med Gmail-broen — prøv igjen.");
  }
  if (!res.ok) throw new Error("Gmail-broen svarte " + res.status + " — prøv igjen.");
  const body = await res.json();
  if (body.error) throw new Error("Gmail-broen avviste kallet (" + body.error + ").");
  return Array.isArray(body.gmail) ? body.gmail : [];
}

/* Heuristic triage, ported from the old app's connectors.js. Runs on every
   sync so new mail is never invisible while waiting for the daily Claude
   routine (which later enriches summaries/drafts but never re-touches
   rows this classifier already inserted). */
const NOISE_RX =
  /(linkedin|instagram|facebook|tasklet|zapier|revolut|base44|dash0|posts-recap|messages-noreply|news@|learn@|notifications?@|noreply|no-reply|mailer-daemon|substack|medium|youtube\.com|spotify\.com|finn\.no|finn-varsling)/i;
const UPDATE_RX = /^(accounts\.google\.com|microsoft\.com|google\.com|github\.com|stripe\.com|vercel\.com|netlify\.com|notion\.so)$/i;
const FINANCE_KW =
  /(faktura|invoice|kvittering|receipt|betaling|payment|vipps oppgjør|vipps-oppgjør|altinn|skattetrekk|mva|moms|brønnøysund)/i;
const SUPPLIER_KW =
  /(leverandør|tilbud|pristilbud|sensor|quanturi|spec[-\s]?sheet|datablad|order confirmation|innkjøp|bestillingsbekreftelse)/i;
const CUSTOMER_KW = /(bestilling|kundeforespørsel|order request|kjøp|d2c|levering|abonnement|tilbud forespørsel)/i;
const PARTNER_KW = /(samarbeid|møte|teams|partner|nlr|debio|mattilsynet|statsforvalter|kommune|landbruk|jord|hjelseth)/i;
// A failing Verminord system (Apps Script, GitHub Action, Vercel deploy) is
// real operational signal, even when the sender is a "noreply" bot — it must
// be checked BEFORE the noise filter, which would otherwise auto-archive it.
const INFRA_FAIL_RX = /(verminord|godmode)[^\n]{0,120}(fail|failure|feilet|failed|error)|((fail|failure|failed|error)[^\n]{0,120}verminord)/i;
// One-time codes and click-to-confirm mails are worthless minutes after they
// arrive — archive instead of leaving them "open" forever.
const OTP_RX = /(innloggingskode|engangskode|login code|verification code|security code|confirm your .{0,30}(email|e-post)|bekreft e-postadressen|activate .{0,30}form)/i;

export function classifyThread(t) {
  const subject = t.subject || "";
  const snippet = t.snippet || "";
  const fromName = (t.from && t.from.name) || "";
  const fromEmail = (t.from && t.from.email) || "";
  const domain = fromEmail.split("@")[1] || "";
  const haystack = subject + " " + snippet + " " + fromEmail + " " + fromName;

  if (INFRA_FAIL_RX.test(subject + " " + snippet)) {
    return { category: "Til info", priority: "høy", status: "open", summary: "Verminord-drift — noe feiler, sjekk varselet." };
  }
  if (OTP_RX.test(subject)) {
    return { category: "Til info", priority: "lav", status: "done", summary: "Engangskode/bekreftelse — utgått, arkivert automatisk." };
  }
  if (NOISE_RX.test(haystack) || NOISE_RX.test(domain)) {
    // Recorded and searchable, but never clutters the open list.
    return { category: "Til info", priority: "lav", status: "done", summary: "Støy/markedsføring — arkivert automatisk." };
  }
  if (UPDATE_RX.test(domain) && !FINANCE_KW.test(haystack)) {
    return { category: "Til info", priority: "lav", status: "open", summary: "Systemvarsel — vurder relevans." };
  }
  if (FINANCE_KW.test(haystack)) {
    return { category: "Svar kreves", priority: "høy", status: "open", summary: "Økonomi — sjekk beløp og forfall." };
  }
  if (SUPPLIER_KW.test(haystack)) {
    return { category: "Svar kreves", priority: "medium", status: "open", summary: "Leverandør — be om pris/spec." };
  }
  if (CUSTOMER_KW.test(haystack)) {
    return { category: "Svar kreves", priority: "medium", status: "open", summary: "Kunde — bekreft mottak, foreslå leveringsplan." };
  }
  if (PARTNER_KW.test(haystack)) {
    return { category: "Svar kreves", priority: "medium", status: "open", summary: "Partner — bekreft og foreslå neste steg." };
  }
  return { category: "Til info", priority: "medium", status: "open", summary: "Vurder relevans — svar hvis personhenvendelse." };
}
