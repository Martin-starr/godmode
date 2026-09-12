// Pure text helpers, kept free of I/O so they can be unit-tested against
// fixtures. Everything that decides "is this in stock", "what does it cost",
// "was Verminord mentioned" lives here — those are the readings that will be
// wrong first, and a wrong reading has to be fixable by editing one pattern
// and re-running one test.
import crypto from "node:crypto";

export function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeWs(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// Strips tags without parsing; good enough for regex probes on a whole page.
export function stripHtml(html) {
  return normalizeWs(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
  );
}

// "249,00 kr", "kr 219", "NOK 389", "389,-" → 249 / 219 / 389 / 389.
// Rejects values outside 10–20 000 NOK: a vermicompost product is never 3 kr
// and never 100 000 kr, so anything outside is a page number or a phone number.
export function parsePriceNok(text) {
  const s = normalizeWs(text);
  const patterns = [
    /(?:kr|nok)\s*([0-9]{1,3}(?:[ . ][0-9]{3})*(?:[.,][0-9]{2})?)/i,
    /([0-9]{1,3}(?:[ . ][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:,-|kr\b|nok\b)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (!m) continue;
    const n = numberFromNorwegian(m[1]);
    if (Number.isFinite(n) && n >= 10 && n <= 20000) return Math.round(n * 100) / 100;
  }
  return null;
}

// "1 299", "1.299", "249,00", "249.00", "389" → 1299 / 1299 / 249 / 249 / 389.
// The last two digits after a comma or dot are decimals; every other space
// or dot is a thousands separator.
export function numberFromNorwegian(raw) {
  let s = String(raw).trim();
  const decimal = /[.,](\d{2})$/.exec(s);
  let cents = "";
  if (decimal && !/^\d{1,3}[.,]\d{3}$/.test(s)) {
    cents = decimal[1];
    s = s.slice(0, -3);
  }
  s = s.replace(/[ .]/g, "");
  if (!/^\d+$/.test(s)) return NaN;
  return Number(s + (cents ? "." + cents : ""));
}

const OUT_RX = /\b(utsolgt|ikke på lager|ikke pa lager|midlertidig (?:tomt|utsolgt)|sold out|out of stock|kommer snart|ikke tilgjengelig|tomt på lager|restordre)\b/i;
const IN_RX = /\b(på lager|pa lager|legg i handlekurv|legg i handlevogn|legg i kurv|kjøp nå|kjop na|add to cart|in stock|få igjen|(?:\d+|flere) (?:stk )?på lager)\b/i;

// Decides from visible text plus two structured hints: schema.org
// availability (the most reliable when present) and a disabled buy button.
// Returns true / false / null (could not tell — never guess).
export function detectStock({ text = "", availability = null, buttonDisabled = null }) {
  if (availability) {
    if (/InStock|LimitedAvailability|PreOrder|OnlineOnly|InStoreOnly/i.test(availability)) return true;
    if (/OutOfStock|SoldOut|Discontinued/i.test(availability)) return false;
  }
  if (buttonDisabled === true) return false;
  const t = normalizeWs(text);
  const out = OUT_RX.test(t);
  const inn = IN_RX.test(t);
  if (out && !inn) return false;
  if (inn && !out) return true;
  if (out && inn) {
    // Both words on the page: the one closest to the top of the product
    // block wins. Product pages put the status next to the price; category
    // pages list many products and are ambiguous anyway.
    const oi = t.search(OUT_RX);
    const ii = t.search(IN_RX);
    return ii < oi;
  }
  return null;
}

export function stockText(text) {
  const t = normalizeWs(text);
  const m = OUT_RX.exec(t) || IN_RX.exec(t);
  return m ? m[0] : null;
}

// Mentions of Verminord in an AI answer. Pure code: an LLM judging whether
// an LLM mentioned a brand is a second thing that can be wrong.
const OWN_RX = /verminord|vermicast|verminord\.(com|no)/i;

export function detectMentions(answer, vendorNames) {
  const text = String(answer || "");
  const hits = [];
  for (const name of vendorNames) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "i");
    const m = re.exec(text);
    if (m) hits.push({ name, index: m.index });
  }
  const own = OWN_RX.exec(text);
  if (own) hits.push({ name: "Verminord", index: own.index });
  hits.sort((a, b) => a.index - b.index);
  const seen = new Set();
  const ordered = hits.filter((h) => (seen.has(h.name.toLowerCase()) ? false : (seen.add(h.name.toLowerCase()), true)));
  const rank = ordered.findIndex((h) => h.name === "Verminord");
  return {
    mentioned: rank >= 0,
    mention_rank: rank >= 0 ? rank + 1 : null,
    competitors_mentioned: ordered.filter((h) => h.name !== "Verminord").map((h) => h.name),
  };
}

export function extractUrls(text) {
  const out = new Set();
  const re = /https?:\/\/[^\s)\]}>"'<]+/g;
  let m;
  while ((m = re.exec(String(text || "")))) out.add(m[0].replace(/[.,;:]+$/, ""));
  return [...out];
}

// Platform fingerprints for competitor_tech. Order matters: the first match
// wins, and the specific shop platforms come before the generic CMSs.
const PLATFORMS = [
  ["Shopify", /cdn\.shopify\.com|window\.Shopify|shopify-section/i],
  ["WooCommerce", /woocommerce|wc-add-to-cart|wp-content\/plugins\/woocommerce/i],
  ["Mystore", /mystore\.no|mystore-/i],
  ["24Nettbutikk", /24nettbutikk|24shop/i],
  ["Quickbutik", /quickbutik/i],
  ["Magento", /magento|mage\/cookies/i],
  ["Wix", /static\.parastorage\.com|wix\.com|wixstatic/i],
  ["Squarespace", /squarespace/i],
  ["Webflow", /webflow/i],
  ["WordPress", /wp-content|wp-includes/i],
  ["Next.js", /__NEXT_DATA__|_next\/static/i],
];
const SIGNALS = [
  ["ga4", /G-[A-Z0-9]{6,12}|gtag\(/],
  ["gtm", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,10}/],
  ["meta_pixel", /fbq\(|connect\.facebook\.net\/[a-z_]+\/fbevents\.js/i],
  ["klaviyo", /klaviyo/i],
  ["hotjar", /hotjar/i],
  ["tiktok_pixel", /analytics\.tiktok\.com/i],
  ["vipps", /vipps/i],
  ["klarna", /klarna/i],
];

export function fingerprint(html) {
  const h = String(html || "");
  const platform = (PLATFORMS.find(([, re]) => re.test(h)) || ["ukjent"])[0];
  const signals = {};
  for (const [k, re] of SIGNALS) signals[k] = re.test(h);
  return { platform, signals };
}

export function truncate(s, n) {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
