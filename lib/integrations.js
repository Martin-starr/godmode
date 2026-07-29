import { db } from "@/lib/db";

// Connector health.
//
// The failure this exists to prevent: an integration stops working and
// nothing says so. Gmail died on 12 July with `unauthorized` and was still
// dead on 27 July because the only place that knew was a red line inside a
// panel nobody had reason to open. The Notion mirror managed four weeks
// while its own header claimed "oppdateres hvert 10. min".
//
// So health is recorded on every attempt, and staleness is *derived* from
// expected_interval_min rather than reported. A connector that silently
// stops being called never throws — but it does stop calling ok(), and that
// is what age catches.
//
// Recording must never break the thing it is observing: every function here
// swallows its own errors. A health-table write failing is not a reason for
// a sync to fail.

export async function ok(key) {
  try {
    await db()`update dash.integrations
      set last_ok_at = now(), last_error = null, consecutive_failures = 0
      where key = ${key}`;
  } catch (e) {
    console.error("integrations.ok(" + key + ") failed:", e.message);
  }
}

export async function fail(key, message) {
  try {
    await db()`update dash.integrations
      set last_error = ${String(message).slice(0, 500)},
          last_error_at = now(),
          consecutive_failures = consecutive_failures + 1
      where key = ${key}`;
  } catch (e) {
    console.error("integrations.fail(" + key + ") failed:", e.message);
  }
}

// Wraps a connector call so success and failure are both recorded without
// each call site having to remember. Re-throws — this observes, it does not
// handle.
export async function tracked(key, work) {
  try {
    const result = await work();
    await ok(key);
    return result;
  } catch (e) {
    await fail(key, e.message);
    throw e;
  }
}

// grønn  = succeeded recently enough
// gul    = overdue, or failing but with a recent success behind it
// rød    = failing repeatedly, or never succeeded at all
// pauset = muted by a human (a known outage being worked on)
export function classify(row, now = Date.now()) {
  if (row.muted_until && new Date(row.muted_until).getTime() > now) return "pauset";

  const lastOk = row.last_ok_at ? new Date(row.last_ok_at).getTime() : null;
  const ageMin = lastOk === null ? null : (now - lastOk) / 60000;

  if (lastOk === null) return row.last_error ? "rød" : "ukjent";
  if (row.consecutive_failures >= 3) return "rød";

  // An on-demand connector (expected_interval_min NULL) can't be judged on
  // age — nothing is supposed to call it on a schedule. It's only ever as
  // bad as its last attempt.
  if (row.expected_interval_min == null) return row.last_error ? "gul" : "grønn";

  // Two missed intervals before shouting: one is a blip, two is a pattern.
  if (ageMin > row.expected_interval_min * 2) return "rød";
  if (ageMin > row.expected_interval_min) return "gul";
  return row.last_error ? "gul" : "grønn";
}

// Some connectors have nothing to instrument. The phone logger writes straight
// to public.logs without ever calling this module, and the hygienisering
// importer is a file upload — neither will ever call ok(). Left as-is they sit
// at "ukjent" forever, which means the single most important failure ("the
// phone logger went quiet") would never be caught by the health table.
//
// So their health is derived from the data they produce instead: the newest row
// IS the last successful run. No wiring, and it cannot drift out of sync with
// reality the way a forgotten ok() call can.
async function deriveFromData(sql, key) {
  try {
    if (key === "applog") {
      const [r] = await sql`select max(created_at) as ts from public.logs`;
      return r?.ts || null;
    }
    if (key === "hygiene") {
      const [r] = await sql`select max(imported_at) as ts from dash.hygiene_imports`;
      return r?.ts || null;
    }
  } catch (e) {
    console.error("integrations.deriveFromData(" + key + ") failed:", e.message);
  }
  return null;
}

export async function statuses() {
  const sql = db();
  const rows = await sql`select key, label, expected_interval_min, last_ok_at,
      last_error, last_error_at, consecutive_failures, muted_until
    from dash.integrations order by key`;

  // Sequential, not Promise.all — concurrent queries on one pooled connection
  // wedge Supavisor (see lib/db.js).
  const derived = [];
  for (const r of rows) {
    const ts = r.last_ok_at ? null : await deriveFromData(sql, r.key);
    derived.push(ts ? { ...r, last_ok_at: ts, derived: true } : r);
  }

  const now = Date.now();
  return derived.map((r) => ({
    ...r,
    status: classify(r, now),
    age_minutes: r.last_ok_at
      ? Math.round((now - new Date(r.last_ok_at).getTime()) / 60000)
      : null,
  }));
}
