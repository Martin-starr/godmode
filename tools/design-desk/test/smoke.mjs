/* Design Desk smoke test.
   Proves the existing proofing features still work and the new editing layer does.

   Run:  node tools/design-desk/test/smoke.mjs
   Needs Chromium; this environment has it pre-installed and resolves it via
   PLAYWRIGHT_BROWSERS_PATH. Playwright itself is taken from the global install,
   so nothing is added to the repo's dependencies.
*/
import {createRequire} from 'node:module';
import {existsSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { ({chromium} = require(p)); break; } catch { /* keep looking */ }
}
if (!chromium) {
  console.error('playwright not found — install it globally (npm i -g playwright) and re-run');
  process.exit(2);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = 'file://' + path.join(ROOT, 'design-desk.html');
const FX   = path.join(ROOT, 'test', 'fx-page.html');
if (!existsSync(FX)) { console.error('fixture missing: ' + FX); process.exit(2); }

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
};
const section = (t) => console.log('\n' + t);

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 940}});
/* Network failures reaching fonts.googleapis.com are expected in a sandbox with
   no direct egress — the tool is built to degrade to system fonts when that
   happens, and the URL table is validated separately with curl. Everything else
   that lands in the console is a real defect. */
const NETWORK = /net::ERR_|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|Failed to load resource/i;
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !NETWORK.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(TOOL);
await page.setInputFiles('#file', FX);
await page.waitForSelector('#plate.on');
await page.waitForFunction(() => {
  const f = document.querySelector('#frame');
  return f && f.contentDocument && f.contentDocument.querySelector('h1');
});
const F = page.frameLocator('#frame');

/* ─────────── existing behaviour must not regress ─────────── */
section('REGRESJON — det som fungerte før');

ok((await page.textContent('#fname')).includes('fx-page'), 'filnavn vises i toppbaren');

await page.keyboard.press('m');
ok(await page.locator('#t-mark.on').count() === 1, 'Marker-modus slås på med M');
await F.locator('h1').first().click();
await page.waitForSelector('#sheet.on');
ok((await page.textContent('#e-s')).includes('Legg arbeidet'), 'merknad-arket viser innholdet');
await page.fill('#e-txt', 'Overskriften er for lang');
await page.click('#e-intent .chip[data-i=fjern]');
await page.click('#e-prio .chip[data-p="Må"]');
await page.click('#e-save');
ok(await page.locator('#pins .pin').count() === 1, 'nål plassert på arket');
ok(await page.locator('#notelist .note').count() === 1, 'merknad i listen');
ok((await page.textContent('#notelist .note .tag')).includes('Fjern'), 'merknadens type lagret');

await page.click('#bar [data-w="768"]');
await page.waitForTimeout(700);
ok(await page.locator('#pins .pin').count() === 1, 'nålen overlever breddeskifte');
await page.click('#bar [data-w="0"]');
await page.waitForTimeout(700);

await page.keyboard.press('v');
await F.locator('#om h2').click();
ok(await page.locator('#p-elem.on').count() === 1, 'Velg element bytter til Juster-fanen');
ok((await page.textContent('#elemctl')).includes('Om oss'), 'valgt element vises i panelet');

const size = page.locator('#p-elem .ctl input[type=range]').first();
await size.fill('60');
await size.dispatchEvent('change');
ok(await F.locator('#om h2').evaluate((e) => getComputedStyle(e).fontSize) === '60px',
   'skyveknapp endrer skriftstørrelse');

await page.click('#tabs button[data-p=p-sys]');
ok(await page.locator('#sysctl .swatch').count() >= 3, 'CSS-variabler funnet og listet');
await page.locator('#sysctl .swatch input[type=color]').first()
  .evaluate((i) => { i.value = '#00a3ff'; i.dispatchEvent(new Event('input', {bubbles: true})); });
ok((await F.locator('header.hero').evaluate((e) => getComputedStyle(e).backgroundColor))
     === 'rgb(0, 163, 255)', 'variabel-endring treffer siden');

/* ─────────── the new editing layer ─────────── */
section('NYTT — redigering');

await page.keyboard.press('r');
ok(await page.locator('#t-edit.on').count() === 1, 'Rediger-modus slås på med R');
await F.locator('h1').first().click();
await page.waitForSelector('#tbar.on');
ok(await page.locator('#sel.on').count() === 1, 'valgramme vises');
ok(await page.locator('#tbar button').count() >= 8, 'flytende verktøylinje bygget for tekst');

const tb = await page.locator('#tbar').boundingBox();
const st = await page.locator('#stage').boundingBox();
ok(tb.x >= st.x - 1 && tb.x + tb.width <= st.x + st.width + 1,
   'verktøylinjen klemmes inn i scenen (dekker aldri panelet)');
