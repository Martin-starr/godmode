import crypto from "crypto";
import { db } from "@/lib/db";
import { json, err, withWatchdog } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// Sync endpoint for the /week checklist (public/week). Not tied to the
// dashboard login: the phone app sends the PIN from WEEK_PIN in an x-pin
// header. Data is one JSON object {date: {list, ts}}; PUT merges per date,
// newest ts wins, so two phones cannot overwrite each other's days.
const DATE = /^\d{4}-\d\d-\d\d$/;

async function gate(req) {
  const want = process.env.WEEK_PIN;
  if (!want) return err("WEEK_PIN er ikke satt på serveren.", 503);
  const got = String(req.headers.get("x-pin") || "");
  const same = got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (same) return null;
  await new Promise((r) => setTimeout(r, 1500)); // slow down guessing
  return err("Feil PIN", 401);
}

export async function GET(req) {
  const g = await gate(req);
  if (g) return g;
  try {
    const rows = await withWatchdog(() => db()`select data from dash.week_notes where id = 1`);
    return json({ data: rows[0]?.data || {} });
  } catch (e) {
    return err(e.message, 503);
  }
}

export async function PUT(req) {
  const g = await gate(req);
  if (g) return g;
  const inc = (await req.json().catch(() => ({}))).data;
  if (!inc || typeof inc !== "object") return err("Ugyldig data.");
  try {
    const data = await withWatchdog(async () => {
      const sql = db();
      const cur = (await sql`select data from dash.week_notes where id = 1`)[0]?.data || {};
      for (const [k, v] of Object.entries(inc)) {
        if (!DATE.test(k) || !v || !Array.isArray(v.list)) continue;
        if (!cur[k] || (v.ts || 0) > (cur[k].ts || 0)) cur[k] = { list: v.list.slice(0, 200), ts: v.ts || 0 };
      }
      await sql`update dash.week_notes set data = ${sql.json(cur)}, updated_at = now() where id = 1`;
      return cur;
    });
    return json({ data });
  } catch (e) {
    return err(e.message, 503);
  }
}
