// Week arithmetic in one place.
//
// The agent keys everything on the ISO week (2026-W36) of the day it runs,
// evaluated in Europe/Oslo — a run at 03:30 UTC on a Monday is still that
// Monday in Norway. Search Console publishes final data with a 2–3 day lag,
// so "this week" for analysis is the 7 days ending three days before the run:
// on a Monday that means Tuesday–Sunday of the previous week are not all in
// yet, and the window is Sat→Fri. Consistent windows matter more than fresh
// ones; every comparison is like-for-like.

export function ymd(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(d, n) {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

// Midnight UTC of today's calendar date in Oslo.
export function osloToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return new Date(parts + "T00:00:00Z");
}

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week, key: t.getUTCFullYear() + "-W" + String(week).padStart(2, "0") };
}

// Monday of a given ISO week key.
export function weekMonday(key) {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) throw new Error("Ugyldig uke: " + key);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = addDays(jan4, 1 - jan4Day + (week - 1) * 7);
  return monday;
}

export function previousWeekKey(key) {
  return isoWeek(addDays(weekMonday(key), -7)).key;
}

export function weekNumber(key) {
  return Number(key.slice(-2));
}

// Analysis windows relative to the run date.
export function windows(runDate) {
  const thisEnd = addDays(runDate, -3);
  const thisStart = addDays(thisEnd, -6);
  const prevEnd = addDays(thisStart, -1);
  const prevStart = addDays(prevEnd, -6);
  const baseEnd = addDays(thisStart, -1);
  const baseStart = addDays(baseEnd, -27);
  const eightEnd = addDays(thisStart, -1);
  const eightStart = addDays(eightEnd, -55);
  return {
    this: { start: ymd(thisStart), end: ymd(thisEnd) },
    prev: { start: ymd(prevStart), end: ymd(prevEnd) },
    base: { start: ymd(baseStart), end: ymd(baseEnd) },
    eight: { start: ymd(eightStart), end: ymd(eightEnd) },
  };
}

// 16 months back from a date, in 30-day chunks, oldest first.
export function backfillChunks(endDate, months = 16) {
  const start = addDays(endDate, -Math.round(months * 30.4));
  const chunks = [];
  let s = start;
  while (s < endDate) {
    const e = addDays(s, 29) > endDate ? endDate : addDays(s, 29);
    chunks.push({ start: ymd(s), end: ymd(e) });
    s = addDays(e, 1);
  }
  return chunks;
}
