// Norwegian display formatting (nb-NO, Europe/Oslo). Shared by server and client.
import { OSLO, isoDateOslo } from "./time.js";

const nf = new Map();
function numberFormat(d) {
  if (!nf.has(d)) nf.set(d, new Intl.NumberFormat("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d }));
  return nf.get(d);
}

// 21.3 → "21,3"; 1240 → "1 240"; null → "—"
export function fmtNum(v, decimals = 1) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return numberFormat(decimals).format(Number(v));
}

const timeFmt = new Intl.DateTimeFormat("nb-NO", { timeZone: OSLO, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("nb-NO", { timeZone: OSLO, day: "numeric", month: "short" });
const dayYearFmt = new Intl.DateTimeFormat("nb-NO", { timeZone: OSLO, day: "numeric", month: "short", year: "numeric" });
const dateFmt = new Intl.DateTimeFormat("nb-NO", { timeZone: OSLO, day: "2-digit", month: "2-digit", year: "numeric" });
const weekdayFmt = new Intl.DateTimeFormat("nb-NO", { timeZone: OSLO, weekday: "long" });

const toDate = (d) => (d instanceof Date ? d : new Date(d));

// "kl 09:30"
export function fmtTime(d) {
  if (!d) return "—";
  return "kl " + timeFmt.format(toDate(d));
}

// "24. okt" (nb-NO short months end with a period; drop it)
export function fmtDay(d) {
  if (!d) return "—";
  return dayFmt.format(toDate(d)).replace(/\.$/, "");
}

// "24. okt 2026"
export function fmtDayYear(d) {
  if (!d) return "—";
  return dayYearFmt.format(toDate(d)).replace(/\.\s(\d{4})$/, " $1");
}

// "28.10.2026"
export function fmtDate(d) {
  if (!d) return "—";
  return dateFmt.format(toDate(d));
}

// "onsdag"
export function fmtWeekday(d) {
  return weekdayFmt.format(toDate(d));
}

// Today → "kl 09:30"; otherwise "24. okt kl 09:30".
export function fmtWhen(d, now = new Date()) {
  if (!d) return "—";
  const date = toDate(d);
  if (isoDateOslo(date) === isoDateOslo(now)) return fmtTime(date);
  return fmtDay(date) + " " + fmtTime(date);
}

// A date-only value (public.logs.date) → "24. okt"
export function fmtIsoDay(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return fmtDay(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function fmtIsoDayYear(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return fmtDayYear(new Date(Date.UTC(y, m - 1, d, 12)));
}
