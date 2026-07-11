import { db } from "@/lib/db";
import { json, guarded } from "@/lib/http";
import { fetchGmailThreads, classifyThread } from "@/lib/bridge";

export const runtime = "nodejs";
export const maxDuration = 25;

// Deterministic on-demand Gmail sync: bridge → heuristic triage →
// upsert dash.inbox. Never deletes, and never overwrites the fields the
// daily Claude routine (or Martin) may have improved — summary, category,
// priority, draft_body and stars survive every sync untouched.
export const POST = guarded(
  async () => {
    const threads = await fetchGmailThreads();
    const sql = db();

    const seen = new Set();
    const rows = [];
    for (const t of threads) {
      if (!t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      const c = classifyThread(t);
      rows.push({
        gmail_id: t.id,
        received_at: t.date || new Date().toISOString(),
        sender: (t.from && (t.from.name || t.from.email)) || "Ukjent",
        subject: t.subject || "(uten emne)",
        snippet: t.snippet || "",
        link: t.permalink || "",
        source: "gmail",
        summary: c.summary,
        category: c.category,
        priority: c.priority,
        status: c.status,
      });
    }

    let nye = 0;
    let oppdatert = 0;
    if (rows.length) {
      const res = await sql`insert into dash.inbox ${sql(
        rows,
        "gmail_id",
        "received_at",
        "sender",
        "subject",
        "snippet",
        "link",
        "source",
        "summary",
        "category",
        "priority",
        "status"
      )}
        on conflict (gmail_id) do update set
          received_at = excluded.received_at,
          snippet     = excluded.snippet,
          link        = excluded.link,
          status      = case when dash.inbox.status = 'done'
                              and excluded.received_at > dash.inbox.received_at + interval '2 minutes'
                             then 'open' else dash.inbox.status end
        where excluded.received_at > dash.inbox.received_at
        returning (xmax = 0) as is_new`;
      nye = res.filter((r) => r.is_new).length;
      oppdatert = res.length - nye;
    }

    const lastSync = new Date().toISOString();
    await sql`insert into dash.meta (key, value) values ('inbox_last_sync', ${lastSync})
      on conflict (key) do update set value = excluded.value`;

    return json({ ok: true, nye, oppdatert, hentet: threads.length, last_sync: lastSync });
  },
  { edit: true }
);
