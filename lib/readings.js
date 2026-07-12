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
    for_l: numOrNull(body.for_l) ?? 0,
    notat: String(body.notat || ""),
    avvik: body.avvik ? 1 : 0,
  };
}

export const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
