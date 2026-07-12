// Shared validation for the manual-reading endpoints.

// A blank field is a missing measurement (NULL), never a fabricated 0.
export function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function clean(body) {
  return {
    system: String(body.system || "").trim(),
    date: String(body.date || "").slice(0, 10),
    temp: numOrNull(body.temp),
    ph: numOrNull(body.ph),
    fukt: numOrNull(body.fukt),
    // null while validating (so a feeding-only entry counts as content);
    // stored as 0 = "ikke fôret", the same convention the phone-log view uses.
    for_l: numOrNull(body.for_l),
    notat: String(body.notat || ""),
    avvik: body.avvik ? 1 : 0,
  };
}

export const hasContent = (r) => r.temp != null || r.ph != null || r.fukt != null || r.for_l != null || r.notat.trim() !== "";

export const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
