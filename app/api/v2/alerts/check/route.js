import crypto from "node:crypto";
import { db } from "@/lib/db";
import { json, err } from "@/lib/http";
import { evaluate, recordAndSend } from "@/lib/alerts";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Hourly from the scheduled job: find what holds now, store what is new,
// push it. Authorization: Bearer <CRON_SECRET>, like the other jobs.
function authorized(req) {
  const want = process.env.CRON_SECRET;
  if (!want) return false;
  const got = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function run(req) {
  if (!authorized(req)) return err("Ikke autorisert.", 401);
  const sql = db();
  const alerts = await evaluate(sql);
  const result = await recordAndSend(sql, alerts);
  return json({ ok: true, ...result, alerts: alerts.map((a) => a.key) });
}

export const GET = run;
export const POST = run;