ok(tb.y >= st.y - 1 && tb.y + tb.height <= st.y + st.height + 1,
   'verktøylinjen holder seg innenfor scenen vertikalt');

await page.click('#tbar button[data-k=size]');
await page.waitForSelector('#pop.on');
ok(await page.locator('#pop.on').count() === 1, 'popup åpnes fra verktøylinjen');
await page.click('#tbar button[data-k=col]');
ok(await page.locator('#pop.on').count() === 1, 'bare én popup av gangen');
await page.keyboard.press('Escape');
ok(await page.locator('#pop.on').count() === 0, 'Escape lukker popupen');

await page.click('#tbar button[data-k=fam]');
await page.waitForSelector('#pop .fitem');
const nFonts = await page.locator('#pop .fitem').count();
ok(nFonts > 40, 'skriftbiblioteket er stort (' + nFonts + ' valg)');
await page.fill('#pop .fsearch input', 'fraun');
await page.waitForTimeout(120);
ok(await page.locator('#pop .fitem').count() === 1, 'søk i skriftlisten filtrerer');
await page.click('#pop .fitem');
ok((await F.locator('h1').first().evaluate((e) => e.style.fontFamily)).includes('Fraunces'),
   'valgt skrift settes på elementet');
ok((await page.textContent('#tbar button[data-k=fam] b')).includes('Fraunces'),
   'verktøylinjen viser den nye skriften');

await page.click('#tabs button[data-p=p-elem]');
ok((await page.textContent('#elemctl')).includes('Fraunces'),
   'panelet er enig med verktøylinjen om skriften');

/* text editing */
await F.locator('h1').first().dblclick();
await page.waitForTimeout(150);
ok(await page.locator('#sel.ed').count() === 1, 'dobbeltklikk starter tekstredigering');
await page.keyboard.press('End');
await page.keyboard.type(' NY');
await F.locator('#om h2').click();
await page.waitForTimeout(120);
ok((await F.locator('h1').first().innerText()).includes('NY'), 'teksten er endret');
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
ok(!(await F.locator('h1').first().innerText()).includes('NY'), 'tekstendring angret');
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(120);
ok((await F.locator('h1').first().innerText()).includes('NY'), 'tekstendring gjentatt');

/* delete + undo must preserve script-made DOM — the whole point of inverse ops */
ok(await F.locator('#js-made').count() === 1, 'sidens eget skript kjørte');
const secs = await F.locator('section').count();
await F.locator('section.cta').click();
await page.keyboard.press('Delete');
await page.waitForTimeout(120);
ok(await F.locator('section').count() === secs - 1, 'seksjon slettet');
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
ok(await F.locator('section').count() === secs, 'sletting angret');
ok(await F.locator('#js-made').count() === 1, 'skript-laget innhold overlevde angre');

/* duplicate — assert on the element actually selected, not an ancestor */
const tiles = await F.locator('.tile').count();
await F.locator('.tile').first().click();
await page.keyboard.press('Control+d');
await page.waitForTimeout(150);
ok(await F.locator('.tile').count() === tiles + 1, 'dupliser med ⌘D');
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
ok(await F.locator('.tile').count() === tiles, 'duplisering angret');

/* context menu */
await F.locator('#kort h2').click({button: 'right'});
await page.waitForSelector('#menu.on');
ok(await page.locator('#menu button').count() >= 7, 'høyreklikkmeny åpnes');
await page.locator('#menu button', {hasText: 'Velg forelder'}).click();
await page.waitForTimeout(120);
ok((await page.textContent('#elemctl')).includes('section'), 'Velg forelder går opp et nivå');

/* nudge */
await F.locator('#rutenett h2').click();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(80);
ok((await F.locator('#rutenett h2').evaluate((e) => e.style.transform)).includes('translate'),
   'piltast flytter elementet');
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
ok(!(await F.locator('#rutenett h2').evaluate((e) => e.style.transform)).includes('2px'),
   'flytting angret i ett steg');

/* orphaned note keeps its pin */
await F.locator('h1').first().click();
await page.keyboard.press('Delete');
await page.waitForTimeout(150);
ok(await page.locator('#pins .pin.gone').count() === 1,
   'merknad til slettet element vises som løs nål');
ok((await page.textContent('#notelist')).includes('slettet'),
   'merknadslisten sier at elementet er slettet');
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
ok(await page.locator('#pins .pin.gone').count() === 0, 'nålen kobles på igjen etter angre');

