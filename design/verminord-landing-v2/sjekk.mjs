/* ============================================================
   Verminord landing v2 — regelsjekk

   Designbriefen har harde regler. De er lette å bryte ved et uhell
   neste gang noen redigerer en fil, så de sjekkes maskinelt her.

       node sjekk.mjs

   Krever playwright og en Chromium. Sett CHROMIUM_PATH om binæren
   ligger et annet sted enn standardoppslaget.
   ============================================================ */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const url = (f) => "file://" + path.join(DIR, f);

const GULL = "rgb(201, 168, 76)";
const HERO_SLUTT = ".dok-grid"; // alt over dette regnes som hero-området

let brudd = 0;
const ok = (m) => console.log("  ok    " + m);
const feil = (m) => { brudd++; console.log("  BRUDD " + m); };

/* --- tekstbaserte regler ------------------------------------- */

const PRIS = /\b(\d+[\s.,]?\d*\s*(kr|nok|kroner)|kr\.?\s*\d|nok\s*\d|pris(en|er|ene)?\b|koster\b|eks\.?\s*mva|inkl\.?\s*mva)/i;

/* Utbytte- og vekstpåstander. "vokser", "avling", "meravling",
   "større", "friskere", "bedre resultat" — alt som lover et utfall. */
const UTBYTTE = /\b(avling|meravling|utbytte|vokser\s+(bedre|raskere)|raskere\s+vekst|okt\s+vekst|økt\s+vekst|storre\s+planter|større\s+planter|friskere\s+planter|bedre\s+resultat|gir\s+deg\s+\d+\s*%|opptil\s+\d+\s*%)/i;

/* Alt som antyder at det finnes flere enn én person. */
const BEMANNING = /\b(vart\s+team|vårt\s+team|teamet\s+vart|teamet\s+vårt|vare\s+ansatte|våre\s+ansatte|medarbeider|de\s+ansatte|kundeservice|vi\s+i\s+verminord|kollega)/i;

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

/* --- kjør ------------------------------------------------------ */

const kromPath = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(
  fs.existsSync(kromPath) ? { executablePath: kromPath } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

/* ============ 1. index.html ============ */
console.log("\nindex.html");
await page.goto(url("index.html"), { waitUntil: "networkidle" });

const tekstHjem = await page.evaluate(() => document.body.innerText);

PRIS.test(tekstHjem) ? feil("pris i synlig tekst: " + tekstHjem.match(PRIS)[0]) : ok("ingen pris i synlig tekst");
UTBYTTE.test(tekstHjem) ? feil("utbytte-/vekstpåstand: " + tekstHjem.match(UTBYTTE)[0]) : ok("ingen utbytte- eller vekstpåstander");
BEMANNING.test(tekstHjem) ? feil("antyder bemanning: " + tekstHjem.match(BEMANNING)[0]) : ok("ingenting som antyder ansatte");
tekstHjem.includes("!") ? feil("utropstegn i teksten") : ok("ingen utropstegn");
EMOJI.test(tekstHjem) ? feil("emoji i teksten") : ok("ingen emoji");

/* gull: skal forekomme på nøyaktig ett element, og det skal være hero-CTA-en */
const gullTreff = await page.evaluate((g) => {
  const treff = [];
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    const felt = [s.backgroundColor, s.color, s.borderTopColor, s.borderRightColor,
                  s.borderBottomColor, s.borderLeftColor, s.outlineColor, s.textDecorationColor];
    if (felt.includes(g)) {
      treff.push({
        tag: el.tagName.toLowerCase(),
        klasse: el.className && el.className.toString(),
        tekst: (el.textContent || "").trim().slice(0, 40),
      });
    }
  }
  return treff;
}, GULL);

if (gullTreff.length === 1 && /btn--gold/.test(gullTreff[0].klasse)) {
  ok(`gull brukt nøyaktig én gang: "${gullTreff[0].tekst}"`);
} else {
  feil(`gull brukt ${gullTreff.length} ganger: ` + JSON.stringify(gullTreff));
}

/* lokalt utsalg skal ikke være lenket fra topbar, footer eller hero */
const lokalLenker = await page.evaluate((heroSlutt) => {
  const grense = document.querySelector(heroSlutt).getBoundingClientRect().top + window.scrollY;
  return [...document.querySelectorAll('a[href*="lokalt-utsalg"]')].map((a) => ({
    klasse: a.className,
    iTopbar: !!a.closest(".topbar"),
    iFooter: !!a.closest(".footer"),
    iHero: a.getBoundingClientRect().top + window.scrollY < grense,
    iResultat: !!a.closest(".lokal-link"),
  }));
}, HERO_SLUTT);

lokalLenker.length === 0
  ? ok("lokalt utsalg ikke lenket før kalkulatoren er besvart")
  : feil("lokalt utsalg lenket før svar: " + JSON.stringify(lokalLenker));

/* --- kjør kalkulatoren gjennom den briefede stien --- */
await page.click("text=Begge deler");
await page.click("text=Bed og grønnsakshage");
await page.click('button:has-text("Neste")');
await page.click("text=Ja, men ikke hvert år");
await page.waitForTimeout(120);

