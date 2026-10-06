# What the Anthropic API costs, and how to keep it small

Written 2026-10-06 after the API balance ran dry on 5 October. Numbers are
estimates from real token sizes and call counts, at Anthropic list prices
(Haiku 4.5 $1/$5, Sonnet 5.5 $2/$10, Opus 4.8 and Opus 5 $5/$25 per million
tokens in/out). The exact figures now come from `dash.ai_usage` (below).

## What calls the API

| Feature | When it runs | Model | About, per call |
|---|---|---|---|
| Inbox triage (`/api/inbox/enrich`) | hourly slot, but only does work when there is **new mail** | Haiku 4.5 | 0.8 cents for a full batch of 15; a fraction of that for 1–3 new mails |
| Inbox draft reply | once per mail that needs a reply, plus the manual button | Haiku 4.5 (`DASH_DRAFT_MODEL` to change) | under 1 cent |
| Weekly brief | Monday, once per week | Opus 5 with thinking (`SEO_BRIEF_MODEL`) | ~19 cents |
| Weekly blog draft | every other week | Opus 5 with thinking | ~13 cents |
| News scoring | weekly, only unscored headlines | Haiku 4.5 | ~3 cents per week |
| Lead scoring | weekly, only unknown candidates | Haiku 4.5 | ~2 cents per week |
| AI-visibility check | weekly, 3 questions with web search | Haiku 4.5 | ~10 cents per week |

A normal week costs about 35–50 cents, so roughly 2 dollars a month.

## What was burning money before (found 2026-10-06)

1. **The hourly inbox job ran on Opus 4.8 and re-read the same 15 e-mails every
   hour**, whether or not any new mail had arrived (none had for 7 days). About
   4 cents per call, all of it repeated work. GitHub fired roughly 5 of the 24
   hourly slots a day recently, so about 6 dollars a month; if it had fired every
   hour it would have been about 30.
2. **The dashboard default model was Opus 4.8**, five times the price of Haiku,
   for one-sentence summaries.
3. **Re-running the weekly pipeline paid for the brief again.** W37–W40 each ran
   two to six times (manual starts, a late cron after a manual start, retries
   after bugs), and every run bought a fresh Opus brief.

## What changed

- Default model is Haiku 4.5 (`DEFAULT_MODEL` in `lib/ai.js`). The weekly brief and blog
  draft keep their own, bigger model.
- Each inbox row is triaged once. `dash.inbox.ai_triaged_at` is stamped when it has
  been sent; the sync clears it when a thread gets a newer message. An hour
  with no new mail makes no API call. The "AI-triage" button in Innstillinger
  still re-triages the 15 newest on demand.
- `seo/run.mjs` reuses this week's brief and this week's AI-visibility answers if
  they exist. Pass `--force` (workflow input **force**) to buy new ones.
- Every call is logged to `dash.ai_usage` with a `purpose` tag and its cost.

## Reading the spend

```sql
select purpose, model, count(*) calls, round(sum(cost_usd)::numeric, 2) usd
from dash.ai_usage where at > now() - interval '30 days'
group by 1, 2 order by usd desc;
```

This only covers the dashboard and the SEO pipeline. Two other Vercel projects
(`verminord-app`, which serves log.verminord.app, and `verminord-newest-app`)
also hold an `ANTHROPIC_API_KEY`; their usage is not logged here. Check
console.anthropic.com → Usage, grouped by API key.

## The hard limit lives at Anthropic, not in code

Console → Plans & Billing: set a **monthly spend limit** (10–15 dollars is
plenty) and leave auto-reload off or small. That cap is enforced by Anthropic
even if some job misbehaves. Give each app its own API key (Console → API keys)
so the Usage page says which one spent what.

## Rules for new automation

- Never schedule AI work that re-reads data that has not changed. Stamp what has been processed.
- Default to Haiku. Reach for a bigger model only where a person reads the output
  and it matters (the weekly brief).
- Pass `purpose` on every `claude()` call.
