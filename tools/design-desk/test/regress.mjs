/* One test per defect found in the adversarial review of 2026-08-17.
   Each was reproduced in a real browser before the fix, so each must stay red
   if the fix is ever undone.
   Usage: node tools/design-desk/test/regress.mjs */
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { ({chromium} = require(p)); break; } catch {}
}
if (!chromium) { console.error('playwright not found'); process.exit(2); }

const DIR = import.meta.dirname;
const TOOL = 'file://' + path.join(DIR, '..', 'design-desk.html');
const fx = (f) => path.join(DIR, f);
const NETWORK = /net::ERR_|fonts\.g|Failed to load resource|ERR_CERT/i;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const browser = await chromium.launch();
/** open the tool with a file loaded; returns {p, F, errs} */
async function open(file, opts = {}) {
  const p = await browser.newPage({viewport: opts.viewport || {width: 1500, height: 950}});
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push(m.text()); });
  await p.goto(TOOL);
  if (file) {
    await p.setInputFiles('#file', fx(file));
    await p.waitForSelector('#plate.on');
    await p.waitForFunction(() => !!document.querySelector('#laytree .lay') ||
      !document.querySelector('#frame:not([hidden])'), null, {timeout: 8000}).catch(() => {});
    await p.waitForTimeout(350);
  }
  return {p, F: p.frameLocator('#frame'), errs};
}

/* ── 1 + 2 · undo of a delete when the page has since moved the recorded sibling ── */
{
  console.log('\n1+2  undo survives a page that mutates itself');
  const {p, F, errs} = await open('fx-selfmut.html');
  await p.keyboard.press('r');
  await F.locator('#s2').click();
  await p.keyboard.press('Delete');
  ok(await F.locator('#s2').count() === 0, 'seksjonen ble slettet');
  await p.waitForTimeout(1400);                       // the page removes its own #banner
  ok(await F.locator('#banner').count() === 0, 'siden fjernet sitt eget banner');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(250);
  ok(await F.locator('#s2').count() === 1, 'angre henter seksjonen tilbake');
  ok(errs.length === 0, 'ingen unntak' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  /* and the mutation observer must still be alive afterwards */
  const before = await p.locator('#laytree .lay').count();
  await F.locator('body').evaluate((b) => {
    const s = b.ownerDocument.createElement('section');
    s.innerHTML = '<h2>Lagt til av siden</h2>';
    b.appendChild(s);
  });
  await p.waitForTimeout(700);
  ok(await p.locator('#laytree .lay').count() > before, 'lagpanelet reagerer fortsatt på siden');
  await p.close();
}

/* ── 3 · undo belongs to the field you are typing in ── */
{
  console.log('\n3    ⌘Z inne i et tekstfelt rører ikke dokumentet');
  const {p, F} = await open('fx-links.html');
  await p.keyboard.press('r');
  await F.locator('#b h2').first().click();
  await F.locator('#b h2').first().dblclick();
  await p.keyboard.press('End');
  await p.keyboard.type(' EN');
  await F.locator('#a h2').first().click();           // commit
  await p.waitForTimeout(200);
  const committed = await F.locator('#b h2').first().innerText();
  ok(committed.includes('EN'), 'første redigering lagret');

  /* the note sheet's plain textarea */
  await p.keyboard.press('m');
  await F.locator('#a p').first().click();
  await p.waitForSelector('#sheet.on');
  await p.fill('#e-txt', 'en merknad');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(200);
  ok((await F.locator('#b h2').first().innerText()).includes('EN'),
     'dokumentet er urørt av ⌘Z i merknadsfeltet');
  await p.keyboard.press('Escape');
  await p.close();
}

/* ── 4 · a snapshot too big to save must not leave a stale one behind ── */
{
  console.log('\n4    for stor autolagring lar ikke en gammel økt ligge igjen');
  const big = '/tmp/dd-big.svg';
  writeFileSync(big, '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
    '<rect width="400" height="300" fill="#345"/>' +
    '<!--' + 'x'.repeat(3_200_000) + '-->' + '</svg>');
  const {p, F} = await open('fx-page.html');
  await p.keyboard.press('r');
  await F.locator('#om h2').first().click();
  const sl0 = p.locator('#p-elem .ctl input[type=range]').first();
  await sl0.fill('44'); await sl0.dispatchEvent('change');   // a real commit, so autosave fires
  await p.waitForTimeout(1900);
  const saved = await p.evaluate(() => !!localStorage.getItem('dd.save'));
  ok(saved, 'en gyldig økt ble lagret først');
  await F.locator('#om img').first().click();
  await p.waitForSelector('#tbar button[data-k=swap]');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'),
                                  p.click('#tbar button[data-k=swap]')]);
  await fc.setFiles(big);
  await p.waitForTimeout(2600);
  ok(await p.evaluate(() => !localStorage.getItem('dd.save')),
     'den utdaterte økta ble kastet, ikke beholdt');
  await p.goto(TOOL);
  await p.waitForTimeout(250);
  ok(await p.locator('#resume:not([hidden])').count() === 0,
     '«Fortsett der du slapp» tilbyr ikke en økt den ikke har');
  await p.close();
}

