// The pipeline's own postgres client.
//
// Why not lib/db.js: that client is tuned for a Vercel lambda — 8 s statement
// timeout, up to 10 connections — and both settings are wrong here. A Search
// Console backfill inserts tens of thousands of rows in one statement, and a
// long-running script wants exactly one connection so an accidental
// Promise.all queues instead of wedging Supavisor (the failure lib/db.js
// documents). Same URL discovery and pooler rules, different knobs.
//
// lib/integrations.js still uses lib/db.js for its own health writes; two
// clients on the transaction pooler are fine.
import postgres from "postgres";

function resolveUrl() {
  return (
    process.env.DASH_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    null
  );
}

function normalize(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("pooler.supabase.com") && u.port === "5432") u.port = "6543";
    return u.toString();
  } catch {
    return url;
  }
}

let client = null;

export function hasDbConfig() {
  return !!resolveUrl();
}

export function sql() {
  if (!client) {
    const url = resolveUrl();
    if (!url) throw new Error("Ingen databasetilkobling konfigurert (DASH_DATABASE_URL).");
    client = postgres(normalize(url), {
      prepare: false,
      max: 1,
      connect_timeout: 15,
      idle_timeout: 30,
      max_lifetime: 60 * 30,
      ssl: process.env.DASH_DB_NO_SSL ? false : "require",
      connection: { statement_timeout: "60000" },
    });
  }
  return client;
}

export async function closeDb() {
  const dying = client;
  client = null;
  if (dying) await dying.end({ timeout: 5 }).catch(() => {});
}

// Inserts rows in chunks with a caller-supplied statement builder, so a
// 25 000-row Search Console page never becomes one giant statement.
export async function inChunks(rows, size, fn) {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
  }
}

// Every jsonb parameter goes through here.
//
// postgres.js asks the server what type each parameter has and serialises
// with that type. `${JSON.stringify(x)}::jsonb` therefore gets encoded twice:
// the server says jsonb, the client runs JSON.stringify on the string that
// is already JSON, and the column ends up holding a jsonb *string* instead
// of an object or array. Every reader downstream (jsonb_typeof checks, ->
// lookups, `||` merges) then silently sees the wrong shape — this is what
// turned seo.briefs.brief into an array in W38–W40 and left seo.runs.stats
// and seo.ai_visibility.citations as strings. sql.json() tags the value so
// it is encoded exactly once. SQL null stays null.
export function jsonb(x) {
  return x == null ? null : sql().json(x);
}
