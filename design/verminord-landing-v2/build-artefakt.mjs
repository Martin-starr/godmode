/* ============================================================
   Bygger en enkeltfils versjon av landingssiden for deling og
   gjennomgang (Claude Artifact, e-post, hva som helst som vil ha
   én HTML-fil).

       node build-artefakt.mjs [ut-fil]

   Kilden er fortsatt de vanlige filene — dette er bare en pakking,
   ingen andre kopi av designet å holde i sync. Den uoppførte siden
   blir en hash-rute (#lokalt-utsalg), slik at den fremdeles bare nås
   via lenken nederst i kalkulatorsvaret eller en direkte URL.
   ============================================================ */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const UT = process.argv[2] || path.join(DIR, "verminord-landing-v2.artefakt.html");
const les = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

const kropp = (fil) => {
  const s = les(fil);
  const a = s.indexOf("<!-- PAGE:START -->");
  const b = s.indexOf("<!-- PAGE:END -->");
  if (a < 0 || b < 0) throw new Error(`Fant ikke PAGE-markørene i ${fil}`);
  return s.slice(a + "<!-- PAGE:START -->".length, b).trim();
};

/* Fonten må ligge i filen — artefakter får ikke hente lokale filer. */
const font = fs.readFileSync(path.join(DIR, "fonts/ibm-plex-sans-variable.woff2")).toString("base64");
const css = les("verminord.css").replace(
  'url("fonts/ibm-plex-sans-variable.woff2") format("woff2-variations")',
  `url(data:font/woff2;base64,${font}) format("woff2-variations")`
);

/* Filnavn → hash-ruter, både i markup og i kalkulatoren. */
const rutOm = (s) =>
  s.replace(/href="lokalt-utsalg\.html"/g, 'href="#lokalt-utsalg"')
   .replace(/"lokalt-utsalg\.html"/g, '"#lokalt-utsalg"')
   .replace(/href="index\.html#/g, 'href="#')
   .replace(/href="index\.html"/g, 'href="#"');

const js = rutOm(les("kalkulator.js"));

const ruter = `
/* To sider i ett dokument. #lokalt-utsalg viser den uoppførte siden;
   alt annet viser hjemsiden og hopper til ankeret om det finnes. */
(function () {
  var hjem = document.getElementById("side-hjem");
  var lokalt = document.getElementById("side-lokalt");
  function rute() {
    var erLokalt = location.hash === "#lokalt-utsalg";
    hjem.hidden = erLokalt;
    lokalt.hidden = !erLokalt;
    if (erLokalt) { window.scrollTo(0, 0); return; }
    var mal = location.hash.length > 1 && document.querySelector(location.hash);
    if (mal) mal.scrollIntoView();
    else window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", rute);
  rute();
})();`;

const ut = `<title>Verminord.no</title>
<style>
${css}
</style>

<div id="side-hjem">
${rutOm(kropp("index.html"))}
</div>

<div id="side-lokalt" hidden>
${rutOm(kropp("lokalt-utsalg.html"))}
</div>

<script>
${js}
</script>
<script>
${ruter}
</script>
`;

fs.writeFileSync(UT, ut, "utf8");
console.log(`${UT}  ${(Buffer.byteLength(ut) / 1024).toFixed(0)} kB`);
