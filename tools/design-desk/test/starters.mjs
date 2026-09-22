/* Checks each starter page twice: standalone (does it look right?) and loaded
   into the desk (do tokens, layers and editing actually work on it?).
   Usage: node tools/design-desk/test/starters.mjs [outDir] */
import {createRequire} from 'node:module';
import {mkdirSync, readdirSync} from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { ({chromium} = require(p)); break; } catch {}
}
if (!chromium) { console.error('playwright not found'); process.exit(2); }

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.argv[2] || '/tmp/dd-starters';
mkdirSync(OUT, {recursive: true});
const files = readdirSync(path.join(ROOT, 'starters')).filter((f) => f.endsWith('.html')).sort();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  ...(proxy ? {proxy: {server: proxy}} : {}),
  args: ['--ignore-certificate-errors'],
});
const NETWORK = /net::ERR_|fonts\.g|Failed to load resource/i;

for (const f of files) {
  const name = f.replace('.html', '');
  console.log('\n' + name);

  /* 1 — standalone */
  const p1 = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 2});
  const e1 = [];
  p1.on('pageerror', (e) => e1.push(e.message));
  await p1.goto('file://' + path.join(ROOT, 'starters', f));
  await p1.waitForTimeout(2200);
  await p1.screenshot({path: path.join(OUT, name + '-side.png'), fullPage: true});
  const hOverflow = await p1.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  ok(!hOverflow, 'ingen horisontal overflyt på 1440px');
  ok(e1.length === 0, 'ingen JS-feil' + (e1.length ? ' — ' + e1.join(' | ') : ''));
  ok(await p1.locator('script').count() === 0, 'ingen skript (ren eksport, trygg angre)');
  ok(await p1.locator('img[src^="http"], link[href*="//"]:not([href*="fonts.g"])').count() === 0,
     'ingen eksterne bilder — virker frakoblet og eksporteres helt');
  /* narrow width must survive too — the desk has a 390 preset */
  await p1.setViewportSize({width: 390, height: 900});
  await p1.waitForTimeout(400);
  const nOverflow = await p1.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  ok(!nOverflow, 'ingen horisontal overflyt på 390px');
  await p1.screenshot({path: path.join(OUT, name + '-390.png'), fullPage: true});
  await p1.close();

  /* 2 — loaded into the desk */
  const p2 = await browser.newPage({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 2});
  const e2 = [];
  p2.on('pageerror', (e) => e2.push(e.message));
  p2.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) e2.push(m.text()); });
  await p2.goto('file://' + path.join(ROOT, 'design-desk.html'));
  await p2.setInputFiles('#file', path.join(ROOT, 'starters', f));
  await p2.waitForSelector('#plate.on');
  await p2.waitForTimeout(1600);
  const F = p2.frameLocator('#frame');

  await p2.click('#tabs button[data-p=p-sys]');
  const tokens = await p2.locator('#sysctl .swatch, #sysctl .ctl').count();
  ok(tokens >= 6, 'System-fanen fant variablene (' + tokens + ')');

  await p2.keyboard.press('l');
  await p2.waitForTimeout(500);
  const rows = await p2.locator('#laytree .lay').count();
  ok(rows >= 6 && rows <= 40, 'lagtreet er lesbart, ikke overfylt (' + rows + ' rader)');
  const names = await p2.locator('#laytree .lay .nm').allInnerTexts();
  const longest = names.reduce((a, b) => (b.length > a.length ? b : a), '');
  ok(longest.length <= 66, 'ingen lagnavn renner over (lengste ' + longest.length + ' tegn)');
  ok((await p2.textContent('#laynow b')).trim() !== '—', 'seksjonsindikatoren vet hvor du er');

  /* edit something, then export and reopen it */
  await p2.keyboard.press('r');
  await F.locator('h1').first().click();
  await p2.waitForSelector('#tbar.on');
  await F.locator('h1').first().dblclick();
  await p2.waitForTimeout(200);
  await p2.keyboard.press('End');
  await p2.keyboard.type(' — endret');
  await F.locator('h2').first().click();
  await p2.waitForTimeout(250);
  /* innerText is the rendered text, so a text-transform:uppercase heading comes
     back shouting — compare case-insensitively. */
  ok((await F.locator('h1').first().innerText()).toLowerCase().includes('endret'),
     'teksten kan redigeres');
  await p2.screenshot({path: path.join(OUT, name + '-desk.png')});

  await p2.click('#b-brief');
  await p2.click('#b-seg .chip[data-seg=html]');
  const html = await p2.inputValue('#b-txt');
  ok(!/data-dd-id|contenteditable/.test(html), 'eksporten er ren');
  ok(html.includes('endret'), 'eksporten har med redigeringen');
  ok(e2.length === 0, 'ingen feil i desken' + (e2.length ? ' — ' + e2.join(' | ') : ''));
  await p2.close();
}

await browser.close();
console.log('\n' + (fail ? 'FAIL' : 'ALL OK') + '  —  ' + pass + ' bestått, ' + fail + ' feilet');
console.log('bilder i ' + OUT);
process.exit(fail ? 1 : 0);
