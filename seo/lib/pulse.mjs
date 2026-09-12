// Pulse: the one stream everything the agent notices goes into.
//
// Every collector writes here instead of to its own log, so the dashboard
// has one place to look and the brief has one table to summarise. Inserts
// are keyed on (week, source, title): re-running a step for the same week
// never produces the same notice twice. In --dry-run the row is printed
// instead of written.
import { sql } from "./db.mjs";
import { truncate } from "./text.mjs";

export async function pulse(ctx, { source, kind, severity = "info", title, body = null, data = null }) {
  title = truncate(title, 200);
  if (ctx.dryRun) {
    ctx.log(source, `[pulse ${severity}] ${title}${body ? " — " + truncate(body, 120) : ""}`);
    return;
  }
  try {
    await sql()`insert into seo.pulse (week, source, kind, severity, title, body, data)
      select ${ctx.week}, ${source}, ${kind}, ${severity}, ${title}, ${body}, ${data ? JSON.stringify(data) : null}::jsonb
      where not exists (select 1 from seo.pulse where week = ${ctx.week} and source = ${source} and title = ${title})`;
  } catch (e) {
    // Recording must never break the thing it is observing (lib/integrations.js).
    ctx.log(source, "pulse-skriving feilet: " + e.message);
  }
}
