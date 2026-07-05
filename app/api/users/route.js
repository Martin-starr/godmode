import { db } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// Public: powers the user dropdown on the login screen.
export async function GET() {
  try {
    const sql = db();
    const rows = await sql`select name from dash.team order by id`;
    return json(rows);
  } catch {
    return json([]);
  }
}
