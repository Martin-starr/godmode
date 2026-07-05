import { db } from "@/lib/db";
import { canEdit } from "@/lib/auth";
import { json, guarded } from "@/lib/http";
import { sheetsConfig, syncSheets } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 25;
export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;
const SYNC_BUDGET_MS = 6000;

export const GET = guarded(async (req, ctx, user) => {
  const t0 = Date.now();
  const step = (msg) => console.log("[bootstrap +" + (Date.now() - t0) + "ms] " + msg);
  const sql = db();
  step("auth ok (" + user.name + ")");

  // Opportunistic hourly Sheets import. It gets a hard time budget and is
  // never allowed to delay or break the app: if it can't finish in time we
  // respond without it and it retries on a later bootstrap.
  let lastSync = (await sql`select value from dash.meta where key = 'last_sync'`)[0]?.value || null;
  step("meta read, lastSync " + lastSync);
  if (sheetsConfig() && (!lastSync || Date.now() - Date.parse(lastSync) > HOUR)) {
    try {
      await Promise.race([
        syncSheets().then(() => {
          lastSync = new Date().toISOString();
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("brukte mer enn " + SYNC_BUDGET_MS + " ms — fortsetter uten å vente")), SYNC_BUDGET_MS)
        ),
      ]);
    } catch (e) {
      console.error("[bootstrap] sheets sync: " + e.message);
    }
  }
  step("sync phase done");

  const [team, systems, readings, tasks, projects, checklist, partners, files, targets] = await Promise.all([
    sql`select id, name, role, access from dash.team order by id`,
    sql`select id, status from dash.systems order by sort`,
    sql`select id, system, date, temp, ph, fukt, for_l, notat, avvik, logged_by, source from dash.readings order by date desc, id desc`,
    sql`select id, title, sub, tag, tagcls, who, open from dash.tasks order by id`,
    sql`select id, col, tag, title, descr, who from dash.projects order by sort, id`,
    sql`select id, project_id, text, done from dash.checklist order by sort, id`,
    sql`select id, name, type, status, tagcls, next_step, who from dash.partners order by id`,
    sql`select id, name, cat, ver, date, size, (content is not null) as stored from dash.files order by id desc`,
    sql`select metric, min, max from dash.targets`,
  ]);
  step("payload queries done (" + readings.length + " readings)");

  return json({
    user: { name: user.name, access: user.access },
    canEdit: canEdit(user),
    team,
    systems,
    readings,
    tasks,
    projects,
    checklist,
    partners,
    files,
    targets,
    sheetsConfigured: !!sheetsConfig(),
    lastSync,
  });
});
