/* Visual check — renders the desk in a few states and writes PNGs.
   Usage: node tools/design-desk/test/shots.mjs [outDir]
   Routes the browser through the environment proxy so webfonts actually load. */
import {createRequire} from 'node:module';
import path from 'node:path';
import {mkdirSync} from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { ({chromium} = require(p)); break; } catch {}
}
if (!chromium) { console.error('playwright not found'); process.exit(2); }

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.argv[2] || '/tmp/dd-shots';
mkdirSync(OUT, {recursive: true});

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  ...(proxy ? {proxy: {server: proxy}} : {}),
  args: ['--ignore-certificate-errors'],
});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 2});
const shot = async (n) => { await page.screenshot({path: path.join(OUT, n + '.png')}); console.log(n); };

await page.goto('file://' + path.join(ROOT, 'design-desk.html'));
await page.waitForTimeout(1400);              // let the chrome webfonts land
await shot('01-drop');

await page.setInputFiles('#file', path.join(ROOT, 'test', 'fx-page.html'));
await page.waitForSelector('#plate.on');
await page.waitForTimeout(1200);
await shot('02-loaded');

const F = page.frameLocator('#frame');
await page.keyboard.press('r');
await F.locator('h1').first().click();
await page.waitForSelector('#tbar.on');
await page.waitForTimeout(400);
await shot('03-selected-toolbar');

await page.click('#tbar button[data-k=fam]');
await page.waitForSelector('#pop .fitem');
await page.waitForTimeout(2200);              // font previews load lazily
await shot('04-font-popover');

await page.keyboard.press('Escape');
await page.click('#tbar button[data-k=size]');
await page.waitForTimeout(400);
await shot('05-size-popover');

await page.keyboard.press('Escape');
await page.keyboard.press('l');
await page.waitForTimeout(400);
await shot('06-layers');

await F.locator('#kort h2').click({button: 'right'});
await page.waitForTimeout(300);
await shot('07-context-menu');

await page.keyboard.press('Escape');
await page.click('#tabs button[data-p=p-elem]');
await page.waitForTimeout(300);
await shot('08-rail-juster');

await page.click('#elemctl .ctl .chip');      // font family button opens the full picker
await page.waitForTimeout(2000);
await shot('09-font-rail');

await page.keyboard.press('Escape');
await page.keyboard.press('m');
await F.locator('#om p').click();
await page.fill('#e-txt', 'Denne teksten er for lang — kort den ned til én linje.');
await page.click('#e-save');
await page.waitForTimeout(400);
await shot('10-mark-pin');

await page.click('#b-brief');
await page.waitForTimeout(400);
await shot('11-brief');
await page.click('#b-seg .chip[data-seg=html]');
await page.waitForTimeout(300);
await shot('12-export-html');

await browser.close();
console.log('\nwrote to ' + OUT);
