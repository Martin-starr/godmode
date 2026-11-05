import { db } from "@/lib/db";
import { err, guarded } from "@/lib/http";
import { UUID } from "@/lib/v2";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// A photo taken with a log entry. Only for people who are logged in; the
// browser may keep it for a day, it never changes.
export const GET = guarded(async (req, { params }) => {
  const id = String(params.id || "");
  if (!UUID.test(id)) return err("Ugyldig id.", 400);
  const rows = await db()`select content_type, data from public.log_photos where id = ${id}`;
  if (!rows.length) return err("Fant ikke bildet.", 404);
  return new Response(rows[0].data, {
    status: 200,
    headers: { "Content-Type": rows[0].content_type, "Cache-Control": "private, max-age=86400" },
  });
});
