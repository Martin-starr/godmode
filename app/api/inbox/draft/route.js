import { db } from "@/lib/db";
import { json, err, guarded, withWatchdog } from "@/lib/http";
import { aiEnabled, draftReply } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const COLS = "id, gmail_id, received_at, sender, subject, summary, category, link, draft_url, status, source, snippet, is_starred, priority, severity, draft_body";

// Generates a copy/paste-ready Norwegian reply draft for one inbox row and
// stores it in draft_body. Claude call runs outside the DB watchdog (it has
// its own timeout); the DB reads/writes stay watchdogged.
export const POST = guarded(
  async (req) => {
    if (!aiEnabled()) {
      return err("AI er ikke konfigurert — legg inn ANTHROPIC_API_KEY på Vercel-prosjektet verminord-dash.", 503);
    }
    const body = await req.json();
    const id = Number(body.id);
    if (!id) return err("Mangler id.");

    const sql = db();
    const rows = await withWatchdog(() => sql`select ${sql.unsafe(COLS)} from dash.inbox where id = ${id}`);
    if (!rows.length) return err("Fant ikke e-posten.", 404);
    const m = rows[0];

    const text = await draftReply(m);

    const updated = await withWatchdog(
      () => sql`update dash.inbox set draft_body = ${text} where id = ${id} returning ${sql.unsafe(COLS)}`
    );
    return json(updated[0]);
  },
  { edit: true, watchdog: false }
);
