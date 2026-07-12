import { db } from "@/lib/db";
import { json, err, guarded, withWatchdog } from "@/lib/http";
import { aiEnabled, claude } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// Re-triage of open inbox rows with Claude. The deterministic bridge sync
// inserts every thread with a heuristic one-liner ("Økonomi — sjekk beløp og
// forfall"); this route replaces those with a real summary and corrects
// category/priority, so important mail is flagged for the right reason.
// Runs on the 15 newest open rows per call — the "AI-triage" button.

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

export const POST = guarded(
  async () => {
    if (!aiEnabled()) {
      return err("AI er ikke konfigurert — legg inn ANTHROPIC_API_KEY på Vercel-prosjektet verminord-dash.", 503);
    }
    const sql = db();
    const rows = await withWatchdog(
      () => sql`select id, sender, subject, summary, snippet, category, priority from dash.inbox
        where status = 'open' order by received_at desc limit 15`
    );
    if (!rows.length) return json({ oppdatert: 0 });

    const raw = await claude({
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
    });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return err("Klarte ikke å tolke svaret fra AI — prøv igjen.", 502);
    }

    const validIds = new Set(rows.map((r) => Number(r.id)));
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
    return json({ oppdatert: updated });
  },
  { edit: true, watchdog: false }
);
