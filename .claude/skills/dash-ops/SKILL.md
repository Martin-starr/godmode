---
name: dash-ops
description: Write tasks, projects, checklist items and partners straight into dash.verminord.app from a conversation. Use whenever Martin says "legg til en oppgave", "nytt prosjekt", "ny partner", "sett oppgave X som ferdig", or dumps a list of things to do. The dashboard reads the Supabase tables below live, so a correct row is visible in the app immediately, no deploy needed.
---

# dash-ops: talk → dashboard

The dashboard at dash.verminord.app has no API key for outside callers. The
supported path from a Claude session is the Supabase MCP (`execute_sql`) against
project `ftjxpivxeavxdgcfpsba`, schema `dash`. Mirror the shapes the app's own
routes write (`app/api/tasks|projects|partners|checks/route.js`) so the UI
renders the rows exactly like rows created in the app.

## Ground rules

1. **Confirm before writing.** Echo the rows you intend to insert/update in one
   short table, then write. Never delete anything Martin did not name.
2. **Verify after writing.** `select` the rows back by id and show them.
   Never report "done" from the insert alone.
3. **One statement per write.** Do not combine insert + delete in one CTE;
   data-modifying CTEs in the same statement cannot see each other's rows.
4. `who` must be a name in `dash.team` (currently `Martin`, `Regnskap`;
   older rows also carry `Mathias`). Otherwise leave `who` as `''`.
5. Text is Norwegian, short titles, details in `descr`.

## Tasks — `dash.tasks`

| column | rule |
|---|---|
| title | required |
| sub | one line, optional |
| descr | free text |
| tag | `Ny` (default) · `Rutine` · `Avklar` |
| tagcls | `'gold'` when tag = `Avklar`, else `''` |
| who | team name or `''` |
| open | `1` open, `0` done (integer) |
| prio | `''` · `kritisk` · `høy` · `medium` · `lav` |
| due | `YYYY-MM-DD` or `''` (never NULL) |

```sql
insert into dash.tasks (title, sub, descr, tag, tagcls, who, open, prio, due)
values ('Ringe Dyrkeland om pall', '', 'Avtale leveringsdato', 'Ny', '', 'Martin', 1, 'høy', '2026-10-03')
returning id, title, tag, who, prio, due;

update dash.tasks set open = 0 where id = 5;   -- complete
```

## Projects — `dash.projects` + `dash.checklist`

| column | rule |
|---|---|
| col | `Planlagt` · `Pågår` · `Fullført` |
| tag | short uppercase label, e.g. `DRIFT`, `SALG`, `MATTILSYNET` (free text) |
| title / descr / who | as tasks |
| sort | `(select coalesce(max(sort), -1) + 1 from dash.projects)` |
| due | `YYYY-MM-DD` or `''` |

```sql
insert into dash.projects (col, tag, title, descr, who, sort, due)
values ('Pågår', 'SALG', 'Første pall til Dyrkeland', '', 'Martin',
        (select coalesce(max(sort), -1) + 1 from dash.projects), '')
returning id;

insert into dash.checklist (project_id, text, done, sort)
values (15, 'Bekrefte pris', 0,
        (select coalesce(max(sort), -1) + 1 from dash.checklist where project_id = 15))
returning id;
```

## Partners — `dash.partners`

| column | rule |
|---|---|
| name | required |
| type | free text, e.g. `B2B-salg`, `Støtte`, `Dokumentasjon`, `Råvare` |
| status | `Dialog` (default) · `Pågår` · `Avklar` · `Løpende` |
| tagcls | `'gold'` for `Avklar`, `'navy'` for `Pågår`, else `''` |
| next_step | one sentence |
| who | team name |

```sql
insert into dash.partners (name, type, status, tagcls, next_step, who)
values ('Klepp kommune', 'Råvare', 'Pågår', 'navy', 'Signere løvmold-avtale', 'Martin')
returning id;
```

## Reading current state first

```sql
select id, title, tag, who, prio, due from dash.tasks where open <> 0 order by id;
select id, col, tag, title, who from dash.projects order by sort;
select id, name, type, status, next_step, who from dash.partners order by id;
```

Match against existing rows before creating: "sett Dyrkeland-oppgaven som ferdig"
means update, not insert.
