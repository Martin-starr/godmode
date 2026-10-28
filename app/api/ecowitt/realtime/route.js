import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";
import { config, fetchRealtime, parseRealtime, storeReadings, latestPerChannel, NOT_CONFIGURED } from "@/lib/ecowitt";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Anlegg's "Oppdater": pull the station's latest values, store one row per
// channel (ts rounded to the minute) and hand back the newest row per channel.
//
// Cached for five minutes, two layers deep:
//  - in this lambda instance (cheap, but instances come and go)
//  - in the database: if the newest realtime row is younger than five minutes
//    somebody already asked, so the API is not called again. That one holds
//    across instances, which is what keeps repeated pull-to-refresh from
//    hammering the API.
const TTL_MS = 5 * 60 * 1000;
// "Oppdater" (force=1) may shorten the wait to a minute, never to zero: the
// whole API budget is about one call per ten seconds, shared with the cron.
const FORCE_FLOOR_MS = 60 * 1000;
let memo = { at: 0, payload: null };
let sampleLogged = false;

export const GET = guarded(async (req) => {
  const sql = db();
  const cfg = config();
  const force = new URL(req.url).searchParams.get("force") === "1";

  if (!cfg.configured) {
    const latest = await latestPerChannel(sql);
    return json({ configured: false, message: NOT_CONFIGURED, fetched: false, latest, fetched_at: null });
  }

  const now = Date.now();
  let fetched = false;
  let unknownGroups = [];
  let channelNames = {};
  let error = null;

  const [{ newest }] = await sql`select max(ts) as newest from public.sensor_readings where source = 'ecowitt-realtime'`;
  const ttl = force ? FORCE_FLOOR_MS : TTL_MS;
  const ageDb = newest ? now - new Date(newest).getTime() : Infinity;
  const ageMem = memo.payload ? now - memo.at : Infinity;
  const fresh = Math.min(ageDb, ageMem) < ttl;

  if (!fresh) {
    try {
      const payload = await fetchRealtime(cfg);
      memo = { at: now, payload };
      if (!sampleLogged) {
        // One raw response in the function log on first contact, so the
        // parser can be checked against what the WH52 really sends.
        console.log("[ecowitt] real_time sample:", JSON.stringify(payload).slice(0, 6000));
        sampleLogged = true;
      }
      const parsed = parseRealtime(payload);
      unknownGroups = parsed.unknownGroups;
      channelNames = parsed.channelNames;
      if (unknownGroups.length) console.warn("[ecowitt] ukjente grupper i real_time:", unknownGroups.join(", "));
      if (parsed.readings.length) {
        await storeReadings(sql, parsed.readings, { source: "ecowitt-realtime", mode: "update" });
      }
      fetched = true;
    } catch (e) {
      // The page must still paint from what is already stored.
      console.error("[ecowitt] real_time failed:", e.message);
      error = e.message;
    }
  }

  const latest = await latestPerChannel(sql);
  return json({
    configured: true,
    fetched,
    cached: !fetched && !error,
    error,
    fetched_at: fetched ? new Date(now).toISOString() : (memo.at ? new Date(memo.at).toISOString() : newest),
    latest,
    unknownGroups,
    channelNames,
  });
});
