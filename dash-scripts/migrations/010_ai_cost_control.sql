-- 010_ai_cost_control.sql
--
-- Two things, both about knowing and limiting what the Anthropic API costs.
--
-- 1. dash.inbox.ai_triaged_at — set when a row has been sent to Claude for
--    triage. The hourly cron used to re-send the 15 newest open rows every hour
--    whether or not anything had changed; it now only sends rows where this is
--    null. The sync clears it when a thread gets a newer message.
--
-- 2. dash.ai_usage — one row per Anthropic call (lib/ai.js writes it), tagged
--    with what the call was for, so spend can be read per feature instead of
--    guessed from the bill.
--
-- Additive and safe to run before the code that uses it is deployed.

alter table dash.inbox add column if not exists ai_triaged_at timestamptz;

-- The 15 newest open rows were already triaged, every hour, for weeks. Stamp
-- them so the first cron run after deploy does not pay to do it again. Older
-- open rows stay null and get one pass.
update dash.inbox set ai_triaged_at = now()
where ai_triaged_at is null
  and id in (select id from dash.inbox where status = 'open' order by received_at desc limit 15);

create table if not exists dash.ai_usage (
  id                 bigserial primary key,
  at                 timestamptz not null default now(),
  purpose            text        not null,
  model              text        not null,
  input_tokens       integer     not null default 0,
  output_tokens      integer     not null default 0,
  cache_read_tokens  integer     not null default 0,
  cache_write_tokens integer     not null default 0,
  web_searches       integer     not null default 0,
  cost_usd           numeric(10,5) not null default 0
);
create index if not exists ai_usage_at_idx on dash.ai_usage (at desc);
alter table dash.ai_usage enable row level security;

-- Spend per feature, last 30 days:
--   select purpose, model, count(*) calls, round(sum(cost_usd)::numeric, 2) usd
--   from dash.ai_usage where at > now() - interval '30 days'
--   group by 1, 2 order by usd desc;
