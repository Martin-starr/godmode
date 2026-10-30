// Parser for temperature-logger exports (Center 374, 4 channels) plus the
// §19 checks shared by the Hygienisering page and the monthly
// documentation report (/api/compliance/gaps). Both must give the same
// answer, so the rules live here and nowhere else.
import { osloToUtc, isoDateOslo } from "./time.js";

// ---- Plausibility -----------------------------------------------------------
// A compost core does not go above ~80 °C or below freezing, and a mass of
// that size does not move 3 °C in a minute. Readings that do are a probe out
// of the mass, a loose plug or a dying cable — never a hygienisation. The
// 26 Sep 2026 import had one probe at 86–148 °C while the other two sat at
// 53 °C; under the old rules that single probe was enough to call the day
// godkjent.
export const PLAUSIBLE_MIN = 0;
export const PLAUSIBLE_MAX = 85;
export const MAX_STEP = 3; // °C away from the local median of its neighbours
const MEDIAN_HALF = 5; // neighbours on each side for the median
// A probe that just produced an impossible value is not trusted again until
// it has behaved for this long: the readings either side of a spike are the
// same loose contact, only less obvious.
const QUARANTINE_MIN = 10;
// The logger writes one line a minute. A hole longer than this breaks a run:
// nothing documents what the mass did in between.
export const MAX_GAP_MIN = 5;
// One probe is an anecdote, not a record.
export const MIN_PROBES = 2;

const MIN = 60000;

// ---- Import -----------------------------------------------------------------

// Accepts CSV/TSV/semicolon text. Finds the timestamp and up to four
// temperature COLUMNS — by position, so an unreadable value on one channel
// leaves a hole on that channel instead of sliding the next channel's value
// into its place.
//
// The logger's clock is the PC's local time (Europe/Oslo), so timestamps are
// read as Oslo wall-clock time, not UTC.
//
// Returns { points: [{ ts, temps: [t1, t2, t3, t4 | null…] }], channels: [1, 2, …] }.
export function parseLoggerExport(text) {
  const lines = String(text).replace(/^﻿/, "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Fant ingen datalinjer i filen.");

  const delims = ["\t", ";", ","];
  const sample = lines.slice(0, 20).join("\n");
  const delim = delims.map((d) => [d, (sample.match(new RegExp("\\" + d, "g")) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0];

  const rows = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, "")));

  const layout = columnLayout(rows);
  if (!layout) throw new Error("Klarte ikke å tolke filen — eksporter som CSV fra Center 374-programmet.");

  const points = [];
  for (const cells of rows) {
    const t = findTimestamp(cells);
    if (!t) continue;
    const temps = layout.cols.map((i) => cellTemp(cells[i]));
    if (temps.every((v) => v === null)) continue;
    points.push({ ts: t.ts, temps });
  }
  if (!points.length) throw new Error("Klarte ikke å tolke filen — eksporter som CSV fra Center 374-programmet.");
  points.sort((a, b) => a.ts - b.ts);
  return { points, channels: layout.channels };
}

// "dd.mm.yyyy hh:mm[:ss]" or "yyyy-mm-dd hh:mm[:ss]" — date and time may live
// in one cell or in two adjacent cells. Returns { ts, last } where last is the
// index of the last cell the timestamp used.
export function findTimestamp(cells) {
  for (let i = 0; i < cells.length; i++) {
    const tries = [[cells[i], i], [cells[i] + " " + (cells[i + 1] || ""), i + 1]];
    for (const [s, last] of tries) {
      let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (m) return { ts: osloToUtc(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] || 0)).getTime(), last };
      m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (m) return { ts: osloToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)).getTime(), last };
    }
  }
  return null;
}

