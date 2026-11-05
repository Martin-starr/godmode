import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { bedCurves } from "@/lib/curves";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

// Sensor curves for the Brief's "Sensor" mode (lib/curves.js).
export const GET = guarded(async (req) => {
  const sp = new URL(req.url).searchParams;
  const metric = sp.get("metric") || "temp";
  if (metric !== "temp" && metric !== "fukt") return err("Ugyldig måling.", 400);
  const days = Math.round(Number(sp.get("days")));
  if (!Number.isFinite(days) || days < 1 || days > 800) return err("Ugyldig periode.", 400);
  return json(await bedCurves(db(), { days, metric }));
});
