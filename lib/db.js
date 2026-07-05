import postgres from "postgres";

// The dashboard's data lives in the `dash` schema of the Verminord Supabase
// project. The previous deployment connected as the `dash_app` role through
// Supavisor and hung for 300 s (504) on writes when the pooler queue filled up.
//
// This layer avoids that failure mode:
//  - transaction-mode pooler (port 6543) instead of session mode
//  - prepare:false (required by transaction pooling)
//  - one connection per lambda instance, short idle timeout
//  - hard connect/statement timeouts so a broken pool fails fast instead of
//    hanging until the platform kills the function
//
// The connection string is discovered rather than hardcoded so the Vercel
// project's existing environment variables keep working no matter what the
// variable was named when the project was first set up.
function resolveDatabaseUrl() {
  const named =
    process.env.DASH_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_PRISMA_URL;
  if (named) return named;

  const candidates = Object.values(process.env).filter(
    (v) => typeof v === "string" && /^postgres(ql)?:\/\//.test(v)
  );
  if (!candidates.length) return null;
  return candidates.find((v) => v.includes("supabase")) || candidates[0];
}

function normalize(url) {
  // Prefer the transaction pooler: session mode holds one server slot per
  // (accumulating) lambda instance, which is what exhausted the pool before.
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("pooler.supabase.com") && u.port === "5432") {
      u.port = "6543";
    }
    return u.toString();
  } catch {
    return url;
  }
}

let client = null;

export function db() {
  if (!client) {
    const url = resolveDatabaseUrl();
    if (!url) throw new Error("Ingen databasetilkobling konfigurert (DASH_DATABASE_URL).");
    client = postgres(normalize(url), {
      prepare: false,
      // One connection per in-flight query: with Vercel's in-instance request
      // concurrency, two requests sharing a single connection interleave
      // queries on one socket, which wedges Supavisor indefinitely.
      max: 10,
      connect_timeout: 10,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
      ssl: process.env.DASH_DB_NO_SSL ? false : "require",
      connection: { statement_timeout: "8000" },
    });
  }
  return client;
}

// Drops the pool so the next request reconnects from scratch. Called by the
// request watchdog when queries stop answering (wedged pooler connection).
export function resetDb() {
  const dying = client;
  client = null;
  if (dying) dying.end({ timeout: 1 }).catch(() => {});
}
