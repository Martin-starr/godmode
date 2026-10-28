// Time helpers shared by server and client. Everything the user sees is in
// Europe/Oslo; everything stored is an instant (timestamptz / Date).
export const OSLO = "Europe/Oslo";

const stampFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: OSLO, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

// Date → "YYYY-MM-DD HH:MM:SS" in Europe/Oslo.
export function osloStamp(date) {
  return stampFmt.format(date instanceof Date ? date : new Date(date)).replace("T", " ");
}

// Date → "YYYY-MM-DD" in Europe/Oslo.
export function isoDateOslo(date = new Date()) {
  return osloStamp(date).slice(0, 10);
}
export const todayOslo = isoDateOslo;

// Oslo wall-clock → UTC instant. Two passes settle the DST offset.
export function osloToUtc(y, m, d, h = 0, mi = 0, s = 0) {
  let guess = Date.UTC(y, m - 1, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const [dp, tp] = osloStamp(new Date(guess)).split(" ");
    const [by, bm, bd] = dp.split("-").map(Number);
    const [bh, bmi, bs] = tp.split(":").map(Number);
    guess += Date.UTC(y, m - 1, d, h, mi, s) - Date.UTC(by, bm - 1, bd, bh, bmi, bs);
  }
  return new Date(guess);
}

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function dayStart(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return osloToUtc(y, m, d, 0, 0, 0);
}
export function dayEnd(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return osloToUtc(y, m, d, 23, 59, 59);
}

// "2026-10-28" ± n days, as an ISO date (calendar arithmetic, DST-safe).
export function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d + n);
  return new Date(t).toISOString().slice(0, 10);
}

export function isSameOsloDay(a, b) {
  return isoDateOslo(a) === isoDateOslo(b);
}
