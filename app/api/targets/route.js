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
      const min = Number(t.min);
      const max = Number(t.max);
      // A half-typed target (blank field mid-edit) must not become 0 and
      // flag every reading as a deviation — skip until both ends are numbers.
      if (!Number.isFinite(min) || !Number.isFinite(max) || t.min === "" || t.max === "") continue;
      await sql`insert into dash.targets (metric, min, max)
        values (${String(t.metric)}, ${min}, ${max})
        on conflict (metric) do update set min = excluded.min, max = excluded.max`;
    }
    const targets = await sql`select metric, min, max from dash.targets`;
    return json({ ok: true, targets });
  },
  { edit: true }
);
