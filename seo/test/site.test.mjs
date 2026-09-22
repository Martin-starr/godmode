import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRedirect, orgSchema, sourceLinks, spellingVariants, termCoverage } from "../steps/03b-site.mjs";
import { siteConfig } from "../lib/context.mjs";

test("spellingVariants flags wrong casing, ignores canonical, caps, URLs and e-mail", () => {
  const text = "Verminord AS · VermiNord på Jæren · VERMINORD · Vermi Nord · Vermi-Nord · post@verminord.no · www.verminord.no · verminord.com · se verminord.no/blogg/vermikompost-i-norge · VermiNord.";
  assert.deepEqual(spellingVariants(text), [
    { variant: "VermiNord", count: 2 },
    { variant: "Vermi Nord", count: 1 },
    { variant: "Vermi-Nord", count: 1 },
  ]);
  assert.deepEqual(spellingVariants("Verminord lager VermiCast."), []);
  assert.deepEqual(spellingVariants("skrevet verminord i teksten"), [{ variant: "verminord", count: 1 }]);
});

test("termCoverage keeps markkompost apart from meitemarkkompost", () => {
  assert.deepEqual(
    termCoverage("Vermikompost, også kalt meitemarkkompost eller markkompost. Mark-kompost er samme ting. Vermikomposten er moden."),
    { vermikompost: 2, meitemarkkompost: 1, markkompost: 2 },
  );
  assert.deepEqual(termCoverage("Bare meitemarkkompost her."), { vermikompost: 0, meitemarkkompost: 1, markkompost: 0 });
});

test("orgSchema finds the Organization node, also inside @graph", () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},{"@type":["Organization","LocalBusiness"],"name":"Verminord AS","sameAs":["https://w2.brreg.no/x","https://www.instagram.com/verminord"]}]}</script>`;
  assert.deepEqual(orgSchema(html), { found: true, name: "Verminord AS", same_as: 2 });
  assert.deepEqual(orgSchema("<p>ingen schema</p>"), { found: false, name: null, same_as: 0 });
  assert.deepEqual(orgSchema(`<script type="application/ld+json">{ broken</script>`), { found: false, name: null, same_as: 0 });
});

test("sourceLinks counts links to trusted sources per domain", () => {
  const html = `<a href="https://www.nibio.no/tema/jord">NIBIO</a> <a href="https://norsok.no/a">NORSØK</a> <a href='https://doi.org/10.1007/s13593-019-0579-x'>Blouin</a> <a href="/intern">intern</a> <a href="https://www.nibio.no/b">igjen</a> <a href="https://example.com">x</a>`;
  assert.deepEqual(sourceLinks(html, "https://www.verminord.no/blogg/vermikompost-i-norge"), { "nibio.no": 2, "norsok.no": 1, "doi.org": 1 });
});

test("classifyRedirect: permanent, temporary, none, broken", () => {
  const home = "www.verminord.no";
  assert.equal(classifyRedirect([
    { url: "https://verminord.com/", status: 301 },
    { url: "https://www.verminord.com/", status: 308 },
    { url: "https://www.verminord.no/", status: 200 },
  ], home), "permanent");
  assert.equal(classifyRedirect([{ url: "https://verminord.com/", status: 302 }, { url: "https://verminord.no/", status: 200 }], home), "midlertidig");
  assert.equal(classifyRedirect([{ url: "https://verminord.com/", status: 200 }], home), "ingen");
  assert.equal(classifyRedirect([{ url: "https://verminord.com/", status: null, error: "timeout" }], home), "feil");
  assert.equal(classifyRedirect([{ url: "https://verminord.com/", status: 301 }, { url: "https://parked.example/", status: 200 }], home), "feil");
  assert.equal(classifyRedirect([], home), "feil");
});

test("siteConfig defaults to verminord.no and reads overrides", () => {
  const d = siteConfig({});
  assert.equal(d.home, "https://www.verminord.no/");
  assert.equal(d.pillar, "https://www.verminord.no/blogg/vermikompost-i-norge");
  assert.deepEqual(d.oldHosts, ["verminord.com", "www.verminord.com"]);
  const o = siteConfig({ SEO_PILLAR_URL: "https://www.verminord.no/guide", SEO_OLD_HOSTS: "a.no, b.no", SEO_HOME_URL: "" });
  assert.equal(o.pillar, "https://www.verminord.no/guide");
  assert.deepEqual(o.oldHosts, ["a.no", "b.no"]);
  assert.equal(o.home, "https://www.verminord.no/");
});
