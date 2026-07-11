// Read-only Apps Script bridge (Gmail). The deployed script runs as the
// Google account that receives forwarded verminord mail and serves
// `?action=gmail` — the same bridge the phone logger's Sheets dual-write
// uses. The default URL+token below were already public in the old client
// bundle; env vars take precedence so rotating the token is just
// "redeploy script → set two Vercel env vars", no code change.
const DEFAULT_URL =
  "https://script.google.com/macros/s/AKfycbwuFxf1kmINiZfAU2rNtGdb_NFgMPnOdQxtX-yMEBZbr4n6xNgNai3HifMUjXkHqyBG/exec";
const DEFAULT_TOKEN = "vn_GXSuxVTJg6vqMBGPvrNZcjshh3eYj7Gy";

export function bridgeConfig() {
  return {
    url: process.env.APPS_SCRIPT_URL || DEFAULT_URL,
    token: process.env.APPS_SCRIPT_TOKEN || DEFAULT_TOKEN,
  };
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
  /(linkedin|instagram|facebook|tasklet|zapier|revolut|base44|dash0|posts-recap|messages-noreply|news@|learn@|notifications?@|noreply|no-reply|mailer-daemon|substack|medium|youtube\.com|spotify\.com)/i;
const UPDATE_RX = /^(accounts\.google\.com|microsoft\.com|google\.com|github\.com|stripe\.com|vercel\.com|netlify\.com|notion\.so)$/i;
const FINANCE_KW =
  /(faktura|invoice|kvittering|receipt|betaling|payment|vipps oppgjør|vipps-oppgjør|altinn|skattetrekk|mva|moms|brønnøysund)/i;
const SUPPLIER_KW =
  /(leverandør|tilbud|pristilbud|sensor|quanturi|spec[-\s]?sheet|datablad|order confirmation|innkjøp|bestillingsbekreftelse)/i;
const CUSTOMER_KW = /(bestilling|kundeforespørsel|order request|kjøp|d2c|levering|abonnement|tilbud forespørsel)/i;
const PARTNER_KW = /(samarbeid|møte|teams|partner|nlr|debio|mattilsynet|statsforvalter|kommune|landbruk|jord|hjelseth)/i;

export function classifyThread(t) {
  const subject = t.subject || "";
  const snippet = t.snippet || "";
  const fromName = (t.from && t.from.name) || "";
  const fromEmail = (t.from && t.from.email) || "";
  const domain = fromEmail.split("@")[1] || "";
  const haystack = subject + " " + snippet + " " + fromEmail + " " + fromName;

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