/* ── 5 · a link must never navigate the plate away, in any mode ── */
{
  console.log('\n5    lenker tar ikke over platen');
  const {p, F, errs} = await open('fx-links.html');
  await F.locator('#p1 a').click();                    // no mode chosen at all
  await p.waitForTimeout(500);
  ok(await F.locator('#p1 a').count() === 1, 'dokumentet er fortsatt vårt');
  ok(await p.locator('#laytree .lay').count() > 2, 'lagtreet står');
  await p.keyboard.press('r');
  await F.locator('#a h2').click();
  ok(await p.locator('#tbar.on').count() === 1, 'utvalg virker fortsatt');
  await F.locator('#a button[type=submit]').click();   // and forms
  await p.waitForTimeout(400);
  ok(await F.locator('#p1').count() === 1, 'skjema sender ikke siden bort');
  ok(errs.length === 0, 'ingen unntak' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await p.close();
}

/* ── 6 · pins on a scrolled image plate ── */
{
  console.log('\n6    nåler treffer riktig på en rullet bildeplate');
  const {p} = await open('fx-tall.svg', {viewport: {width: 1400, height: 880}});
  const scrollable = await p.locator('#plate').evaluate((el) => {
    el.scrollTop = 600; return el.scrollHeight > el.clientHeight + 10;
  });
  ok(scrollable, 'platen er faktisk rullbar');
  await p.waitForTimeout(200);
  await p.keyboard.press('m');
  const box = await p.locator('#plate').boundingBox();
  const clickY = box.y + 140;
  await p.mouse.click(box.x + box.width / 2, clickY);
  await p.waitForSelector('#sheet.on');
  await p.fill('#e-txt', 'her');
  await p.click('#e-save');
  await p.waitForTimeout(400);
  const pin = await p.locator('#pins .pin').first().boundingBox();
  ok(pin && Math.abs(pin.y + pin.height / 2 - clickY) < 26,
     'nålen ligger der det ble klikket (avvik ' + (pin ? Math.round(pin.y + pin.height / 2 - clickY) : '—') + ' px)');
  const geo = await p.locator('#plate').evaluate((el) => ({t: el.scrollTop, h: el.scrollHeight}));
  const want = (geo.t + 140) / geo.h * 100;
  await p.click('#b-brief');
  const md = await p.inputValue('#b-txt');
  const m = /y (\d+\.\d)%/.exec(md);
  ok(m && Math.abs(+m[1] - want) < 1.5,
     'briefen oppgir riktig y-prosent (' + (m ? m[1] : '—') + ' mot ventet ' + want.toFixed(1) + ')');
  await p.close();
}

/* ── 7 · a restored session brings its CSS back, not just its looks ── */
{
  console.log('\n7    gjenoppretting tar med seg justeringene');
  const {p, F} = await open('fx-page.html');
  await p.keyboard.press('r');
  await F.locator('#om h2').first().click();
  const sl = p.locator('#p-elem .ctl input[type=range]').first();
  await sl.fill('61'); await sl.dispatchEvent('change');
  await p.click('#tabs button[data-p=p-sys]');
  const col = p.locator('#sysctl .swatch input[type=color]').first();
  await col.evaluate((i) => { i.value = '#00a3ff'; i.dispatchEvent(new Event('input', {bubbles: true})); });
  await p.waitForTimeout(1700);
  await p.goto(TOOL);
  await p.waitForSelector('#resume:not([hidden])');
  await p.click('#res-go');
  await p.waitForTimeout(1400);
  await p.click('#b-brief');
  const md = await p.inputValue('#b-txt');
  await p.click('#b-x');
  ok(/Justeringer på element/.test(md), 'briefen har element-justeringene');
  ok(/font-size:\s*61px/.test(md), 'den faktiske verdien er med');
  ok(/Endrede variabler/.test(md), 'briefen har variabel-endringene');
  await p.close();
}

/* ── 8 · a block element never lands inside a paragraph ── */
{
  console.log('\n8    innsetting havner ikke inni et avsnitt');
  const {p, F} = await open('fx-links.html');
  await p.keyboard.press('r');
  await F.locator('#p1 strong').click();
  await p.keyboard.press('l');
  await p.locator('#inschips .chip').filter({hasText: 'Boks'}).first().click();
  await p.waitForTimeout(300);
  ok(await F.locator('#p1 div').count() === 0, 'ingen div inni <p>');
  ok(await F.locator('#a > div').count() === 1, 'boksen ble søsken til avsnittet');
  /* and the export must re-parse to the same tree */
  await p.click('#b-brief');
  await p.click('#b-seg .chip[data-seg=html]');
  const html = await p.inputValue('#b-txt');
  const live = await F.locator('#a').evaluate((e) => e.children.length);
  const parsed = await p.evaluate((h) =>
    new DOMParser().parseFromString(h, 'text/html').querySelector('#a').children.length, html);
  ok(live === parsed, 'eksporten tolkes til samme tre (' + live + ' = ' + parsed + ')');
  await p.close();
}

/* ── 9 · reordering in the layers panel never reparents ── */
{
  console.log('\n9    omrokkering flytter ikke et lag inn i et annet');
  const {p, F} = await open('fx-many.html');
  await p.keyboard.press('l');
  await p.waitForTimeout(300);
  const rows = p.locator('#laytree .lay');
  /* expand #s5 so a nested row is on screen */
  const s5 = rows.filter({hasText: 'Seksjon 5'}).first();
  await s5.locator('.tw').click();
  await p.waitForTimeout(250);
  const nested = p.locator('#laytree .lay.nest').first();
  const before = await F.locator('body > section').count();
  await rows.filter({hasText: 'Seksjon 3'}).first().dragTo(nested);
  await p.waitForTimeout(350);
  ok(await F.locator('section section').count() === 0, 'ingen seksjon inni en seksjon');
  ok(await F.locator('body > section').count() === before, 'antallet toppnivå-seksjoner står');
  await p.close();
}

/* ── 10 · "remove hidden" means the ones you hid ── */
{
  console.log('\n10   «fjern skjulte» rører bare det du selv skjulte');
  const {p, F} = await open('fx-hidden.html');
  await p.keyboard.press('r');
  await F.locator('#live').click();
  await p.click('#tbar button[data-k=more]');
  await p.waitForTimeout(250);
  await p.locator('#elemctl .chip').filter({hasText: 'Skjul'}).first().click();
  await p.waitForTimeout(300);
  await p.click('#b-brief');
  await p.click('#b-seg .chip[data-seg=html]');
  await p.check('#b-hid-c');
  await p.waitForTimeout(200);
  const html = await p.inputValue('#b-txt');
  ok(!/id="live"/.test(html), 'elementet du skjulte er borte');
  ok(/id="modal"/.test(html), 'dialogen siden selv skjulte er beholdt');
  ok(/id="tab2"/.test(html), 'elementet skjult av en klasse er beholdt');
  await p.close();
}

/* ── 11 · the number on the pin is the number in the brief ── */
{
  console.log('\n11   nålnummer og briefnummer stemmer');
  const {p, F} = await open('fx-page.html');
  await p.keyboard.press('m');
  const add = async (sel, prio, txt) => {
    await F.locator(sel).first().click();
    await p.waitForSelector('#sheet.on');
    await p.click('#e-prio .chip[data-p="' + prio + '"]');
    await p.fill('#e-txt', txt);
    await p.click('#e-save');
    await p.waitForTimeout(150);
  };
  await add('#om h2', 'Kan', 'kan-en');
  await add('#kort h2', 'Må', 'maa-to');
  await add('footer', 'Bør', 'bor-tre');
  await p.click('#b-brief');
  const md = await p.inputValue('#b-txt');
  const first = /\*\*(\d+)\.[^—]*—/.exec(md);
  ok(/\*\*2\. ENDRE · Må\*\*/.test(md),
     'må-merknaden beholder nålnummeret sitt (2), ikke posisjonen i lista');
  ok(first && first[1] === '2', 'briefen starter på nål 2, som er den viktigste');
  await p.close();
}

/* ── 12 · a new file does not inherit the previous one's original ── */
{
  console.log('\n12   «nullstill alt» henter ikke fram forrige fil');
  const {p, F} = await open('fx-links.html');
  await p.setInputFiles('#file', fx('fx-tall.svg'));
  await p.waitForTimeout(700);
  await p.click('#b-reset');
  await p.waitForSelector('#menu.on');
  const items = await p.locator('#menu button').allInnerTexts();
  const idx = items.findIndex((t) => /Alt/.test(t));
  if (idx >= 0) await p.locator('#menu button').nth(idx).click();
  await p.waitForTimeout(700);
  ok(await p.locator('#img:not([hidden])').count() === 1, 'bildet er fortsatt det som vises');
  ok(await p.locator('#frame:not([hidden])').count() === 0, 'den gamle HTML-fila kom ikke tilbake');
  await p.close();
}

/* ── 13 · deleting a container ends the edit inside it ── */
{
  console.log('\n13   sletting av en beholder begraver ikke et tomt angre-steg');
  const {p, F} = await open('fx-links.html');
  await p.keyboard.press('r');
  await F.locator('#a p').first().click();
  await F.locator('#a p').first().dblclick();
  await p.keyboard.press('End');
  await p.keyboard.type('XX');
  await p.click('#tabs button[data-p=p-lay]');   // 'l' would type into the open edit
  await p.waitForTimeout(300);
  const row = p.locator('#laytree .lay').filter({hasText: 'Med lenke'}).first();
  await row.hover();
  await row.locator('.ax button.dg').click();
  await p.waitForTimeout(300);
  ok(await F.locator('#a').count() === 0, 'seksjonen ble slettet');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  ok(await F.locator('#a').count() === 1, 'første ⌘Z henter den tilbake');
  await p.close();
}

/* ── 14 · a hidden element is not a deleted one ── */
{
  console.log('\n14   en skjult nål sier ikke at elementet er slettet');
  const {p, F} = await open('fx-hidden.html');
  await p.keyboard.press('m');
  await F.locator('#live h2').click();
  await p.waitForSelector('#sheet.on');
  await p.fill('#e-txt', 'endre denne');
  await p.click('#e-save');
  await p.waitForTimeout(250);
  await p.keyboard.press('r');
  await F.locator('#live h2').click();
  await p.click('#tbar button[data-k=more]');
  await p.waitForTimeout(250);
  await p.locator('#elemctl .chip').filter({hasText: 'Skjul'}).first().click();
  await p.waitForTimeout(600);
  ok(await p.locator('#pins .pin.gone').count() === 0,
     'nålen er ikke merket som slettet');
  await p.click('#b-brief');
  ok(!/slettet/.test(await p.inputValue('#b-txt')), 'briefen sier ikke slettet');
  await p.close();
}

/* ── 15 · an emptied style attribute does not ship ── */
{
  console.log('\n15   tomme style-attributter blir ikke med i eksporten');
  const {p, F} = await open('fx-many.html');
  await p.keyboard.press('r');
  await F.locator('#s1 h2').click();
  await p.click('#elemctl .chip[data-sc=text]');
  const sl = p.locator('#p-elem .ctl input[type=range]').first();
  await sl.fill('30'); await sl.dispatchEvent('change');
  await p.waitForTimeout(250);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  await p.click('#b-brief');
  await p.click('#b-seg .chip[data-seg=html]');
  const html = await p.inputValue('#b-txt');
  ok(!/style=""/.test(html), 'ingen style="" i eksporten');
  await p.close();
}

/* ── 16 · Enter activates a focused button ── */
{
  console.log('\n16   Enter trykker knappen som har fokus');
  const {p, F} = await open('fx-links.html');
  await p.keyboard.press('r');
  await F.locator('#b h2').click();
  await p.waitForSelector('#tbar.on');
  const before = await F.locator('#b h2').count();
  await p.locator('#tbar button[data-k=dup]').focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ok(await F.locator('#b h2').count() === before + 1, 'Enter duplikerte i stedet for å starte skriving');
  await p.close();
}

await browser.close();
console.log('\n' + (fail ? 'FAIL' : 'ALL OK') + '  —  ' + pass + ' bestått, ' + fail + ' feilet');
process.exit(fail ? 1 : 0);
