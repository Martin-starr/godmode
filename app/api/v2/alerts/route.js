import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// What the app has told Martin about, newest first (the Varsler screen).
export const GET = guarded(async () => {
  const rows = await db()`select id, key, kind, title, body, href, fired_at
    from dash.alerts where fired_at > now() - interval '30 days'
    order by fired_at desc limit 100`;
  return json({ alerts: rows, server_time: new Date().toISOString() });
});
