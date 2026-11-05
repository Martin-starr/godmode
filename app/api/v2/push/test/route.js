import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { pushConfigured, sendTo } from "@/lib/alerts";
import webpush from "web-push";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// One test notification to this phone, so "Slå på" can be seen to work.
export const POST = guarded(async (req) => {
  if (!pushConfigured()) return err("Varsling er ikke satt opp på serveren.", 503);
  const body = await req.json().catch(() => null);
  const endpoint = body && String(body.endpoint || "");
  const rows = await db()`select id, endpoint, keys from dash.push_subscriptions where endpoint = ${endpoint}`;
  if (!rows.length) return err("Denne telefonen er ikke påmeldt.", 404);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:post@verminord.no", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const r = await sendTo(rows[0], { title: "Varsler er på", body: "Slik ser et varsel fra Verminord ut.", href: "/varsler", tag: "test" });
  if (r !== "ok") return err("Fikk ikke sendt testvarselet.", 502);
  return json({ ok: true });
});
