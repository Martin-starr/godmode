import { db } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export const POST = guarded(async (req, ctx, user) => {
  const { old, next } = await req.json();
  if (!next || String(next).length < 6) return err("Nytt passord må ha minst 6 tegn.");
  const sql = db();
  const rows = await sql`select pw from dash.team where name = ${user.name}`;
  if (!rows.length || !verifyPassword(old || "", rows[0].pw)) {
    return err("Nåværende passord stemmer ikke.", 401);
  }
  await sql`update dash.team set pw = ${hashPassword(String(next))} where name = ${user.name}`;
  return json({ ok: true });
});
