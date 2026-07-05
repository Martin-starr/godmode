import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;

export const PUT = guarded(
  async (req) => {
    const body = await req.json();
    if (!Array.isArray(body.targets)) return err("targets mangler.");
    const sql = db();
    for (const t of body.targets) {
      if (!t.metric) continue;
      await sql`insert into dash.targets (metric, min, max)
        values (${String(t.metric)}, ${Number(t.min) || 0}, ${Number(t.max) || 0})
        on conflict (metric) do update set min = excluded.min, max = excluded.max`;
    }
    return json({ ok: true });
  },
  { edit: true }
);
