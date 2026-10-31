// Parser for temperature-logger exports (Center 374, 4 channels) plus the
// §19 checks shared by the Hygienisering page and the monthly
// documentation report (/api/compliance/gaps). Both must give the same
// answer, so the rules live here and nowhere else.
//
// The one rule everything below serves: a probe fault must never be able to
// make a record "godkjent". Where the data is ambiguous, the answer is
// "not documented", never "passed".
import { osloToUtc, osloStamp, isoDateOslo } from "./time.js";

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
// After a fault, a probe has to prove itself again: either it comes back to
// the level it held before the fault, or another probe confirms its new
// level within this many degrees in the same minute.
const AGREE = 5;
// The readings either side of a fault are the same loose contact, only less
// obvious; they are set aside too.
const QUARANTINE_MIN = 10;
// The logger writes one line a minute. A hole longer than this breaks a run:
// nothing documents what the mass did in between.
export const MAX_GAP_MIN = 5;
// One probe is an anecdote, not a record.
export const MIN_PROBES = 2;

// Reasons a reading is set aside. Stored ones (excluded column) come from
// the import; the rest are computed every time the record is evaluated.
export const R_FAULT = "sondefeil (loggeren kunne ikke lese sonden)";
const R_RANGE = "umulig verdi";
const R_STEP = "sprang";
const R_NEAR = "ustabil sonde";
const R_LEVEL = "uverifisert nivå etter feil";

const MIN = 60000;

// ---- Import -----------------------------------------------------------------

// Marker for a cell the logger wrote but could not fill: "----" (open
// thermocouple), "OL" (over range), "Err", or empty. It is the logger
// itself reporting a probe fault, so it is kept and stored as one.
export const FAULT = "fault";

// Accepts CSV/TSV/semicolon text. Finds the timestamp and up to four
// temperature COLUMNS — by position, so an unreadable value on one channel
// stays a fault on that channel instead of sliding the next channel's value
// into its place.
//
// The logger's clock is the PC's local time (Europe/Oslo), so timestamps are
// read as Oslo wall-clock time, not UTC; the repeated hour when summer time
// ends is resolved from the order of the rows.
//
// Anything the parser cannot read with certainty (US dates, AM/PM, times
// running backwards, headers that do not line up with the data) is refused
// with a message, never guessed.
//
// Returns { points: [{ ts, temps: [number | FAULT, …] }], channels: [1, 2, …] }.
export function parseLoggerExport(text) {
  const lines = String(text).replace(/^﻿/, "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Fant ingen datalinjer i filen.");

  const delim = chooseDelimiter(lines);
  const rows = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, "")));
  const stamps = rows.map((cells) => findTimestamp(cells));

  // Data rows: the timestamp layout most rows share. A preamble line that
  // happens to carry a date ("Start: 26.09.2026 12:00") is not data.
  const layouts = new Map();
  stamps.forEach((t) => {
    if (!t) return;
    const k = t.first + ":" + t.last;
    layouts.set(k, (layouts.get(k) || 0) + 1);
  });
  if (!layouts.size) throw new Error("Fant ingen tidspunkt i filen — eksporter som CSV fra Center 374-programmet.");
  const [first, last] = [...layouts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0].split(":").map(Number);
  // A data line has cells after its timestamp (a value or a fault marker);
  // a "Start: 26.09.2026 12:00" line in the preamble has none.
  const dataIdx = [];
  stamps.forEach((t, i) => { if (t && t.first === first && t.last === last && rows[i].length > last + 1) dataIdx.push(i); });
  if (!dataIdx.length) throw new Error("Fant ingen målinger i filen.");

  checkDates(dataIdx.map((i) => stamps[i]));

  const layout = columnLayout(rows, dataIdx, first, last);
  const points = [];
  let prev = -Infinity;
  for (const i of dataIdx) {
    const t = stamps[i];
    const ts = resolveInstant(t, prev, i + 1);
    prev = ts;
    points.push({ ts, temps: layout.cols.map((c) => { const v = cellTemp(rows[i][c]); return v === null ? FAULT : v; }) });
  }
  if (!points.length) throw new Error("Klarte ikke å tolke filen — eksporter som CSV fra Center 374-programmet.");
  return { points, channels: layout.channels };
}

