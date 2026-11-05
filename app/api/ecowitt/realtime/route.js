import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";
import { config, refreshRealtime, latestPerChannel, NOT_CONFIGURED } from "@/lib/ecowitt";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Anlegg's "Oppdater": pull the station's latest values if the stored ones
// are older than five minutes (one minute with force=1), then hand back the
// newest row per channel. The pull itself lives in lib/ecowitt.js so the
// public status page can do the same.
export const GET = guarded(async (req) => {
  const sql = db();
  const cfg = config();
  const force = new URL(req.url).searchParams.get("force") === "1";

  if (!cfg.configured) {
    const latest = await latestPerChannel(sql);
    return json({ configured: false, message: NOT_CONFIGURED, fetched: false, latest, fetched_at: null });
  }

  const r = await refreshRealtime(sql, cfg, { force });
  const latest = await latestPerChannel(sql);
  return json({
    configured: true,
    fetched: r.fetched,
    cached: !r.fetched && !r.error,
    error: r.error,
    fetched_at: r.fetched_at,
    latest,
    unknownGroups: r.unknownGroups,
    channelNames: r.channelNames,
  });
});
