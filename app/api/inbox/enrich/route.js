import { db } from "@/lib/db";
import { json, err, guarded, withWatchdog } from "@/lib/http";
import { aiEnabled, claude, draftReply } from "@/lib/ai";
import { ok as markOk, fail as markFail } from "@/lib/integrations";

export const runtime = "nodejs";
export const maxDuration = 60;

// Triage of open inbox rows with Claude. The deterministic bridge sync
// inserts every thread with a heuristic one-liner ("Økonomi — sjekk beløp og
// forfall"); this route replaces those with a real summary and corrects
// category/priority, so important mail is flagged for the right reason.
//
// Each row is triaged ONCE: ai_triaged_at is stamped when it has been sent to
// Claude, and the sync clears it again when a thread gets a newer message.
// The cron used to re-send the 15 newest open rows every hour whether or not
// anything had changed — on an Opus-priced default, with no new mail for days —
// which is exactly the kind of quiet spend that empties an API balance. Now an
// hour with no new mail makes no API call at all. The "AI-triage" button in
// Innstillinger passes force and still re-triages the 15 newest on demand.
// At most 15 rows per call.
//
// Two auth paths:
//   1. Session with edit rights — the "AI-triage" button in Innstillinger.
//   2. Bearer CRON_SECRET — the Vercel cron. Without a scheduled call the
//      priority counts on Brief are guesswork until someone remembers to
//      press the button; a mail flagged wrong isn't flagged.
//
// After triage, best-effort drafts ONE email that needs a reply and has none
// yet (never touches Gmail — see lib/ai.js's draftReply). One per run, not
// all of them: this shares the same 60s budget as the triage call above it,
// and the cron runs hourly, so the backlog clears steadily without risking
// the whole call timing out over a burst of drafts. A draft failure is
// logged and swallowed — the triage result the caller actually asked for
// must never be lost because the bonus step underneath it had a bad moment.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "summary", "category", "priority"],
        properties: {
          id: { type: "integer" },
          summary: { type: "string" },
          category: { type: "string", enum: ["Svar kreves", "Til info"] },
          priority: { type: "string", enum: ["høy", "medium", "lav"] },
          noise: { type: "boolean" },
        },
      },
    },
  },
};

const SYSTEM =
  "Du trierer Verminord sin e-postinnboks. For hver e-post: skriv summary — én presis norsk setning om hva " +
  "avsenderen faktisk vil og hva Martin bør gjøre (ikke generiske fraser). Sett category 'Svar kreves' KUN når " +
  "et menneske venter på svar fra Verminord, ellers 'Til info'. priority 'høy' kun for myndigheter (Mattilsynet, " +
  "Statsforvalteren, kommune, Skatteetaten), betalingsfrister, kunder som venter, eller feil i Verminord-drift. " +
  "Nyhetsbrev, sosiale varsler og automatiske kvitteringer uten frist: noise=true. Ikke finn på innhold som ikke " +
  "står i utdraget.";

// Sends one batch of rows to Claude and writes the answers back. Returns the
// number of rows changed, or an error Response when the answer is unreadable.
async function triage(sql, rows) {
  let raw;
  try {
    raw = await claude({
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: rows
            .map(
              (m) =>
                "id=" + m.id + "\nFra: " + m.sender + "\nEmne: " + m.subject +
                (m.snippet ? "\nUtdrag: " + String(m.snippet).slice(0, 500) : "") +
                (m.summary ? "\nNåværende vurdering: " + m.summary : "")
            )
            .join("\n\n---\n\n"),
        },
      ],
      maxTokens: 2500,
      timeoutMs: 45000,
      outputFormat: { type: "json_schema", schema: SCHEMA },
      purpose: "inbox_triage",
    });
  } catch (e) {
    // dash.integrations.ai is otherwise never written — every AI feature
    // is on-demand, so nothing else calls ok()/fail() for it. This is the
    // one path that runs unattended on a schedule, which makes it the
    // right place to prove the key and model are actually still working.
    await markFail("ai", e.message);
    throw e;
  }
  await markOk("ai");

  // The rows were sent and paid for, so stamp them now. If the answer below
  // cannot be read, they keep their heuristic summary rather than being sent
  // again every hour; the Innstillinger button can retry them.
  const sentIds = rows.map((r) => Number(r.id));
  await withWatchdog(() => sql`update dash.inbox set ai_triaged_at = now() where id = any(${sentIds})`);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err("Klarte ikke å tolke svaret fra AI — prøv igjen.", 502);
  }

  const validIds = new Set(sentIds);
  let updated = 0;
  for (const it of parsed.items || []) {
    if (!validIds.has(Number(it.id))) continue;
    const res = await withWatchdog(
      () => sql`update dash.inbox set
          summary = ${String(it.summary).slice(0, 400)},
          category = ${it.category},
          priority = ${it.priority},
          status = ${it.noise ? "done" : "open"}
        where id = ${Number(it.id)} and status = 'open'
        returning id`
    );
    updated += res.length;
  }
  return updated;
}

async function enrich({ force = false } = {}) {
  if (!aiEnabled()) {
    return err("AI er ikke konfigurert — legg inn ANTHROPIC_API_KEY på Vercel-prosjektet verminord-dash.", 503);
  }
  const sql = db();
  const rows = await withWatchdog(
    () => sql`select id, sender, subject, summary, snippet, category, priority from dash.inbox
      where status = 'open' and (${force} or ai_triaged_at is null)
      order by received_at desc limit 15`
  );

  let updated = 0;
  if (rows.length) {
    const result = await triage(sql, rows);
    if (result instanceof Response) return result;
    updated = result;
  }

  // Best-effort draft of ONE reply that needs one. It runs even when there was
  // nothing to triage, so a draft that failed last hour is retried.
  let drafted = 0;
  try {
    const [needsDraft] = await withWatchdog(
      () => sql`select id, sender, subject, summary, snippet, received_at, category from dash.inbox
        where status = 'open' and category = 'Svar kreves' and draft_body = ''
        order by received_at desc limit 1`
    );
    if (needsDraft) {
      const text = await draftReply(needsDraft, { timeoutMs: 20000, purpose: "inbox_utkast_auto" });
      await withWatchdog(() => sql`update dash.inbox set draft_body = ${text} where id = ${needsDraft.id}`);
      drafted = 1;
    }
  } catch (e) {
    console.error("enrich: auto-draft skipped:", e.message);
  }

  return json({ oppdatert: updated, utkast: drafted, vurdert: rows.length });
}

export async function POST(req) {
  // Cron path — Vercel calls with a bearer secret and no session cookie.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === "Bearer " + secret) {
    try {
      return await enrich();
    } catch (e) {
      console.error("enrich cron failed:", e.message);
      return err("Enrich cron feilet: " + e.message, 500);
    }
  }
  // Human path — the AI-triage button. Session + edit rights required.
  return guarded(() => enrich({ force: true }), { edit: true, watchdog: false })(req);
}
