---
name: week-ops
description: Add, complete or read tasks on Martin's phone checklist at dash.verminord.app/week from a conversation. Use whenever Martin says "add to my week", "put on my list", "legg til på uka", "what's on my list today/this week", or names a day and a thing to do. The phone pulls the change the next time the app is opened or brought to the foreground, no deploy needed.
---

# week-ops: talk → the Week app

The Week app (`public/week/index.html`) keeps everything in ONE row:
`dash.week_notes` (id = 1) in Supabase project `ftjxpivxeavxdgcfpsba`, column
`data` (jsonb). Shape:

```json
{ "2026-10-16": { "list": [ { "text": "Call the vet", "done": false } ], "ts": 1792115548539 } }
```

- Key = local date `YYYY-MM-DD`. One list per day, max one sentence per task.
- Task fields: `text`, `done`; optional `from` (date it was carried from) and
  `moved` (date it was carried to — such a task is a greyed trail, not live).
- `ts` = milliseconds since epoch of the last change to that day. The phone
  and the server both keep the newer ts per day, so **every write must set
  ts to now** or the phone will overwrite it with its own copy.

Write with the Supabase MCP `execute_sql`. Mirror the ground rules of
`dash-ops`: echo what you will write, write one statement, select it back.

## Add a task to a day

Default day = today (Europe/Oslo) unless Martin names one. "Thursday" means the
next Thursday including today.

```sql
update dash.week_notes set
  data = jsonb_set(data, '{2026-10-16}', jsonb_build_object(
    'list', coalesce(data->'2026-10-16'->'list', '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object('text', 'Call the vet', 'done', false)),
    'ts', (extract(epoch from now()) * 1000)::bigint), true),
  updated_at = now()
where id = 1
returning data->'2026-10-16';
```

Several tasks on one day: chain more `|| jsonb_build_array(...)` in the same
statement. Several days: one statement per day.

## Complete (or un-complete) a task

Match on exact text; leave `moved` trail entries alone.

```sql
update dash.week_notes set
  data = jsonb_set(data, '{2026-10-16}', jsonb_build_object(
    'list', (select jsonb_agg(case when t->>'text' = 'Call the vet' and t->'moved' is null
                                   then t || '{"done": true}' else t end)
             from jsonb_array_elements(data->'2026-10-16'->'list') t),
    'ts', (extract(epoch from now()) * 1000)::bigint), true),
  updated_at = now()
where id = 1
returning data->'2026-10-16';
```

## Remove a task Martin names

```sql
update dash.week_notes set
  data = jsonb_set(data, '{2026-10-16}', jsonb_build_object(
    'list', (select coalesce(jsonb_agg(t), '[]'::jsonb)
             from jsonb_array_elements(data->'2026-10-16'->'list') t
             where t->>'text' <> 'Call the vet'),
    'ts', (extract(epoch from now()) * 1000)::bigint), true),
  updated_at = now()
where id = 1
returning data->'2026-10-16';
```

## Read

```sql
-- today
select data->'2026-10-16'->'list' from dash.week_notes where id = 1;
-- this week: every day key between Monday and Sunday
select key, value->'list' from dash.week_notes, jsonb_each(data)
where key between '2026-10-12' and '2026-10-18' order by key;
```

Report lists as the phone shows them: day name, then one line per live task,
ticked ones marked, `moved` entries omitted.

## Do not

- Delete days or tasks Martin did not name.
- Write a day without refreshing `ts`.
- Touch the dashboard tables (`dash.tasks` etc.) for this; that is `dash-ops`.
