import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectMentions, detectStock, domainOf, fingerprint, numberFromNorwegian, parsePriceNok, extractUrls } from "../lib/text.mjs";
import { readProductPage, isPostUrl } from "../steps/05-competitors.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFile(join(here, "..", "fixtures", name), "utf8");

test("numberFromNorwegian handles the separators Norwegian shops use", () => {
  assert.equal(numberFromNorwegian("1 299"), 1299);
  assert.equal(numberFromNorwegian("1.299"), 1299);
  assert.equal(numberFromNorwegian("249,00"), 249);
  assert.equal(numberFromNorwegian("249.00"), 249);
  assert.equal(numberFromNorwegian("389"), 389);
  assert.equal(numberFromNorwegian("219,50"), 219.5);
});

test("parsePriceNok finds a price and ignores phone numbers", () => {
  assert.equal(parsePriceNok("Pris: kr 249,00 inkl. mva"), 249);
  assert.equal(parsePriceNok("Biohumus Terra 5 L 219 kr"), 219);
  assert.equal(parsePriceNok("389,- per sekk"), 389);
  assert.equal(parsePriceNok("Ring oss på tlf 51 42 00 00"), null);
  assert.equal(parsePriceNok("Frakt fra 5 kr"), null, "below the plausible floor");
});

test("detectStock: structured data wins, then text, never a guess", () => {
  assert.equal(detectStock({ text: "Utsolgt", availability: "http://schema.org/InStock" }), true);
  assert.equal(detectStock({ text: "Legg i handlekurv", availability: "https://schema.org/OutOfStock" }), false);
  assert.equal(detectStock({ text: "Dette produktet er utsolgt for sesongen" }), false);
  assert.equal(detectStock({ text: "På lager. Legg i handlekurv" }), true);
  assert.equal(detectStock({ text: "Legg i handlekurv", buttonDisabled: true }), false);
  assert.equal(detectStock({ text: "Vermikompost er gjødsel laget av meitemark." }), null);
});

test("readProductPage: Shopify page with JSON-LD", async () => {
  const r = readProductPage(await fixture("shop-shopify.html"), "https://dinkjokkenhage.no/products/biohumus-terra-5l");
  assert.equal(r.price_nok, 239);
  assert.equal(r.in_stock, true);
  assert.match(r.title, /Biohumus/);
});

test("readProductPage: WooCommerce page marked utsolgt", async () => {
  const r = readProductPage(await fixture("shop-woo-utsolgt.html"), "https://spiselighage.no/product/vermikompost-5l/");
  assert.equal(r.price_nok, 249);
  assert.equal(r.in_stock, false);
  assert.equal(r.stock_text, "Utsolgt");
});

test("readProductPage: Wix page without a price stays honest", async () => {
  const r = readProductPage(await fixture("shop-wix-noprice.html"), "https://www.revekompost.no/nettbutikk");
  assert.equal(r.price_nok, null);
  assert.equal(r.in_stock, true, "an add-to-cart button and no out-of-stock text");
});

test("fingerprint identifies the platform and the trackers", async () => {
  assert.equal(fingerprint(await fixture("shop-shopify.html")).platform, "Shopify");
  assert.equal(fingerprint(await fixture("shop-shopify.html")).signals.ga4, true);
  const woo = fingerprint(await fixture("shop-woo-utsolgt.html"));
  assert.equal(woo.platform, "WooCommerce");
  assert.equal(woo.signals.meta_pixel, true);
  assert.equal(fingerprint(await fixture("shop-wix-noprice.html")).platform, "Wix");
});

test("detectMentions: Verminord in text, in a URL only, and absent", () => {
  const vendors = ["Grønn Vekst", "Nelson Garden", "Mark og Grøde"];
  const a = detectMentions("De mest kjente er Grønn Vekst og Verminord. Nelson Garden selger Biohumus.", vendors);
  assert.equal(a.mentioned, true);
  assert.equal(a.mention_rank, 2);
  assert.deepEqual(a.competitors_mentioned, ["Grønn Vekst", "Nelson Garden"]);

  const b = detectMentions("Se https://www.verminord.com/ for norsk produksjon.", vendors);
  assert.equal(b.mentioned, true, "a URL is still a mention");
  assert.equal(b.mention_rank, 1);

  const c = detectMentions("Du kan kjøpe vermikompost hos Grønn Vekst eller Mark og Grøde.", vendors);
  assert.equal(c.mentioned, false);
  assert.equal(c.mention_rank, null);
  assert.deepEqual(c.competitors_mentioned, ["Grønn Vekst", "Mark og Grøde"]);
});

test("domainOf and extractUrls", () => {
  assert.equal(domainOf("https://www.gronnvekst.no/gjodsel/vermikompost"), "gronnvekst.no");
  assert.equal(domainOf("not a url"), null);
  assert.deepEqual(extractUrls("Se https://verminord.com/ og https://nibio.no/x). Slutt."), ["https://verminord.com/", "https://nibio.no/x"]);
});

test("isPostUrl recognises blog posts and skips listing pages", () => {
  assert.equal(isPostUrl("https://x.no/blogg/slik-bruker-du-vermikompost", []), true);
  assert.equal(isPostUrl("https://x.no/blogg/", []), false);
  assert.equal(isPostUrl("https://x.no/blogg/category/tips/", []), false);
  assert.equal(isPostUrl("https://x.no/artikler/2026/mark-i-hagen", ["https://x.no/artikler/"]), true);
  assert.equal(isPostUrl("https://x.no/produkt/vermikompost-5l", []), false);
});