/* layers */
section('NYTT — lag');
await page.keyboard.press('l');
ok(await page.locator('#p-lay.on').count() === 1, 'Lag-panelet åpnes med L');
const rows = await page.locator('#laytree .lay').count();
ok(rows > 5, 'lagtreet er bygget (' + rows + ' rader)');
ok((await page.textContent('#laynow b')) !== '—', 'seksjonsindikatoren viser hvor du er');
await page.locator('#laytree .lay').nth(3).click();
await page.waitForTimeout(120);
ok(await page.locator('#laytree .lay.on').count() === 1, 'lagvalg synkroniserer');
ok(await page.locator('#tbar.on').count() === 1, 'valg fra laglisten åpner verktøylinjen');
const before = await page.locator('#laytree .lay').count();
await page.locator('#laytree .lay .tw').first().click();
await page.waitForTimeout(120);
ok(await page.locator('#laytree .lay').count() !== before, 'utvid/lukk endrer treet');

/* insert */
section('NYTT — sett inn');
const h2s = await F.locator('h2').count();
await page.locator('#inschips .chip', {hasText: 'Seksjon'}).click();
await page.waitForTimeout(150);
ok(await F.locator('h2').count() === h2s + 1, 'ny seksjon satt inn');

/* export */
section('NYTT — eksport');
await page.click('#b-brief');
await page.waitForSelector('#briefwrap');
let txt = await page.inputValue('#b-txt');
ok(txt.includes('## Merknader'), 'brief inneholder merknader');
ok(txt.includes('Endringer gjort i desken'), 'brief inneholder endringsloggen');
await page.click('#b-seg .chip[data-seg=html]');
txt = await page.inputValue('#b-txt');
ok(/^<!DOCTYPE html>/i.test(txt), 'HTML-eksport har doctype');
ok(!/data-dd-id/.test(txt), 'eksporten er ren for data-dd-id');
ok(!/contenteditable/.test(txt), 'eksporten er ren for contenteditable');
ok(!/data-dd-tf/.test(txt), 'eksporten er ren for data-dd-tf');
ok(/Fraunces/.test(txt), 'skriftvalget følger med i eksporten');
ok(/ddf-/.test(txt), 'skrift-lenken er med, så eksporten ser riktig ut');
await page.click('#b-x');

/* layers drag-reorder */
section('NYTT — omrokkering i laglisten');
await page.keyboard.press('l');
await page.waitForTimeout(200);
const orderBefore = await F.locator('body > section, body > header, body > footer')
  .evaluateAll((els) => els.map((e) => e.tagName + (e.id ? '#' + e.id : '')));
const rowFrom = page.locator('#laytree .lay').filter({hasText: 'Rutenett'}).first();
const rowTo = page.locator('#laytree .lay').filter({hasText: 'Om oss'}).first();
await rowFrom.dragTo(rowTo, {targetPosition: {x: 60, y: 2}});
await page.waitForTimeout(250);
const orderAfter = await F.locator('body > section, body > header, body > footer')
  .evaluateAll((els) => els.map((e) => e.tagName + (e.id ? '#' + e.id : '')));
ok(orderBefore.join() !== orderAfter.join(), 'dra i laglisten flytter seksjonen i dokumentet');
await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
const orderUndone = await F.locator('body > section, body > header, body > footer')
  .evaluateAll((els) => els.map((e) => e.tagName + (e.id ? '#' + e.id : '')));
ok(orderUndone.join() === orderBefore.join(), 'omrokkeringen angres helt');

/* the exported file must actually work on its own */
section('NYTT — eksporten åpnes som egen fil');
await page.click('#b-brief');
await page.click('#b-seg .chip[data-seg=html]');
const exported = await page.inputValue('#b-txt');
await page.click('#b-x');
const outFile = path.join(os.tmpdir(), 'dd-export-check.html');
writeFileSync(outFile, exported);
const p2 = await browser.newPage();
const p2errors = [];
p2.on('pageerror', (e) => p2errors.push(e.message));
await p2.goto('file://' + outFile);
await p2.waitForTimeout(500);
ok((await p2.locator('h1').first().innerText()).includes('NY'),
   'den eksporterte filen inneholder den redigerte teksten');
ok((await p2.locator('h1').first().evaluate((e) => e.style.fontFamily)).includes('Fraunces'),
   'skriftvalget virker i den eksporterte filen');
ok(await p2.locator('#js-made').count() >= 1, 'sidens eget innhold er med i eksporten');
ok(await p2.locator('[data-dd-id]').count() === 0, 'ingen redigeringsspor i den eksporterte filen');
ok(p2errors.length === 0, 'eksporten kaster ingen feil' +
   (p2errors.length ? ' — ' + p2errors.join(' | ') : ''));
await p2.close();

