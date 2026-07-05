import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

// Digest rows are written directly to dash.inbox by the daily e-mail triage
// routine; the app only needs to update their status.
export const PUT = guarded(
  async (req) => {
    const body = await req.json();
    const status = body.status === "done" ? "done" : "open";
    const sql = db();
    const rows = await sql`update dash.inbox set status = ${status} where id = ${Number(body.id)}
      returning id, gmail_id, received_at, sender, subject, summary, category, link, draft_url, status`;
    if (!rows.length) return err("Fant ikke e-posten.", 404);
    return json(rows[0]);
  },
  { edit: true }
);
