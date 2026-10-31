import test from "node:test";
import assert from "node:assert/strict";
import { parseLoggerExport, cellTemp, screenReadings, holdRuns, evaluate, dayStats, FAULT, R_FAULT } from "../lib/hygiene.js";

const MIN = 60000;
const T0 = Date.UTC(2026, 8, 26, 10, 0, 48);
// n minutes of readings per channel from f(minute, ch) → temp | undefined | "F" (logger fault).
function series(n, chs, f) {
  const out = [];
  for (let m = 0; m < n; m++) for (const ch of chs) {
    const t = f(m, ch);
    if (t === "F") out.push({ ts: T0 + m * MIN, ch, temp: null, excluded: R_FAULT });
    else if (t !== undefined) out.push({ ts: T0 + m * MIN, ch, temp: t });
  }
  return out;
}
const pad = (n) => String(n).padStart(2, "0");
// A Center 374-style export, 1 line a minute from 26.09.2026 12:00:48 Oslo.
function file(n, cols, opts = {}) {
  const head = opts.head ?? "No.\tDate\tTime\t" + cols.map((_, i) => "T" + (i + 1)).join("\t");
  const out = opts.pre ? [...opts.pre] : [];
  if (head) out.push(head);
  for (let m = 0; m < n; m++) {
    const h = 12 + Math.floor(m / 60);
    out.push([m + 1, "26.09.2026", pad(h) + ":" + pad(m % 60) + ":48", ...cols.map((c) => c(m))].join("\t"));
  }
  return out.join("\n");
}

test("cellTemp: placeholders are not numbers, decimal comma reads", () => {
  assert.equal(cellTemp("----"), null);
  assert.equal(cellTemp("OL"), null);
  assert.equal(cellTemp(""), null);
  assert.equal(cellTemp("55,3"), 55.3);
  assert.equal(cellTemp("55.3 °C"), 55.3);
  assert.equal(cellTemp("-2.1"), -2.1);
});

test("parse: an unreadable cell is a fault on its own channel; unconnected T4 is dropped", () => {
  const txt = [
    "No.\tDate\tTime\tT1\tT2\tT3\tT4",
    "1\t26.09.2026\t21:49:48\t29.5\t40.2\t56.9\t----",
    "2\t26.09.2026\t21:50:48\t----\t40.4\t56.8\t----",
  ].join("\n");
  const { points, channels } = parseLoggerExport(txt);
  assert.deepEqual(channels, [1, 2, 3]);
  assert.deepEqual(points[1].temps, [FAULT, 40.4, 56.8]);
});

test("parse: no header, row number is not a channel, position decides the channel", () => {
  const txt = ["x", "7;26.09.2026 12:00:00;55,1;56,2", "8;26.09.2026 12:01:00;;56,4"].join("\n");
  const { points, channels } = parseLoggerExport(txt);
  assert.deepEqual(channels, [1, 2]);
  assert.deepEqual(points[0].temps, [55.1, 56.2]);
  assert.deepEqual(points[1].temps, [FAULT, 56.4]);
});

test("parse: no header, a probe unreadable for the first hour keeps its number", () => {
  const txt = file(120, [(m) => (m < 70 ? "----" : "55.0"), () => "56.0", () => "57.0"], { head: "" });
  const { channels, points } = parseLoggerExport(txt);
  assert.deepEqual(channels, [1, 2, 3]);
  assert.deepEqual(points[0].temps, [FAULT, 56, 57]);
});

test("parse: a preamble line with a date does not hide the header", () => {
  const txt = file(30, [() => "50", () => "51", () => "52"], { pre: ["Center 374", "Start:\t26.09.2026\t12:00:00"] });
  const { channels, points } = parseLoggerExport(txt);
  assert.deepEqual(channels, [1, 2, 3]);
  assert.deepEqual(points[0].temps, [50, 51, 52]);
  assert.equal(points.length, 30);
});

test("parse: a header without the row-number column is lined up by its date column", () => {
  const txt = file(5, [() => "50", () => "51", () => "52"], { head: "Date\tTime\tT1\tT2\tT3" });
  assert.deepEqual(parseLoggerExport(txt).points[0].temps, [50, 51, 52]);
});

test("parse: a header that does not line up with the data is refused", () => {
  const txt = file(5, [() => "50", () => "51", () => "52"], { head: "T1\tT2\tT3" });
  assert.throws(() => parseLoggerExport(txt), /passer ikke/);
  const extra = file(5, [() => "50", () => "51", () => "52"], { head: "No.\tDate\tTime\tT1\tT2" });
  assert.throws(() => parseLoggerExport(extra), /passer ikke/);
});

test("parse: semicolon file with decimal commas is not read as comma-separated", () => {
  const txt = ["Dato;Tid;T1;T2", "26.09.2026;12:00:00;55,1;56,2", "26.09.2026;12:01:00;55,2;56,3"].join("\n");
  assert.deepEqual(parseLoggerExport(txt).points[1].temps, [55.2, 56.3]);
});

