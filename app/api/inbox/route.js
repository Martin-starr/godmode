import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const COLS = "id, gmail_id, received_at, sender, subject, summary, category, link, draft_url, status, source, snippet, is_starred, priority, severity, draft_body";

export const GET = guarded(async (req) => {
  const u = new URL(req.url);
  const status = u.searchParams.get("status") || "open";
  const category = u.searchParams.get("category") || "";
  const source = u.searchParams.get("source") || "";
  const q = u.searchParams.get("q") || "";
  const limit = Math.min(Number(u.searchParams.get("limit")) || 50, 100);
  const offset = Number(u.searchParams.get("offset")) || 0;

  const sql = db();
  const conditions = [];
  const vals = [];

  if (status !== "all") {
    conditions.push("status = $" + (vals.length + 1));
    vals.push(status);
  }
  if (category) {
    conditions.push("category = $" + (vals.length + 1));
    vals.push(category);
  }
  if (source) {
    conditions.push("source = $" + (vals.length + 1));
    vals.push(source);
  }
  if (q) {
    conditions.push("(subject ilike $" + (vals.length + 1) + " or sender ilike $" + (vals.length + 1) + " or summary ilike $" + (vals.length + 1) + ")");
    vals.push("%" + q + "%");
  }
  if (u.searchParams.get("draft") === "1") {
    conditions.push("draft_body <> ''");
  }

  const where = conditions.length ? "where " + conditions.join(" and ") : "";

  const countRow = await sql.unsafe(
    "select count(*)::int as total from dash.inbox " + where,
    vals
  );
  const items = await sql.unsafe(
    "select " + COLS + " from dash.inbox " + where + " order by is_starred desc, received_at desc limit $" + (vals.length + 1) + " offset $" + (vals.length + 2),
    [...vals, limit, offset]
  );

  return json({ items, total: countRow[0].total });
});

// Digest rows are written directly to dash.inbox by the daily e-mail triage
// routine; the app only needs to update their status.
export const PUT = guarded(
  async (req) => {
    const body = await req.json();

    if (body.action === "star") {
      const sql = db();
      const rows = await sql`update dash.inbox set is_starred = ${!!body.is_starred} where id = ${Number(body.id)}
        returning ${sql.unsafe(COLS)}`;
      if (!rows.length) return err("Fant ikke e-posten.", 404);
      return json(rows[0]);
    }

    if (body.action === "edit") {
      const cats = ["Svar kreves", "Til info"];
      const prios = ["høy", "medium", "lav"];
      const category = cats.includes(body.category) ? body.category : null;
      const priority = prios.includes(body.priority) ? body.priority : null;
      if (!category && !priority) return err("Ingen gyldige felter å endre.");
      const sql = db();
      const rows = await sql`update dash.inbox set
          category = coalesce(${category}, category),
          priority = coalesce(${priority}, priority)
        where id = ${Number(body.id)}
        returning ${sql.unsafe(COLS)}`;
      if (!rows.length) return err("Fant ikke e-posten.", 404);
      return json(rows[0]);
    }

    if (body.action === "batch_done" && Array.isArray(body.ids)) {
      const sql = db();
      const ids = body.ids.map(Number);
      await sql`update dash.inbox set status = 'done' where id = any(${ids})`;
      return json({ ok: true, count: ids.length });
    }

    const status = body.status === "done" ? "done" : "open";
    const sql = db();
    const rows = await sql`update dash.inbox set status = ${status} where id = ${Number(body.id)}
      returning ${sql.unsafe(COLS)}`;
    if (!rows.length) return err("Fant ikke e-posten.", 404);
    return json(rows[0]);
  },
  { edit: true }
);
