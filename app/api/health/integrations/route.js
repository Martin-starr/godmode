import { json, guarded } from "@/lib/http";
import { statuses } from "@/lib/integrations";

export const runtime = "nodejs";
export const maxDuration = 15;
// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

// One call the Brief page can poll to answer "is anything quietly dead?".
// `worst` is precomputed so the caller doesn't have to re-derive severity
// ordering to decide whether to show a banner.
const RANK = { grønn: 0, ukjent: 1, pauset: 1, gul: 2, rød: 3 };

export const GET = guarded(async () => {
  const rows = await statuses();
  const worst = rows.reduce(
    (acc, r) => (RANK[r.status] > RANK[acc] ? r.status : acc),
    "grønn"
  );
  return json({
    worst,
    needs_attention: rows.filter((r) => r.status === "gul" || r.status === "rød"),
    integrations: rows,
  });
});