/* "Fjern skript" turns the export into a static mockup that cannot re-inject */
await page.click('#b-brief');
await page.click('#b-seg .chip[data-seg=html]');
ok(await page.locator('#b-opts:not([hidden])').count() === 1, 'eksportvalgene vises for HTML');
await page.check('#b-scr-c');
await page.waitForTimeout(150);
const staticHtml = await page.inputValue('#b-txt');
await page.uncheck('#b-scr-c');
await page.click('#b-x');
ok(!/<script/i.test(staticHtml), 'Fjern skript gir en ren statisk mockup');
const outFile2 = path.join(os.tmpdir(), 'dd-export-static.html');
writeFileSync(outFile2, staticHtml);
const p3 = await browser.newPage();
await p3.goto('file://' + outFile2);
await p3.waitForTimeout(300);
ok(await p3.locator('#js-made').count() === 1,
   'den statiske eksporten dobler ikke skript-laget innhold');
ok((await p3.locator('h1').first().innerText()).includes('NY'),
   'den statiske eksporten beholder redigeringene');
await p3.close();

/* reset menu */
section('NYTT — nullstill-meny');
await page.click('#b-reset');
await page.waitForSelector('#menu.on');
ok(await page.locator('#menu button').count() === 3, 'Nullstill gir tre trygge valg');
await page.locator('#menu button', {hasText: 'Bare justeringer'}).click();
await page.waitForTimeout(200);
ok((await F.locator('h1').first().evaluate((e) => e.style.fontFamily)) === '',
   'Bare justeringer fjerner stilene');
await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
ok((await F.locator('h1').first().evaluate((e) => e.style.fontFamily)).includes('Fraunces'),
   'og det kan angres');

/* autosave */
section('NYTT — autolagring');
await page.waitForTimeout(1500);
const saved = await page.evaluate(() => {
  try { const s = localStorage.getItem('dd.save'); return s ? JSON.parse(s) : null; }
  catch { return null; }
});
ok(saved && saved.html && saved.html.length > 500, 'økten er autolagret');
ok(saved && Array.isArray(saved.notes) && saved.notes.length >= 1,
   'merknader er lagret som ren data (ingen DOM-referanser)');
await page.reload();
await page.waitForTimeout(400);
ok(await page.locator('#resume:not([hidden])').count() === 1, 'gjenopprett-stripen vises');
await page.click('#res-go');
await page.waitForTimeout(900);
ok(await page.locator('#plate.on').count() === 1, 'gjenopprettet økt monteres');
ok(await page.locator('#notelist .note').count() >= 1, 'merknadene fulgte med');

/* non-HTML files: annotation only, no crash, clear message */
section('BILDE — redigering skal falle pent tilbake');
const png = path.join(os.tmpdir(), 'dd-fixture.png');
writeFileSync(png, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPUlEQVR42u3RMQ0AAAgDsPk/9K' +
  'sBHrRJk7YDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4H8XkQEBAeYVLQAAAABJRU5ErkJggg==',
  'base64'));
const p4 = await browser.newPage({viewport: {width: 1400, height: 900}});
const p4errors = [];
p4.on('pageerror', (e) => p4errors.push(e.message));
await p4.goto(TOOL);
await p4.setInputFiles('#file', png);
await p4.waitForSelector('#plate.on');
await p4.waitForTimeout(400);
ok(await p4.locator('#img:not([hidden])').count() === 1, 'bildet monteres på arket');
await p4.click('#tabs button[data-p=p-lay]');
ok((await p4.textContent('#nolay')).includes('HTML-filer'), 'Lag-panelet forklarer hvorfor det er tomt');
await p4.keyboard.press('r');
await p4.locator('#plate').click({position: {x: 60, y: 60}});
await p4.waitForTimeout(200);
ok(await p4.locator('#tbar.on').count() === 0, 'ingen verktøylinje uten et dokument å redigere');
await p4.keyboard.press('m');
await p4.locator('#plate').click({position: {x: 80, y: 80}});
await p4.waitForSelector('#sheet.on');
await p4.fill('#e-txt', 'Flytt logoen ned');
await p4.click('#e-save');
ok(await p4.locator('#pins .pin').count() === 1, 'markering på bilde virker fortsatt');
await p4.click('#b-brief');
ok((await p4.inputValue('#b-txt')).includes('Flytt logoen ned'), 'brief virker for bilder');
await p4.click('#b-seg .chip[data-seg=html]');
ok((await p4.inputValue('#b-txt')).includes('Flytt logoen ned'),
   'HTML-eksport avvises pent for bilder (blir stående på brief)');
ok(p4errors.length === 0, 'ingen JS-feil i bildemodus' +
   (p4errors.length ? ' — ' + p4errors.join(' | ') : ''));
await p4.close();

section('KONSOLL');
ok(errors.length === 0, 'ingen feil i konsollen' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
console.log('\n' + (fail ? 'FAIL' : 'ALL OK') + '  —  ' + pass + ' bestått, ' + fail + ' feilet');
process.exit(fail ? 1 : 0);
