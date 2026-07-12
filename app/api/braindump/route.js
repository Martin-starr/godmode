import { db } from "@/lib/db";
import { json, err, guarded, withWatchdog } from "@/lib/http";
import { aiEnabled, claude } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Turns a free-text braindump into structured operations against tasks and
// projects. Parse-only: the client shows the ops as a checklist and applies
// the approved ones through the existing CRUD endpoints — this route never
// writes anything.
const OPS = [
  "create_task",
  "update_task",
  "complete_task",
  "reopen_task",
  "delete_task",
  "create_project",
  "update_project",
  "delete_project",
  "add_check",
  "toggle_check",
];

const OPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ops"],
  properties: {
    ops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "note"],
        properties: {
          op: { type: "string", enum: OPS },
          id: { type: "integer" },
          project_id: { type: "integer" },
          title: { type: "string" },
          sub: { type: "string" },
          descr: { type: "string" },
          tag: { type: "string", enum: ["Ny", "Rutine", "Avklar"] },
          who: { type: "string" },
          col: { type: "string", enum: ["Planlagt", "Pågår", "Fullført"] },
          prio: { type: "string", enum: ["kritisk", "høy", "medium", "lav"] },
          due: { type: "string" },
          text: { type: "string" },
          done: { type: "boolean" },
          checks: { type: "array", items: { type: "string" } },
          note: { type: "string" },
        },
      },
    },
  },
};

function buildSystem(state) {
  return (
    "Du oversetter en hjernedump fra brukeren til konkrete operasjoner mot oppgave- og prosjektlisten.\n\n" +
    "Regler:\n" +
    "- Bruk KUN id-er som finnes i tilstanden under når du endrer/fullfører/sletter noe.\n" +
    "- Nye oppgaver: op create_task med title (kort), evt. sub (én linje), descr (detaljer), tag (Ny/Rutine/Avklar), who, prio (kritisk/høy/medium/lav) og due (ISO-dato) når teksten antyder hast eller frist.\n" +
    "- Nye prosjekter: op create_project med title, descr, col og evt. checks (liste med sjekkpunkter).\n" +
    "- update_task/update_project: oppgi id og bare feltene som skal endres.\n" +
    "- complete_task/reopen_task/delete_task: oppgi id. add_check: project_id + text. toggle_check: id + done.\n" +
    "- who må være ett av teammedlemmene i tilstanden (ellers utelat who).\n" +
    "- Slett aldri noe brukeren ikke eksplisitt ber om å slette.\n" +
    "- note: én kort setning på norsk som forklarer operasjonen for brukeren.\n\n" +
    "Nåværende tilstand:\n" + JSON.stringify(state)
  );
}

export const POST = guarded(
  async (req) => {
    if (!aiEnabled()) {
      return err("AI er ikke konfigurert — bruk «Kopier prompt-mal» og lim svaret inn i stedet.", 503);
    }
    const body = await req.json();
    const text = String(body.text || "").trim();
    if (!text) return err("Skriv inn en hjernedump først.");

    const sql = db();
    const state = await withWatchdog(async () => ({
      team: (await sql`select name from dash.team order by id`).map((t) => t.name),
      tasks: await sql`select id, title, sub, tag, who, open from dash.tasks order by id`,
      projects: await sql`select id, col, tag, title, who from dash.projects order by sort, id`,
      checklist: await sql`select id, project_id, text, done from dash.checklist order by sort, id`,
    }));

    const raw = await claude({
      system: buildSystem(state),
      messages: [{ role: "user", content: text }],
      maxTokens: 2000,
      outputFormat: { type: "json_schema", schema: OPS_SCHEMA },
    });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return err("Klarte ikke å tolke svaret fra AI — prøv igjen.", 502);
    }

    // Server-side sanity filter: drop ops referencing unknown ids or
    // missing required fields, so the preview never offers a no-op.
    // postgres.js returns bigint ids as strings while the AI schema emits
    // integers — normalize both sides to Number before comparing.
    const taskIds = new Set(state.tasks.map((t) => Number(t.id)));
    const projectIds = new Set(state.projects.map((p) => Number(p.id)));
    const checkIds = new Set(state.checklist.map((c) => Number(c.id)));
    const ops = (parsed.ops || []).filter((o) => {
      if (!OPS.includes(o.op)) return false;
      if (["update_task", "complete_task", "reopen_task", "delete_task"].includes(o.op)) return taskIds.has(Number(o.id));
      if (["update_project", "delete_project"].includes(o.op)) return projectIds.has(Number(o.id));
      if (o.op === "add_check") return projectIds.has(Number(o.project_id)) && !!o.text;
      if (o.op === "toggle_check") return checkIds.has(Number(o.id));
      if (o.op === "create_task" || o.op === "create_project") return !!(o.title || "").trim();
      return true;
    });

    return json({ ops });
  },
  { edit: true, watchdog: false }
);
