# dash.verminord.app — Handover (as of 2026-07-07)

For a new session picking this up cold. Read this before touching anything.

---

## 1. What this is

`dash.verminord.app` is Verminord AS's internal ops dashboard: production
logging (temp/pH/fukt per composting system), §19 hygienisering, oppgaver,
prosjekter (kanban), partnere, SOP/dokumentbibliotek, innstillinger — plus
two things added this week: an **Innboks** (AI-triaged e-post digest) and an
automatic **Google Sheets sync**. Norwegian UI, IBM Plex Sans, navy/gull.

**Owner:** Martin (Martin@verminord.no). Non-technical, works from a phone a
lot — voice-dictated messages, expects things to just work.

## 2. Where everything lives

| What | Where |
|---|---|
| Source code | `martin-starr/godmode` repo, **branch `master`**, app at **repo root** (`app/`, `lib/`, `public/`, `dash-scripts/`) — *not* in a subfolder, so Vercel's git integration needs zero config |
| Deploy | Vercel project **`verminord-dash`** (`prj_HyMdRHHETbKIpP10tkXWu1mEBR6W`, team `team_JulMIEERdRwigjNyInMvAMAI`), **git-connected to master** — every push auto-deploys, no manual step |
| Domain | `dash.verminord.app` |
| Database | Supabase project **`ftjxpivxeavxdgcfpsba`** ("Verminord Internal App"), schema **`dash`**, role `dash_app` |
| Prior audit | `docs/verminord-dash-audit-2026-07-05.md` — the original rebuild story, still accurate for background |
| App README | `DASHBOARD.md` at repo root |

There is also an **unrelated** app in the same Supabase project (`verminord-internal`, the TV/Kontrollrom dashboard) with its own separate session doing Notion-sync work — different repo, different Vercel project, do not confuse the two.

## 3. The story so far (why it looks the way it does)

The app was originally deployed straight from an ephemeral Claude container
straight to Vercel via CLI — **the source code never existed anywhere**. It
was reconstructed from the production JS/CSS bundle on 2026-07-05 (see the
prior audit doc) and has been hardened through several real production
incidents since:

1. **Mobile nav only showed 4 of 8 sections** (horizontal scroll, no
   indicator) — fixed to a 2×4 grid, all sections visible, safe-area padding,
   16px inputs (no iOS zoom).
2. **`POST /api/tasks` / `/api/projects` hung 300s → 504.** Root cause:
   session-mode Supavisor pooling exhausted under serverless concurrency.
   Fixed: transaction pooler (port 6543), `prepare:false`.
3. **Still hung under `Promise.all` of 9 queries in `/api/bootstrap`.**
   Concurrent queries pipelined onto one connection wedge the pooler
   silently. Fixed: queries now run **sequentially**, not in parallel
   (`app/api/bootstrap/route.js`).
4. **Still wedged under overlapping requests** (two browser tabs/refreshes
   sharing one pooled connection). Fixed in `lib/db.js` / `lib/http.js`:
   - connection pool raised to `max: 10` (one connection per in-flight query)
   - every request wrapped in a **12s watchdog** (`withWatchdog` in
     `lib/http.js`) that returns a fast retryable 503 and **drops the pool**
     so the next request reconnects clean, instead of hanging forever.
   - Verified with a 10-way concurrent bootstrap hammer test (all 200 in
     ~200ms) and the full Playwright regression suite.
5. **Logo PNGs were lost** (never committed, only existed on the pre-rebuild
   Vercel deployment behind Vercel Authentication). Recovered via a temporary
   Vercel share-link + a one-shot GitHub Action
   (`.github/workflows/fetch-logos.yml`) that fetched and committed them —
   now permanently in `public/logo-white.png` / `public/logo-dark.png`.

**Current status: stable.** No 504s, no watchdog activations, confirmed
clean production traffic (logins, bootstraps, task CRUD) for several days
running as of this handover.

## 4. Two features built this week

### Innboks (Gmail triage digest)
- New table `dash.inbox` (gmail_id unique, received_at, sender, subject,
  summary, category, link, draft_url, status).
- Shown as a card list on the **Brief** page, above "Krever handling", with
  a "Ferdig" button to dismiss (`app/api/inbox/route.js` + `[id]/route.js`,
  UI in `app/page.js` `BriefView`).
- Populated by a **daily Claude routine** (see §5) that reads Gmail, picks
  only genuinely important items (authorities, customers, invoices,
  expiring credentials, Verminord infra failures), writes rows via Supabase
  `execute_sql`, and — for human emails needing a reply — creates a Norwegian
  draft directly in Gmail (linked via `draft_url`). Automated senders never
  get a draft. Nothing is ever sent automatically.
