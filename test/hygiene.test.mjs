import test from "node:test";
import assert from "node:assert/strict";
import { parseLoggerExport, cellTemp, screenReadings, holdRuns, evaluate, dayStats } from "../lib/hygiene.js";

const MIN = 60000;
const T0 = Date.UTC(2026, 8, 26, 10, 0);
// n minutes of readings per channel from a function (minute, ch) → temp | undefined.
function series(n, chs, f) {
  const out = [];
  for (let m = 0; m < n; m++) for (const ch of chs) {
    const t = f(m, ch);
    if (t !== undefined) out.push({ ts: T0 + m * MIN, ch, temp: t });
  }
  return out;
}

test("cellTemp: placeholders are holes, decimal comma reads", () => {
  assert.equal(cellTemp("----"), null);
  assert.equal(cellTemp("OL"), null);
  assert.equal(cellTemp(""), null);
  assert.equal(cellTemp("55,3"), 55.3);
  assert.equal(cellTemp("55.3 °C"), 55.3);
  assert.equal(cellTemp("-2.1"), -2.1);
});

test("parse: unreadable cell keeps channels in place", () => {
  const txt = [
    "No.\tDate\tTime\tT1\tT2\tT3\tT4",
    "1\t26.09.2026\t21:49:48\t29.5\t40.2\t56.9\t----",
    "2\t26.09.2026\t21:50:48\t----\t40.4\t56.8\t----",
  ].join("\n");
  const { points, channels } = parseLoggerExport(txt);
  assert.deepEqual(channels, [1, 2, 3, 4]);
  assert.deepEqual(points[1].temps, [null, 40.4, 56.8, null]);
});

test("parse: no header, row number is not a channel", () => {
  const txt = ["x", "7;26.09.2026 12:00:00;55,1;56,2", "8;26.09.2026 12:01:00;;56,4"].join("\n");
  const { points, channels } = parseLoggerExport(txt);
  assert.deepEqual(channels, [1, 2]);
  assert.deepEqual(points[0].temps, [55.1, 56.2]);
  assert.deepEqual(points[1].temps, [null, 56.4]);
});

test("parse: logger clock is Oslo time (CEST = UTC+2 in September)", () => {
  const { points } = parseLoggerExport("Date\tTime\tT1\n26.09.2026\t21:49:48\t50\n26.09.2026\t21:50:48\t50");
  assert.equal(new Date(points[0].ts).toISOString(), "2026-09-26T19:49:48.000Z");
});

test("screen: impossible values and spikes are set aside, with their neighbours", () => {
  const rows = series(60, [1], (m) => (m === 30 ? 148.6 : m === 45 ? 61 : 53));
  const s = screenReadings(rows);
  const at = (m) => s.find((r) => r.ts === T0 + m * MIN).reason;
  assert.equal(at(30), "umulig verdi");
  assert.equal(at(45), "sprang");
  assert.equal(at(25), "ustabil sonde");
  assert.equal(at(5), null);
});

test("one faulty probe at 86–144 °C beside two at 53 °C is never godkjent", () => {
  const rows = series(180, [1, 2, 3], (m, ch) => (ch === 1 ? 86 + (m % 60) : 53));
  const v = evaluate(rows, 70, 60);
  assert.equal(v.pass, false);
  assert.equal(v.together.minutes, 0);
});

test("one healthy probe alone at 72 °C is never godkjent", () => {
  const v = evaluate(series(180, [1], () => 72), 70, 60);
  assert.equal(v.channels[0].pass, true);
  assert.equal(v.pass, false);
});

test("two probes holding 72 °C for 90 min is godkjent", () => {
  const v = evaluate(series(91, [1, 2], (m) => 72 + (m % 2) * 0.2), 70, 60);
  assert.equal(v.pass, true);
  assert.equal(v.together.minutes, 90);
});

test("a hole in the log breaks the run", () => {
  const rows = series(120, [1, 2], (m) => (m >= 40 && m < 50 ? undefined : 72));
  const runs = holdRuns(screenReadings(rows), 70, 2);
  assert.equal(runs.length, 2);
  assert.equal(Math.max(...runs.map((r) => r.minutes)), 69);
  assert.equal(evaluate(rows, 70, 60).pass, true);
  assert.equal(evaluate(rows, 70, 75).pass, false);
});

test("stored exclusion is respected", () => {
  const rows = series(90, [1, 2], () => 72).map((r) => (r.ts === T0 + 45 * MIN && r.ch === 1 ? { ...r, excluded: "usikker" } : r));
  const s = screenReadings(rows);
  assert.equal(s.filter((r) => r.reason).length, 1);
  // One probe set aside for a minute still leaves only one probe hot then.
  assert.equal(holdRuns(s, 70, 2).length, 2);
});

test("dayStats counts only valid readings", () => {
  const rows = series(60, [1, 2], (m, ch) => (ch === 1 ? 140 : 50));
  const [d] = dayStats(screenReadings(rows), 55);
  assert.equal(d.points_hot, 0);
  assert.equal(d.max_temp, 50);
  assert.equal(d.rejected, 60);
});
