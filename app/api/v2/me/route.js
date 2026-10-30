import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";
import { canEdit } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// Who is signed in, plus the old sidebar's status line ("App-logg 02.08.26":
// the date of the newest manual log entry).
export const GET = guarded(async (req, ctx, user) => {
  const [r] = await db()`select to_char(max(date), 'DD.MM.YY') as d from public.logs`;
  return json({
    name: user.name,
    access: user.access,
    canEdit: canEdit(user),
    sync: r && r.d ? "App-logg " + r.d : "Ingen logg ennå",
  });
});