- Two daily runs so far have been clean: mostly noise (finn.no, social,
  bot comments) filtered out; the one recurring real signal has been the
  `verminord-interactive` GitHub Action **"Sync Google Sheet → data.json"**
  failing (now 4+ days straight) — flagged in Innboks, not yet acted on
  (that's a different repo/app, out of scope for this session unless asked).

### Google Sheets sync (zero-config)
- No Vercel env vars needed — the code path (`lib/sheets.js`,
  `DASH_SHEETS_ID`/`DASH_SHEETS_API_KEY` env detection) exists as a fallback
  but is unconfigured.
- Instead: an **hourly Claude routine** (see §5) reads the team's live
  spreadsheet directly via the Google Drive connector — spreadsheet ID
  `1l6buGufQJSfziF1sXq5T4yUcjmSBLs-_aKy61Q6xNOw` ("Verminord Logg (AKTIV -
  ikke slett)"), first tab's PRODUKSJON table — and upserts into
  `dash.readings` (`source='sheets'`) + touches `dash.meta.last_sync` via
  Supabase `execute_sql`.
- `Innstillinger → Datakilde` shows "Tilkoblet" based on `last_sync` being
  fresh (< 2h), not on env vars — see the `sheetsConfigured` logic in
  `app/api/bootstrap/route.js`.
- This sync also revealed a new system the app didn't know about
  (**Wedge 2**) — now added to `dash.systems`.
- Root cause of the original Sheets gap: the team's old "Verminord
  Produksjonslogg" Apps Script started failing July 4 (visible in Innboks).
  This new sync path doesn't depend on that script at all.

## 5. Automated routines currently running (this session's scope)

Created via `mcp__Claude_Code_Remote__create_trigger` (persistent, survive
session end):

| Trigger | Cron (UTC) | What |
|---|---|---|
| `trig_014ARPRS2fYdjzbEXoisSrK6` | `30 5 * * *` | Daily Gmail triage → writes `dash.inbox`, creates Gmail drafts for replies. Same persistent session as this one. |
| `trig_01Bc5EyuqFwn1cuzeGxjgGy2` | `10 * * * *` | Hourly Sheets → `dash.readings` sync. `create_new_session_on_fire: true` — spawns a fresh session each run, fully self-contained prompt (re-read it from the trigger if you need the exact wording). |

Both are designed to run silently and only interrupt Martin for genuinely
urgent things (authority deadline <48h, payment overdue, sync broken 3+
hours). **Do not delete or duplicate these** without checking `list_triggers`
first — a different, unrelated persistent session (`verminord-internal`
Notion-sync stopgap) also uses `send_later` heavily and will show up in the
same `list_triggers` call; don't touch its triggers.

## 6. Local dev environment (if you need to test again)

- Postgres runs locally at `localhost:5433` (user `pguser`, db `dashlocal`),
  started via:
  `su pguser -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/pgdata-local -l /var/lib/pgdata-local/log -o '-p 5433 -k /tmp' start"`
  — **it dies between sandboxed bash calls in this environment**, restart it
  every time before testing.
- Schema: `dash-scripts/schema.sql`. Seed: `dash-scripts/seed-local.sql`
  (needs a scrypt password hash passed as `-v pw=...`, see the file's
  header for the one-liner to generate it — test password is `test123`).
- Run: `DASH_DATABASE_URL="postgresql://pguser@localhost:5433/dashlocal" DASH_DB_NO_SSL=1 npm run start -- -p 3100` (build first with `npm run build`).
- E2E test script lives in the session scratchpad
  (`/tmp/claude-0/.../scratchpad/mobile-test.mjs` and `inbox-test.mjs`) —
  Playwright via `playwright-core` + `/opt/pw-browsers/chromium`, not
  committed to the repo (recreate if needed, they're short).
- **Production credentials are untouched** — this is all local-only test
  data, never overwrite prod.

## 7. Known open items / not yet done

- **Ask Martin** which senders/topics should always count as important for
  the Gmail triage (specific customers? Dyrkeland? Innovasjon Norge? his
  accountant Habiba?) — asked once (2026-07-06 morning), no answer yet as of
  this handover. Also confirm 05:30 UTC (~07:30 Norway time) is the right
  daily digest time.
- **`verminord-interactive`'s Sheet→data.json GitHub Action** has been
  failing 4+ days — surfaced in Innboks, not fixed (different repo, not
  asked to fix it yet).
- **Sheets sync only reads the summary "PRODUKSJON" table**, not the full
  raw "Produksjon" log tab in the same spreadsheet — could be extended to
  backfill more history if Martin wants deeper coverage.
- Nothing currently broken in `dash.verminord.app` itself as far as is
  known — the last several days of production logs are clean.

## 8. House rules learned this session

- Martin dictates messages by voice — expect typos/run-ons in his messages,
  read for intent.
- He wants things **pushed through end-to-end**, not handed back as
  instructions for him to run — he has limited screen/keyboard access at
  times. Prefer doing the work over explaining how to do it, but still ask
  before destructive/ambiguous steps.
- He explicitly authorized pushing directly to `master` for this app (no PR
  ceremony needed for iteration) once the initial PR (#13) was merged — this
  is somewhat unusual, don't assume it generalizes to other repos.
- Always verify production after deploying (health check / runtime logs),
  don't just trust that a green build means it works — three of the five
  incidents above only showed up under real concurrent traffic.
