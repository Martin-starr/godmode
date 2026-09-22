import { test } from "node:test";
import assert from "node:assert/strict";
import { ctrAt, findDecay, findMovers, isQuestion, monthlyReviewDue, questionQueries, scoreOpportunities, termReview, upcomingCalendar } from "../steps/11-analyze.mjs";

test("ctrAt is monotone and blunt", () => {
  assert.ok(ctrAt(1) > ctrAt(3));
  assert.ok(ctrAt(5) > ctrAt(8));
  assert.ok(ctrAt(10) > ctrAt(15));
  assert.equal(ctrAt(6), ctrAt(10));
});

test("scoreOpportunities keeps 8–20 with impressions, ranks by gain per position", () => {
  const rows = [
    { query: "vermikompost", position: 11, impressions28: 400, clicks28: 6, page: "/" },
    { query: "kompost til chili", position: 9, impressions28: 120, clicks28: 3, page: "/chili" },
    { query: "meitemark", position: 3, impressions28: 900, clicks28: 100, page: "/" },      // already top 5
    { query: "ormekompost", position: 14, impressions28: 12, clicks28: 0, page: null },     // too few impressions
    { query: "jordforbedring", position: 25, impressions28: 500, clicks28: 2, page: "/" },  // outside 20
  ];
  const out = scoreOpportunities(rows);
  assert.deepEqual(out.map((o) => o.query), ["vermikompost", "kompost til chili"]);
  assert.ok(out[0].score > out[1].score);
});

test("findMovers flags click swings and position jumps only", () => {
  const thisW = [
    { query: "a", clicks: 10, impressions: 100, position: 4 },
    { query: "b", clicks: 1, impressions: 50, position: 12 },
    { query: "c", clicks: 2, impressions: 30, position: 6 },
    { query: "d", clicks: 0, impressions: 5, position: 30 },
  ];
  const prevW = [
    { query: "a", clicks: 5, impressions: 90, position: 6 },
    { query: "b", clicks: 1, impressions: 45, position: 9 },
    { query: "c", clicks: 2, impressions: 30, position: 6.5 },
    { query: "d", clicks: 0, impressions: 4, position: 35 },
  ];
  const m = findMovers(thisW, prevW);
  const q = m.map((x) => x.query);
  assert.ok(q.includes("a"), "clicks doubled");
  assert.ok(q.includes("b"), "position moved 3 places with 50 impressions");
  assert.ok(!q.includes("c"), "nothing changed");
  assert.ok(!q.includes("d"), "too small to matter");
  assert.equal(m[0].query, "a", "largest absolute click change first");
});

test("findDecay needs a real average and a real drop", () => {
  const weekly = {
    "/a": { history: [20, 22, 18, 21, 19, 20, 22, 20], now: 9 },   // decay
    "/b": { history: [20, 22, 18, 21, 19, 20, 22, 20], now: 18 },  // fine
    "/c": { history: [2, 3, 2, 2, 3, 2, 2, 3], now: 0 },            // too small to call
    "/d": { history: [30, 31], now: 5 },                             // not enough history
  };
  const d = findDecay(weekly);
  assert.deepEqual(d.map((x) => x.page), ["/a"]);
  assert.equal(d[0].drop_pct, 56);
});

test("upcomingCalendar shifts recurring rows into the horizon and drops the rest", () => {
  const rows = [
    { title: "Vår-stell", kind: "sesong", starts_on: "2026-03-01", ends_on: "2026-04-30", recurring_yearly: true },
    { title: "Høst-tilbakeføring", kind: "sesong", starts_on: "2026-09-01", ends_on: "2026-10-31", recurring_yearly: true },
    { title: "Dyrsku'n", kind: "hendelse", starts_on: "2026-09-11", ends_on: "2026-09-13", recurring_yearly: true },
    { title: "Engangs", kind: "frist", starts_on: "2025-09-20", ends_on: null, recurring_yearly: false },
  ];
  const out = upcomingCalendar(rows, "2027-09-07", 42);
  assert.deepEqual(out.map((o) => o.title), ["Høst-tilbakeføring", "Dyrsku'n"]);
  assert.equal(out[1].starts_on, "2027-09-11", "shifted to the horizon's year");
});

test("isQuestion catches Norwegian and English question queries", () => {
  assert.ok(isQuestion("hva er vermikompost"));
  assert.ok(isQuestion("Hvordan bruke vermikompost i drivhus"));
  assert.ok(isQuestion("kan man bruke meitemarkkompost på plen"));
  assert.ok(isQuestion("vermikompost til chili?"));
  assert.ok(isQuestion("how to use worm castings"));
  assert.ok(!isQuestion("vermikompost"));
  assert.ok(!isQuestion("vermikompost kjøp"));
  assert.ok(!isQuestion("hvaler kompost"));          // «hva» must be a whole word
  assert.ok(!isQuestion("erter i drivhus"));
});

test("questionQueries keeps questions with impressions, most seen first", () => {
  const out = questionQueries([
    { query: "vermikompost", impressions: 900, clicks: 20, position: 11.24 },
    { query: "hva er markkompost", impressions: 40, clicks: 1, position: 14.26, page: "/" },
    { query: "hvordan bruke vermikompost", impressions: 120, clicks: 3, position: 9 },
    { query: "hva er meitemarkkompost", impressions: 0, clicks: 0, position: null },
  ]);
  assert.deepEqual(out.map((q) => q.query), ["hvordan bruke vermikompost", "hva er markkompost"]);
  assert.equal(out[1].position, 14.3);
  assert.equal(out[1].page, "/");
});

test("monthlyReviewDue is true only in the first seven days of a month", () => {
  assert.equal(monthlyReviewDue(new Date("2026-10-05T00:00:00Z")), true);
  assert.equal(monthlyReviewDue(new Date("2026-10-07T00:00:00Z")), true);
  assert.equal(monthlyReviewDue(new Date("2026-10-12T00:00:00Z")), false);
});

test("termReview counts mentions, own citations and who is cited instead", () => {
  const rows = [
    { prompt: "Hva er vermikompost?", engine: "openai", mentioned: false, citations: [{ url: "https://www.nibio.no/tema/jord/kompost" }, { url: "https://snl.no/kompost" }] },
    { prompt: "Hva er vermikompost?", engine: "gemini", mentioned: true, citations: [{ url: "https://www.verminord.no/blogg/vermikompost-i-norge" }, { url: "https://www.nibio.no/x" }] },
    { prompt: "Hva er markkompost?", engine: "openai", mentioned: false, citations: JSON.stringify([{ url: "https://permakultur.no/a" }]) },
    { prompt: "Hva er markkompost?", engine: "openai", mentioned: false, citations: null },
  ];
  const out = termReview(rows, new Set(["https://www.verminord.no", "verminord.com"]));
  const v = out.find((t) => t.prompt === "Hva er vermikompost?");
  assert.equal(v.asked, 2);
  assert.equal(v.mentioned, 1);
  assert.equal(v.own_cited, 1);
  assert.deepEqual(v.engines.gemini, { asked: 1, mentioned: 1, own_cited: 1 });
  assert.deepEqual(v.top_cited, [{ domain: "nibio.no", count: 2 }, { domain: "snl.no", count: 1 }]);
  const m = out.find((t) => t.prompt === "Hva er markkompost?");
  assert.equal(m.asked, 2);
  assert.equal(m.own_cited, 0);
  assert.deepEqual(m.top_cited, [{ domain: "permakultur.no", count: 1 }]);
});
