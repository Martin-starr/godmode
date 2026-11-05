import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// Links to the public status page (Innstillinger → Offentlig status).
// GET    every link, newest first, with views and last visit
// POST   { label } → a new link
// DELETE ?token=  → revoked; the address answers 404 from then on

const list = (sql) => sql`select token, label, created_by, created_at, revoked_at, views, last_seen_at
  from dash.status_links order by created_at desc`;

export const GET = guarded(async () => json({ links: await list(db()) }));

export const POST = guarded(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  const label = body && body.label ? String(body.label).trim().slice(0, 80) : "";
  if (!label) return err("Gi lenken et navn, f.eks. hvem den er til.");
  const sql = db();
  const token = randomBytes(18).toString("base64url");
  await sql`insert into dash.status_links (token, label, created_by) values (${token}, ${label}, ${user.name})`;
  return json({ links: await list(sql) });
}, { edit: true });

export const DELETE = guarded(async (req) => {
  const token = new URL(req.url).searchParams.get("token") || "";
  const sql = db();
  const rows = await sql`update dash.status_links set revoked_at = now()
    where token = ${token} and revoked_at is null returning token`;
  if (!rows.length) return err("Fant ikke lenken.", 404);
  return json({ links: await list(sql) });
}, { edit: true });