test("parse: logger clock is Oslo time (CEST = UTC+2 in September)", () => {
  const { points } = parseLoggerExport("Date\tTime\tT1\n26.09.2026\t21:49:48\t50\n26.09.2026\t21:50:48\t50");
  assert.equal(new Date(points[0].ts).toISOString(), "2026-09-26T19:49:48.000Z");
});

test("parse: the repeated hour when summer time ends is kept apart", () => {
  const rows = ["Date\tTime\tT1\tT2"];
  for (const h of [1, 2, 2, 3]) for (let m = 0; m < 60; m += 30) rows.push("25.10.2026\t0" + h + ":" + pad(m) + ":00\t60\t61");
  const ts = parseLoggerExport(rows.join("\n")).points.map((p) => new Date(p.ts).toISOString().slice(11, 16));
  assert.deepEqual(ts, ["23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00", "02:30"]);
});

test("parse: US dates, AM/PM, impossible dates and backwards time are refused", () => {
  assert.throws(() => parseLoggerExport("Date\tT1\n10/30/2026 12:00\t50\n10/30/2026 12:01\t50"), /amerikansk/);
  assert.throws(() => parseLoggerExport("Date\tT1\n30.10.2026 1:00 PM\t50\n30.10.2026 1:01 PM\t50"), /AM\/PM/);
  assert.throws(() => parseLoggerExport("Date\tT1\n32.13.2026 12:00\t50\n01.01.2026 12:00\t50"), /Ugyldig dato/);
  assert.throws(() => parseLoggerExport("Date\tT1\n30.10.2026 12:01\t50\n30.10.2026 12:00\t50"), /baklengs/);
});

test("screen: impossible values and spikes are set aside, with their neighbours", () => {
  const s = screenReadings(series(60, [1], (m) => (m === 30 ? 148.6 : m === 45 ? 61 : 53)));
  const at = (m) => s.find((r) => r.ts === T0 + m * MIN).reason;
  assert.equal(at(30), "umulig verdi");
  assert.equal(at(45), "sprang");
  assert.equal(at(25), "ustabil sonde");
  assert.equal(at(5), null);
  assert.equal(at(59), null);
});

test("one faulty probe at 86–144 °C beside two at 53 °C is never godkjent", () => {
  const v = evaluate(series(180, [1, 2, 3], (m, ch) => (ch === 1 ? 86 + (m % 60) : 53)), 70, 60);
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

test("a probe flickering to OL / ---- never passes", () => {
  const v = evaluate(series(120, [1, 2, 3], (m, ch) => (ch === 1 && m % 2 ? "F" : 72)), 70, 60);
  assert.equal(v.pass, false);
  assert.ok(v.spans.some((sp) => sp.ch === 1));
});

test("a probe that jumps to a steady wrong level stays set aside", () => {
  // ch1 truly hot; ch2 jumps from 53 to 80 and stays there.
  const v = evaluate(series(180, [1, 2], (m, ch) => (ch === 1 ? 72 : m < 30 ? 53 : 80)), 70, 60);
  assert.equal(v.pass, false);
  // The report case: 72 h, ch3 jumps 53 → 78.
  const r = series(4400, [1, 2, 3], (m, ch) => (ch === 1 ? 56 : ch === 2 ? 53 : m < 30 ? 53 : 78));
  assert.equal(holdRuns(screenReadings(r), 55, 2).filter((x) => x.minutes >= 4320).length, 0);
});

test("a probe that drops and comes back to its level is trusted again", () => {
  const v = evaluate(series(200, [1, 2], (m, ch) => (ch === 2 && m >= 20 && m < 22 ? 40 : 72)), 70, 60);
  assert.equal(v.pass, true);
});

test("a cold third probe blocks godkjent", () => {
  const v = evaluate(series(120, [1, 2, 3], (m, ch) => (ch === 3 ? 50 : 72)), 70, 60);
  assert.equal(v.pass, false);
  assert.equal(holdRuns(screenReadings(series(120, [1, 2, 3], (m, ch) => (ch === 3 ? 50 : 72))), 70, 2, { requireAll: false })[0].minutes, 119);
});

test("a hole in the log breaks the run; a missing line of a minute or two does not", () => {
  const rows = series(120, [1, 2], (m) => (m >= 40 && m < 50 ? undefined : 72));
  const runs = holdRuns(screenReadings(rows), 70, 2);
  assert.equal(runs.length, 2);
  assert.equal(evaluate(rows, 70, 75).pass, false);
  const short = series(120, [1, 2], (m, ch) => (ch === 1 && m === 60 ? undefined : 72));
  assert.equal(holdRuns(screenReadings(short), 70, 2)[0].minutes, 119);
});

test("dayStats counts only valid readings", () => {
  const [d] = dayStats(screenReadings(series(60, [1, 2], (m, ch) => (ch === 1 ? 140 : 50))), 55);
  assert.equal(d.points_hot, 0);
  assert.equal(d.max_temp, 50);
  assert.equal(d.rejected, 60);
});