// The delimiter that yields the most temperature cells after a timestamp.
// A raw character count would pick "," in a semicolon file with decimal
// commas. Ties: tab, then semicolon, then comma.
function chooseDelimiter(lines) {
  const sample = lines.slice(0, 300);
  let best = ["\t", -1];
  for (const d of ["\t", ";", ","]) {
    let score = 0;
    for (const l of sample) {
      const cells = l.split(d).map((c) => c.trim().replace(/^"|"$/g, ""));
      const t = findTimestamp(cells);
      if (!t) continue;
      for (let i = t.last + 1; i < cells.length; i++) if (cellTemp(cells[i]) !== null) score++;
    }
    if (score > best[1]) best = [d, score];
  }
  return best[0];
}

// "dd.mm.yyyy hh:mm[:ss]", "dd/mm/yyyy …" or "yyyy-mm-dd hh:mm[:ss]" — date
// and time may live in one cell or in two adjacent cells. Returns
// { wall: [y, m, d, h, mi, s], first, last, ampm, slash } or null; first and
// last are the cells the timestamp used. Ranges are checked by checkDates.
export function findTimestamp(cells) {
  for (let i = 0; i < cells.length; i++) {
    const tries = [[cells[i], i], [cells[i] + " " + (cells[i + 1] || ""), i + 1]];
    for (const [s, last] of tries) {
      let m = s.match(/^(\d{1,2})([./])(\d{1,2})[./](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*[ap]\.?m\.?)?/i);
      if (m) return { wall: [+m[4], +m[3], +m[1], +m[5], +m[6], +(m[7] || 0)], first: i, last, ampm: !!m[8], slash: m[2] === "/" };
      m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*[ap]\.?m\.?)?/i);
      if (m) return { wall: [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)], first: i, last, ampm: !!m[7], slash: false };
    }
  }
  return null;
}

function checkDates(stamps) {
  const usual = "Sett PC-en til norsk datoformat (dd.mm.åååå, 24 timer) og eksporter på nytt.";
  for (const t of stamps) {
    if (t.ampm) throw new Error("Filen bruker AM/PM-tid. " + usual);
    // In d/m/y the middle field is the month; above 12 means the file is m/d/y.
    if (t.slash && t.wall[1] > 12) throw new Error("Filen ser ut til å bruke amerikansk dato (måned/dag). " + usual);
    const [y, mo, d, h, mi, s] = t.wall;
    const u = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    if (h > 23 || mi > 59 || s > 59 || u.getUTCMonth() !== mo - 1 || u.getUTCDate() !== d) {
      throw new Error("Ugyldig dato eller klokkeslett i filen (" + d + "." + mo + "." + y + " " + h + ":" + String(mi).padStart(2, "0") + "). " + usual);
    }
  }
}

const wallText = (w) =>
  w[0] + "-" + String(w[1]).padStart(2, "0") + "-" + String(w[2]).padStart(2, "0") + " " +
  String(w[3]).padStart(2, "0") + ":" + String(w[4]).padStart(2, "0") + ":" + String(w[5]).padStart(2, "0");

// Oslo wall-clock time → instant, strictly after the previous row. In the
// night summer time ends, 02:00–02:59 happens twice; the first pass is
// summer time, the second winter time. Any other step backwards, or the
// same time twice, means the file is not one clean logger run.
function resolveInstant(t, prev, lineNo) {
  const late = osloToUtc(...t.wall).getTime();
  const early = late - 3600e3;
  const ambiguous = osloStamp(new Date(early)) === wallText(t.wall);
  const pick = [ambiguous ? early : null, late].filter((x) => x !== null).find((x) => x > prev);
  if (pick === undefined) {
    throw new Error("Tidspunktene i filen går baklengs eller gjentas (linje " + lineNo + "). Eksporter én sammenhengende logg på nytt.");
  }
  return pick;
}

