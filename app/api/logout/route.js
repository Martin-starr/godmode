import { clearSession } from "@/lib/auth";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST() {
  clearSession();
  return json({ ok: true });
}
