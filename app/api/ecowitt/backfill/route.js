import crypto from "crypto";
import { db } from "@/lib/db";
import { json, err } from "@/lib/http";
import {
  config, fetchRealtime, fetchHistory, parseHistory, storeReadings, discoverGroups,
  chunkRange, dayStart, dayEnd, todayOslo, DATE_ONLY, DEFAULT_HISTORY_GROUPS, NOT_CONFIGURED,
} from "@/lib/ecowitt";

export const runtime = "nodejs";
export const maxDuration = 55;
export const dynamic = "force-dynamic";

// Pulls history at 30-minute resolution and inserts what is missing
// (on conflict do nothing — idempotent, safe to re-run over the same days).
//
//   ?days=N                  the last N days (default 3; what the daily cron sends)
//   ?from=YYYY-MM-DD&to=…    an explicit window (to defaults to today)
//
// The API allows at most seven days per 30-minute call, and a Hobby lambda
// has under a minute, so ONE chunk is processed per request. A window longer
// than seven days answers with `next_from`; scripts/ecowitt-backfill.mjs
// follows it, pausing between calls to stay well under the API's rate limit.
//
// Auth: Authorization: Bearer <CRON_SECRET>. Vercel's cron adds that header
// itself when the CRON_SECRET env var exists, so the same gate serves both
// the cron and the manual script.

function authorized(req) {
  const want = process.env.CRON_SECRET;
  if (!want) return false;
  const got = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let knownGroups = null; // discovered once per lambda instance

export async function GET(req) {
  if (!authorized(req)) return err("Ikke autorisert.", 401);

  const cfg = config();
  if (!cfg.configured) return json({ ok: false, configured: false, message: NOT_CONFIGURED }, 503);

  const q = new URL(req.url).searchParams;
  const today = todayOslo();
  let from, to;
  if (q.get("from")) {
    if (!DATE_ONLY.test(q.get("from"))) return err("from må være YYYY-MM-DD.");
    const toIso = q.get("to") || today;
    if (!DATE_ONLY.test(toIso)) return err("to må være YYYY-MM-DD.");
    from = dayStart(q.get("from"));
    to = dayEnd(toIso);
  } else {
    const days = Math.min(Math.max(Number(q.get("days")) || 3, 1), 400);
    to = new Date();
    from = new Date(to.getTime() - days * 86400 * 1000);
  }
  if (from > to) return err("from er etter to.");

  const cycleType = "30min";
  const chunks = chunkRange(from, to, cycleType);
  const chunk = chunks[0];
  const t0 = Date.now();

  try {
    const sql = db();
    if (!knownGroups) {
      // One real_time call tells us which groups the station actually has
      // (and therefore what the WH52 groups are called). Fall back to the
      // documented names if that call fails.
      try {
        const rt = await fetchRealtime(cfg);
        knownGroups = discoverGroups(rt);
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        console.warn("[ecowitt] discovery failed, using defaults:", e.message);
        knownGroups = DEFAULT_HISTORY_GROUPS;
      }
    }

    const payload = await fetchHistory(cfg, { start: chunk.start, end: chunk.end, cycleType, groups: knownGroups });
    const parsed = parseHistory(payload);
    if (parsed.unknownGroups.length) console.warn("[ecowitt] ukjente grupper i history:", parsed.unknownGroups.join(", "));
    const inserted = await storeReadings(sql, parsed.readings, { source: "ecowitt", mode: "ignore" });

    const next = chunks[1] ? chunks[1].start : null;
    return json({
      ok: true,
      cycle_type: cycleType,
      chunk: { from: chunk.start.toISOString(), to: chunk.end.toISOString() },
      groups: knownGroups,
      parsed: parsed.readings.length,
      inserted,
      done: !next,
      next_from: next ? next.toISOString() : null,
      remaining_chunks: Math.max(chunks.length - 1, 0),
      ms: Date.now() - t0,
    });
  } catch (e) {
    console.error("[ecowitt] backfill failed:", e.message);
    return json({ ok: false, error: e.message, chunk: { from: chunk.start.toISOString(), to: chunk.end.toISOString() } }, e.retryable ? 503 : 500);
  }
}