// A temperature cell: a number with optional unit, decimal comma allowed.
// "----", "OL", "Err", "" and anything else unreadable → null (a hole).
export function cellTemp(s) {
  const c = String(s ?? "").trim().replace(/\s*°?\s*[CF]$/i, "");
  if (!/^-?\d+(?:[.,]\d+)?$/.test(c)) return null;
  const n = Number(c.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Which cells hold which channel. Prefers a header row naming the channels
// (T1…T4, CH1…, Kanal 1…); otherwise takes the cells after the timestamp on
// the first data rows. A leading row-number column sits before the
// timestamp, so it is never mistaken for a channel.
function columnLayout(rows) {
  const firstData = rows.findIndex((r) => findTimestamp(r));
  if (firstData < 0) return null;
  const head = /^(?:t|ch|kanal|channel|temp(?:eratur)?|probe)\s*[-_ ]?\s*([1-4])\b/i;
  for (let h = firstData - 1; h >= 0; h--) {
    const cols = [];
    const channels = [];
    rows[h].forEach((c, i) => {
      const m = c.match(head);
      if (m && !channels.includes(Number(m[1]))) { cols.push(i); channels.push(Number(m[1])); }
    });
    if (cols.length) return { cols, channels };
  }
  // No header: every cell after the timestamp that holds a temperature (or
  // an unreadable placeholder in a column that holds temperatures elsewhere)
  // on the first rows of data.
  const sample = rows.slice(firstData, firstData + 50).filter((r) => findTimestamp(r));
  const after = findTimestamp(sample[0]).last + 1;
  const width = Math.max(...sample.map((r) => r.length));
  const cols = [];
  for (let i = after; i < width && cols.length < 4; i++) {
    if (sample.some((r) => cellTemp(r[i]) !== null)) cols.push(i);
  }
  if (!cols.length) return null;
  return { cols, channels: cols.map((_, k) => k + 1) };
}

// ---- Screening --------------------------------------------------------------

// Marks every reading as valid or not, with the reason. Input rows are
// { ts, ch, temp, excluded? } where excluded is a reason stored at import
// time (e.g. a minute whose channel order could not be trusted). Output rows
// carry `reason` (null = valid).
export function screenReadings(readings) {
  const out = readings.map((r) => ({ ...r, reason: r.excluded || null }));
  const byCh = new Map();
  for (const r of out) {
    if (!byCh.has(r.ch)) byCh.set(r.ch, []);
    byCh.get(r.ch).push(r);
  }
  for (const rows of byCh.values()) {
    rows.sort((a, b) => a.ts - b.ts);
    const bad = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.reason) continue;
      if (!Number.isFinite(r.temp) || r.temp < PLAUSIBLE_MIN || r.temp > PLAUSIBLE_MAX) {
        r.reason = "umulig verdi";
        bad.push(r.ts);
        continue;
      }
      const near = [];
      for (let j = Math.max(0, i - MEDIAN_HALF); j <= Math.min(rows.length - 1, i + MEDIAN_HALF); j++) {
        if (j !== i && Math.abs(rows[j].ts - r.ts) <= (MEDIAN_HALF + 1) * MIN) near.push(rows[j].temp);
      }
      if (near.length >= 2 && Math.abs(r.temp - median(near)) > MAX_STEP) {
        r.reason = "sprang";
        bad.push(r.ts);
      }
    }
    // Quarantine around every bad reading on this channel.
    if (bad.length) {
      let k = 0;
      for (const r of rows) {
        while (k < bad.length && bad[k] < r.ts - QUARANTINE_MIN * MIN) k++;
        if (!r.reason && k < bad.length && Math.abs(bad[k] - r.ts) <= QUARANTINE_MIN * MIN) r.reason = "ustabil sonde";
      }
    }
  }
  return out;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---- Runs -------------------------------------------------------------------

// Stretches where at least `minProbes` different probes, with valid readings,
// were all at or above minTemp in the same minute, with no hole longer than
// MAX_GAP_MIN. Input: screened readings. Returns runs sorted by start:
// [{ from, to, minutes, probes }] where probes is the fewest probes hot in
// any minute of the run.
export function holdRuns(screened, minTemp, minProbes = MIN_PROBES) {
  const minutes = new Map();
  for (const r of screened) {
    if (r.reason) continue;
    const m = Math.round(r.ts / MIN);
    if (!minutes.has(m)) minutes.set(m, new Set());
    if (r.temp >= minTemp) minutes.get(m).add(r.ch);
  }
  const keys = [...minutes.keys()].sort((a, b) => a - b);
  const runs = [];
  let cur = null;
  for (const m of keys) {
    const hot = minutes.get(m).size;
    if (hot >= minProbes && cur && m - cur.last <= MAX_GAP_MIN) {
      cur.last = m;
      cur.probes = Math.min(cur.probes, hot);
    } else if (hot >= minProbes) {
      cur = { first: m, last: m, probes: hot };
      runs.push(cur);
    } else {
      cur = null;
    }
  }
  return runs.map((r) => ({
    from: r.first * MIN,
    to: r.last * MIN,
    minutes: r.last - r.first,
    probes: r.probes,
  }));
}

// Longest run (minutes) at or above minTemp on ONE probe's valid readings,
// broken by any hole longer than MAX_GAP_MIN.
function longestOnChannel(rows, minTemp) {
  let best = 0;
  let start = null;
  let prev = null;
  for (const r of rows) {
    if (r.reason) continue;
    const broken = prev !== null && r.ts - prev > MAX_GAP_MIN * MIN;
    if (r.temp >= minTemp) {
      if (start === null || broken) start = r.ts;
      best = Math.max(best, (r.ts - start) / MIN);
    } else {
      start = null;
    }
    prev = r.ts;
  }
  return Math.round(best);
}

// Contiguous spans of rejected readings per channel, for showing what was
// thrown out and why.
export function excludedSpans(screened) {
  const spans = [];
  const byCh = new Map();
  for (const r of screened) {
    if (!r.reason) continue;
    if (!byCh.has(r.ch)) byCh.set(r.ch, []);
    byCh.get(r.ch).push(r);
  }
  for (const [ch, rows] of [...byCh.entries()].sort((a, b) => a[0] - b[0])) {
    rows.sort((a, b) => a.ts - b.ts);
    let cur = null;
    for (const r of rows) {
      if (cur && r.ts - cur.to <= MAX_GAP_MIN * MIN) {
        cur.to = r.ts;
        cur.count++;
        cur.max = Math.max(cur.max, r.temp);
        cur.min = Math.min(cur.min, r.temp);
        cur.reasons.add(r.reason);
      } else {
        cur = { ch, from: r.ts, to: r.ts, count: 1, max: r.temp, min: r.temp, reasons: new Set([r.reason]) };
        spans.push(cur);
      }
    }
  }
  return spans.map((s) => ({ ...s, reasons: [...s.reasons] }));
}

// The §19 verdict for one logger record (the Hygienisering page).
// Godkjent only when every probe that logged held minTemp for minMinutes on
// valid readings, AND at least MIN_PROBES probes held it at the same time.
// A single probe — faulty or not — can never make a record godkjent.
export function evaluate(readings, minTemp, minMinutes) {
  const screened = screenReadings(readings);
  const byCh = new Map();
  for (const r of screened) {
    if (!byCh.has(r.ch)) byCh.set(r.ch, []);
    byCh.get(r.ch).push(r);
  }
  const channels = [];
  for (const [ch, rows] of [...byCh.entries()].sort((a, b) => a[0] - b[0])) {
    rows.sort((a, b) => a.ts - b.ts);
    const maxMinutes = longestOnChannel(rows, minTemp);
    const excluded = rows.filter((r) => r.reason).length;
    channels.push({ ch, maxMinutes, pass: maxMinutes >= minMinutes, excluded, valid: rows.length - excluded });
  }
  const runs = holdRuns(screened, minTemp, MIN_PROBES);
  const best = runs.reduce((a, r) => (!a || r.minutes > a.minutes ? r : a), null);
  const together = best ? best.minutes : 0;
  const pass =
    channels.length >= MIN_PROBES &&
    channels.every((c) => c.pass) &&
    together >= minMinutes;
  return {
    channels,
    pass,
    together: { minutes: together, from: best ? best.from : null, to: best ? best.to : null },
    excluded: screened.filter((r) => r.reason).length,
    spans: excludedSpans(screened),
    screened,
  };
}

// Per Oslo calendar day: probes with valid readings, probes that reached
// minTemp on valid readings, peak of valid readings, rejected count.
export function dayStats(screened, minTemp) {
  const days = new Map();
  for (const r of screened) {
    const d = isoDateOslo(new Date(r.ts));
    if (!days.has(d)) days.set(d, { date: d, probes: new Set(), hot: new Set(), max: null, rejected: 0, rejectedCh: new Set(), samples: 0 });
    const s = days.get(d);
    s.samples++;
    if (r.reason) { s.rejected++; s.rejectedCh.add(r.ch); continue; }
    s.probes.add(r.ch);
    if (r.temp >= minTemp) s.hot.add(r.ch);
    s.max = s.max === null ? r.temp : Math.max(s.max, r.temp);
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((s) => ({
    date: s.date, samples: s.samples, points: s.probes.size, points_hot: s.hot.size,
    max_temp: s.max, rejected: s.rejected, rejected_ch: [...s.rejectedCh].sort(),
  }));
}
