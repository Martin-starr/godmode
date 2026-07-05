import { db } from "@/lib/db";
import { setSession, verifyPassword } from "@/lib/auth";
import { json, err, withWatchdog } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return err("Ugyldig forespørsel.");
  }
  const { name, password } = body || {};
  if (!name || !password) return err("Fyll inn bruker og passord.");
  try {
    const sql = db();
    const rows = await withWatchdog(() => sql`select name, pw from dash.team where name = ${name}`);
    if (!rows.length || !verifyPassword(password, rows[0].pw)) {
      return err("Feil bruker eller passord.", 401);
    }
    setSession(rows[0].name);
    return json({ ok: true });
  } catch (e) {
    console.error("login failed:", e.message);
    return err("Databasen svarte ikke — prøv igjen.", 503);
  }
}