const FASIT = "Til 20 m² grønnsaksbed går det med ca. 3 kg vermikompost per sesong — omtrent 2 sekker à 5 liter.";
const fikk = (await page.locator("#kalk-resultat").innerText()).trim();
fikk === FASIT ? ok("resultatteksten er ordrett som i briefen") : feil(`resultat avviker:\n        ventet: ${FASIT}\n        fikk  : ${fikk}`);

const etterSvar = await page.evaluate((heroSlutt) => {
  const grense = document.querySelector(heroSlutt).getBoundingClientRect().top + window.scrollY;
  return [...document.querySelectorAll('a[href*="lokalt-utsalg"]')].map((a) => ({
    klasse: a.className,
    iTopbar: !!a.closest(".topbar"),
    iFooter: !!a.closest(".footer"),
    iHero: a.getBoundingClientRect().top + window.scrollY < grense,
    iResultat: !!a.closest(".lokal-link"),
    knapp: a.tagName === "BUTTON" || /btn/.test(a.className),
  }));
}, HERO_SLUTT);

if (etterSvar.length === 1 && etterSvar[0].iResultat && !etterSvar[0].iTopbar && !etterSvar[0].iFooter && !etterSvar[0].iHero && !etterSvar[0].knapp) {
  ok("lokalt utsalg nås kun fra én ren tekstlenke nederst i resultatet");
} else {
  feil("feil inngang til lokalt utsalg: " + JSON.stringify(etterSvar));
}

/* samtykke skal ikke være forhåndsavhuket */
const huket = await page.locator("#plan-samtykke").isChecked();
huket ? feil("samtykkeboksen er forhåndsavhuket") : ok("samtykkeboksen er ikke forhåndsavhuket");

/* treffflater */
const smaa = await page.evaluate(() => {
  const ut = [];
  for (const el of document.querySelectorAll("button, a, input, select, textarea")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    /* En avkrysningsboks i en <label> har hele etiketten som treffflate. */
    const treff = el.closest("label") || el;
    const tr = treff.getBoundingClientRect();
    if (tr.height < 44 && !el.closest(".footer") && !el.closest(".topbar") &&
        !el.matches(".textlink") && !el.matches(".quiet-link")) {
      ut.push((el.className || el.tagName) + " (" + Math.round(tr.height) + "px)");
    }
  }
  return ut;
});
smaa.length === 0 ? ok("alle treffflater i skjemaer og kalkulator er minst 44 px høye") : feil("for små treffflater: " + JSON.stringify(smaa));

/* ============ 2. lokalt-utsalg.html ============ */
console.log("\nlokalt-utsalg.html");
await page.goto(url("lokalt-utsalg.html"), { waitUntil: "networkidle" });

const tekstLokal = await page.evaluate(() => document.body.innerText);

PRIS.test(tekstLokal) ? feil("pris i synlig tekst: " + tekstLokal.match(PRIS)[0]) : ok("ingen pris — beløpet står på skiltet, ikke på nett");
BEMANNING.test(tekstLokal) ? feil("antyder bemanning: " + tekstLokal.match(BEMANNING)[0]) : ok("ingenting som antyder ansatte");
tekstLokal.includes("!") ? feil("utropstegn i teksten") : ok("ingen utropstegn");

const gullLokal = await page.evaluate((g) => {
  let n = 0;
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    if ([s.backgroundColor, s.color, s.borderTopColor, s.borderRightColor,
         s.borderBottomColor, s.borderLeftColor, s.textDecorationColor].includes(g)) n++;
  }
  return n;
}, GULL);
gullLokal === 0 ? ok("ingen bruk av gull") : feil(`gull brukt ${gullLokal} ganger`);

const knapper = await page.evaluate(() =>
  [...document.querySelectorAll("button, .btn, input[type=submit]")].map((e) => e.className || e.tagName)
);
knapper.length === 0 ? ok("ingen CTA-knapp") : feil("knapper på siden: " + JSON.stringify(knapper));

const robots = await page.evaluate(() => {
  const m = document.querySelector('meta[name="robots"]');
  return m ? m.content : null;
});
robots && /noindex/.test(robots) ? ok(`holdt utenfor søkeindeks (${robots})`) : feil("mangler robots noindex");

const selvLenke = await page.evaluate(() =>
  [...document.querySelectorAll(".topbar a, .footer a")].map((a) => a.getAttribute("href"))
);
selvLenke.some((h) => h && h.includes("lokalt-utsalg"))
  ? feil("siden lenker til seg selv fra nav")
  : ok("ikke lenket fra egen topbar eller footer");

/* textContent, ikke innerText — kilden skal si "bilde kommer" selv om
   CSS setter den i versaler slik resten av systemetikettene er satt. */
const bilde = await page.evaluate(() => document.querySelector(".bilde-blokk span").textContent.trim());
bilde === "bilde kommer" ? ok('bildeplassholder merket "bilde kommer"') : feil(`bildeplassholder er merket "${bilde}"`);

await browser.close();

console.log("\n" + (brudd === 0 ? "Alle regler holder." : `${brudd} brudd.`));
process.exit(brudd === 0 ? 0 : 1);