// A temperature cell: a number with optional unit, decimal comma allowed.
// Anything else → null.
export function cellTemp(s) {
  const c = String(s ?? "").trim().replace(/\s*°?\s*[CF]$/i, "");
  if (!/^-?\d+(?:[.,]\d+)?$/.test(c)) return null;
  const n = Number(c.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Which cells hold which channel. Prefers a header row naming the channels
// (T1…T4, CH1…, Kanal 1…), lined up with the data by its date column;
// otherwise the four cells after the timestamp are channels 1–4 by
// position. A channel with no number anywhere in the file was not connected
// and is left out. A header that does not fit the data is refused.
function columnLayout(rows, dataIdx, first, last) {
  const head = /^(?:t|ch|kanal|channel|temp(?:eratur)?|probe|sonde)\s*[-_ ]?\s*([1-4])\b/i;
  const dateHead = /^(?:dato|date|tid|time|tidspunkt|timestamp)\b/i;
  const hasNum = (c) => dataIdx.some((i) => cellTemp(rows[i][c]) !== null);
  const width = Math.max(...dataIdx.map((i) => rows[i].length));
  // Columns after the timestamp that hold a temperature anywhere.
  const live = [];
  for (let c = last + 1; c < width; c++) if (hasNum(c)) live.push(c);
  if (!live.length) throw new Error("Fant ingen temperaturer i filen.");

  for (let h = dataIdx[0] - 1; h >= 0; h--) {
    const cells = rows[h];
    const named = [];
    cells.forEach((c, i) => {
      const m = c.match(head);
      if (m && !named.some((x) => x.ch === Number(m[1]))) named.push({ col: i, ch: Number(m[1]) });
    });
    if (!named.length) continue;
    const d = cells.findIndex((c) => dateHead.test(c));
    const shift = d >= 0 ? first - d : 0;
    const mapped = named.map((x) => ({ col: x.col + shift, ch: x.ch }));
    const misfit = mapped.some((x) => x.col <= last) || live.some((c) => !mapped.some((x) => x.col === c));
    if (misfit) throw new Error("Kolonneoverskriftene passer ikke med dataene. Eksporter på nytt fra Center 374-programmet.");
    const used = mapped.filter((x) => hasNum(x.col)).sort((a, b) => a.ch - b.ch);
    return { cols: used.map((x) => x.col), channels: used.map((x) => x.ch) };
  }
  // No header: position decides the channel, never the number of columns
  // that happen to hold data.
  if (live.some((c) => c > last + 4)) throw new Error("Fant flere enn fire temperaturkolonner. Eksporter på nytt med overskrifter.");
  return { cols: live, channels: live.map((c) => c - last) };
}

// ---- Screening --------------------------------------------------------------

// Marks every reading as valid or not, with the reason. Input rows are
// { ts, ch, temp, excluded? } where excluded is a reason stored at import
// time (a logger fault, or a minute whose channel order could not be
// trusted); temp may be null for those. Output rows carry `reason`
// (null = valid).
export function screenReadings(readings) {
  const out = readings.map((r) => ({ ...r, reason: r.excluded || null }));
  const byCh = new Map();
  for (const r of out) {
    if (!byCh.has(r.ch)) byCh.set(r.ch, []);
    byCh.get(r.ch).push(r);
  }
  for (const rows of byCh.values()) rows.sort((a, b) => a.ts - b.ts);

  // Pass 1, per probe: stored faults, impossible values and spikes.
  const events = new Set();
  for (const rows of byCh.values()) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.reason) { events.add(r); continue; }
      if (!Number.isFinite(r.temp) || r.temp < PLAUSIBLE_MIN || r.temp > PLAUSIBLE_MAX) {
        r.reason = R_RANGE;
        events.add(r);
        continue;
      }
      const near = [];
      for (let j = Math.max(0, i - MEDIAN_HALF); j <= Math.min(rows.length - 1, i + MEDIAN_HALF); j++) {
        if (j !== i && Number.isFinite(rows[j].temp) && Math.abs(rows[j].ts - r.ts) <= (MEDIAN_HALF + 1) * MIN) near.push(rows[j].temp);
      }
      if (near.length >= 2 && Math.abs(r.temp - median(near)) > MAX_STEP) {
        r.reason = R_STEP;
        events.add(r);
      }
    }
  }

  // Minute → probes valid after pass 1, for cross-checking a new level.
  const byMinute = new Map();
  for (const r of out) {
    if (r.reason) continue;
    const m = Math.round(r.ts / MIN);
    if (!byMinute.has(m)) byMinute.set(m, []);
    byMinute.get(m).push(r);
  }
  const confirmed = (r) => (byMinute.get(Math.round(r.ts / MIN)) || []).some(
    (o) => o.ch !== r.ch && !o.reason && Math.abs(o.temp - r.temp) <= AGREE
  );

  // Pass 2, per probe: after a fault the probe is not trusted until it is
  // back at the level it held before, or another probe confirms its new
  // level. A probe that jumps to a steady wrong value stays set aside.
  for (const rows of byCh.values()) {
    const before = [];
    let suspect = null; // level before the fault; NaN = unknown
    for (const r of rows) {
      if (events.has(r)) {
        if (suspect === null) suspect = before.length ? median(before) : NaN;
        continue;
      }
      if (suspect !== null) {
        const back = Number.isFinite(suspect) && Math.abs(r.temp - suspect) <= MAX_STEP;
        if (back || confirmed(r)) suspect = null;
        else { r.reason = R_LEVEL; continue; }
      }
      before.push(r.temp);
      if (before.length > MEDIAN_HALF) before.shift();
    }
  }

  // Pass 3: the minutes either side of every fault.
  for (const rows of byCh.values()) {
    const bad = rows.filter((r) => events.has(r)).map((r) => r.ts);
    if (!bad.length) continue;
    let k = 0;
    for (const r of rows) {
      while (k < bad.length && bad[k] < r.ts - QUARANTINE_MIN * MIN) k++;
      if (!r.reason && k < bad.length && Math.abs(bad[k] - r.ts) <= QUARANTINE_MIN * MIN) r.reason = R_NEAR;
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

// Unbroken stretches where at least `minProbes` probes, on valid readings,
// were at or above minTemp in the same minute. With requireAll (the
// default), EVERY probe that is logging must be valid and hot: a probe that
// is cold, faulty or set aside breaks the run, it is not simply ignored.
// A probe stays "hot" across a hole of at most MAX_GAP_MIN minutes in its
// own readings; a valid reading below minTemp ends it at once.
// Returns [{ from, to, minutes, probes }] sorted by start; probes is the
// fewest probes hot in any minute of the run.
export function holdRuns(screened, minTemp, minProbes = MIN_PROBES, { requireAll = true } = {}) {
  if (!screened.length) return [];
  const at = new Map();
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of screened) {
    const m = Math.round(r.ts / MIN);
    if (!at.has(m)) at.set(m, []);
    at.get(m).push(r);
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }
  const state = new Map(); // ch → { kind: 'hot' | 'cold' | 'bad', at }
  const runs = [];
  let cur = null;
  for (let m = lo; m <= hi; m++) {
    for (const r of at.get(m) || []) {
      const kind = r.reason ? "bad" : r.temp >= minTemp ? "hot" : "cold";
      const prev = state.get(r.ch);
      // Within one minute the worst reading wins.
      if (!prev || prev.at !== m || kind === "bad" || (kind === "cold" && prev.kind === "hot")) state.set(r.ch, { kind, at: m });
    }
    let hot = 0;
    let present = 0;
    for (const s of state.values()) {
      if (m - s.at > MAX_GAP_MIN) continue;
      present++;
      if (s.kind === "hot") hot++;
    }
    const ok = hot >= minProbes && (!requireAll || hot === present);
    if (ok && cur) {
      cur.last = m;
      cur.probes = Math.min(cur.probes, hot);
    } else if (ok) {
      cur = { first: m, last: m, probes: hot };
      runs.push(cur);
    } else {
      cur = null;
    }
  }
  return runs.map((r) => ({ from: r.first * MIN, to: r.last * MIN, minutes: r.last - r.first, probes: r.probes }));
}

// Longest run (minutes) at or above minTemp on ONE probe's valid readings.
// A reading set aside, a valid reading below minTemp, or a hole longer than
// MAX_GAP_MIN ends it.
function longestOnChannel(rows, minTemp) {
  let best = 0;
  let start = null;
  let prev = null;
  for (const r of rows) {
    const broken = prev !== null && r.ts - prev > MAX_GAP_MIN * MIN;
    prev = r.ts;
    if (r.reason || r.temp < minTemp) { start = null; continue; }
    if (start === null || broken) start = r.ts;
    best = Math.max(best, (r.ts - start) / MIN);
  }
  return Math.round(best);
}

// Contiguous spans of readings set aside, per channel, for showing what was
// thrown out and why. min/max cover the readings that had a number.
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
      const v = Number.isFinite(r.temp) ? r.temp : null;
      if (cur && r.ts - cur.to <= MAX_GAP_MIN * MIN) {
        cur.to = r.ts;
        cur.count++;
        if (v !== null) {
          cur.max = cur.max === null ? v : Math.max(cur.max, v);
          cur.min = cur.min === null ? v : Math.min(cur.min, v);
        }
        cur.reasons.add(r.reason);
      } else {
        cur = { ch, from: r.ts, to: r.ts, count: 1, max: v, min: v, reasons: new Set([r.reason]) };
        spans.push(cur);
      }
    }
  }
  return spans.map((s) => ({ ...s, reasons: [...s.reasons] }));
}

// The §19 verdict for one logger record (the Hygienisering page).
// Godkjent only when at least MIN_PROBES probes held minTemp for minMinutes
// at the same time, with every logging probe valid and hot throughout. A
// single probe — faulty or not — can never make a record godkjent.
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
  const pass = channels.length >= MIN_PROBES && together >= minMinutes;
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
// minTemp on valid readings, peak of valid readings, readings set aside.
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
    max_temp: s.max, rejected: s.rejected, rejected_ch: [...s.rejectedCh].sort((a, b) => a - b),
  }));
}
