import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { pushConfigured } from "@/lib/alerts";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// This phone's push subscription.
// GET    the public key the browser needs (and whether push is set up)
// POST   { subscription } from PushManager.subscribe → stored
// DELETE ?endpoint= → forgotten
export const GET = guarded(async () => json({ configured: pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY || null }));

export const POST = guarded(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  const s = body && body.subscription;
  if (!s || typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) {
    return err("Ugyldig abonnement.");
  }
  await db()`insert into dash.push_subscriptions (endpoint, keys, user_name)
    values (${s.endpoint}, ${{ p256dh: s.keys.p256dh, auth: s.keys.auth }}, ${user.name})
    on conflict (endpoint) do update set keys = excluded.keys, user_name = excluded.user_name, failures = 0`;
  return json({ ok: true });
});

export const DELETE = guarded(async (req) => {
  const endpoint = new URL(req.url).searchParams.get("endpoint") || "";
  await db()`delete from dash.push_subscriptions where endpoint = ${endpoint}`;
  return json({ ok: true });
});
