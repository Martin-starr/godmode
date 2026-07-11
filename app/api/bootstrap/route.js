import { db } from "@/lib/db";
import { canEdit } from "@/lib/auth";
import { json, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 25;
export const dynamic = "force-dynamic";

export const GET = guarded(async (req, ctx, user) => {
  const t0 = Date.now();
  const step = (msg) => console.log("[bootstrap +" + (Date.now() - t0) + "ms] " + msg);
  const sql = db();
  step("auth ok (" + user.name + ")");

  // Readings arrive continuously in public.logs via the phone logger; when a
  // new system name shows up there it must exist in dash.systems or the UI
  // can't offer it anywhere. Added as 'Tatt ut' so nothing clutters the
  // active views until Martin flips it on under Innstillinger.
  await sql`insert into dash.systems (id, status, sort)
    select s.system, 'Tatt ut',
           (select coalesce(max(sort), 0) from dash.systems) + row_number() over (order by s.system)
    from (select distinct system from dash.readings_all
          where system not in (select id from dash.systems)) s
    on conflict (id) do nothing`;
  step("system auto-add done");

  // Strictly sequential: concurrent queries pipelined onto one pooled
  // connection hang indefinitely behind Supavisor's transaction pooler
  // (single queries answer in <100 ms; a 9-way Promise.all never returns).
  const team = await sql`select id, name, role, access from dash.team order by id`;
  const systems = await sql`select id, status from dash.systems order by sort`;
  const readings = await sql`select id, rid, system, date, temp, ph, fukt, for_l, notat, avvik, logged_by, source, logged_at, editable
    from dash.readings_all order by date desc, logged_at desc nulls last, id desc`;
  const tasks = await sql`select id, title, sub, descr, tag, tagcls, who, open from dash.tasks order by id`;
  const projects = await sql`select id, col, tag, title, descr, who from dash.projects order by sort, id`;
  const checklist = await sql`select id, project_id, text, done from dash.checklist order by sort, id`;
  const partners = await sql`select id, name, type, status, tagcls, next_step, who from dash.partners order by id`;
  const files = await sql`select id, name, cat, ver, date, size, (content is not null) as stored from dash.files order by id desc`;
  const targets = await sql`select metric, min, max from dash.targets`;
  const inbox = await sql`select id, gmail_id, received_at, sender, subject, summary, category, link, draft_url, status, source, snippet, is_starred, priority, severity, draft_body
    from dash.inbox where status = 'open'
    order by is_starred desc,
      case priority when 'høy' then 1 when 'medium' then 2 else 3 end,
      received_at desc limit 20`;
  const inboxCounts = await sql`select count(*)::int as total,
    count(*) filter (where category = 'Svar kreves')::int as urgent,
    count(*) filter (where priority = 'høy')::int as high_priority
    from dash.inbox where status = 'open'`;
  const inboxLastSync = (await sql`select value from dash.meta where key = 'inbox_last_sync'`)[0]?.value || null;
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
    inbox,
    inboxCounts: inboxCounts[0] || { total: 0, urgent: 0 },
    inboxLastSync,
    aiEnabled: !!process.env.ANTHROPIC_API_KEY,
  });
});
