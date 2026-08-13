# CLAUDE.md

Guidance for AI assistants working in this repository.

## This repo has two distinct halves — know which one you're touching

The repository is branded **GODMODE** (an AI-development-team config layer for
Claude Code), but the only *runnable application code* it contains is the
**Verminord internal dashboard** — a Next.js app deployed at `dash.verminord.app`.
Almost every code task lands in the dashboard half; the GODMODE half is markdown
configuration meant to be copied into a user's `~/.claude/` directory.

| Half | What it is | Lives in | Runnable? |
|------|-----------|----------|-----------|
| **Verminord Dashboard** | Next.js 14 internal ops app (`package.json` → `verminord-dashboard`) | `app/`, `lib/`, `dash-scripts/`, `public/`, `next.config.mjs`, `.github/workflows/`, `DASHBOARD.md` | Yes — `npm run dev` |
| **GODMODE config layer** | Skills library, orchestrator rules, delegator rules — a showcase Claude Code setup | `skills/`, `rules/`, `claude/CLAUDE.md`, `docs/architecture.svg`, `README.md`, `CONTRIBUTING.md` | No — markdown/config only |

When someone says "the app", "the dashboard", "fix the bug", or "add a feature",
they almost always mean the **Verminord Dashboard**. When they say "add a skill",
"orchestrator rules", or "the delegator", they mean the **GODMODE layer**.

> Note on language: `claude/CLAUDE.md` is the *shipped GODMODE product config* for
> a specific founder and says "communicate in Russian." That is not a directive for
> working on this repository. Here, commit messages and docs are English; the
> dashboard's user-facing strings are **Norwegian (bokmål)** — match that when
> editing UI copy or error messages.

---

## Part 1 — Verminord Dashboard (the application)

An internal operations dashboard for Verminord AS, a vermicompost (worm compost)
producer in Jæren, Norway. Tracks production readings (temp/pH/moisture),
production systems, §19 hygienization, tasks, projects (kanban), partners, an SOP/
document library, and a Gmail-backed inbox. Norwegian UI, IBM Plex Sans, navy/gold
theme.

Read `DASHBOARD.md` (Norwegian) for the product-level changelog and
`docs/verminord-dash-handover-2026-07-07.md` for reconstruction history — the app
was rebuilt from a production bundle after its original source was lost.

### Stack & commands

- **Next.js 14** (App Router) · **React 18** · plain **JavaScript** (no TypeScript)
- **Postgres** via the [`postgres`](https://www.npmjs.com/package/postgres) driver → Supabase
- Deployed on **Vercel**

```bash
npm install
npm run dev      # next dev — local development
npm run build    # next build — the de-facto CI / validation step
npm run start    # next start — serve a production build
```

There is **no test runner and no linter configured**. "Does it build" = `npm run build`.
Do not claim tests pass — there are none. Verify changes by building and by reasoning
through the code.

### Layout

```
app/
  layout.js          Root layout (lang="nb", theme color, metadata)
  page.js            The ENTIRE frontend — one 3,500-line client component
  globals.css        All styling (navy/gold, IBM Plex Sans, print rules)
  api/**/route.js    30 route handlers (App Router)
lib/                 Server-side helpers shared by the API routes
dash-scripts/
  schema.sql         Full `dash` schema (mirrors production)
  seed-local.sql     Local test data
  migrations/00N_*.sql  Ordered, hand-applied migrations
public/fonts, public/logo-*.png
```

### Frontend conventions (`app/page.js`)

- **Everything is in one file.** `app/page.js` is a single `"use client"` component
  (`export default function App`). Each screen is a top-level function component in
  the same file: `BriefView`, `LoggView`, `SystemsView`, `HygieneView`, `InboxView`,
  `TasksView`, `ProjectsView`, `FilesView`, `SettingsView`, plus `Chart`, `Logo`,
  `LoginView`, etc. Navigation is the `NAV_DRIFT` / `NAV_ARBEID` arrays near the
  bottom; the active screen is a `view` string in `App` state. Add a screen by adding
  a `*View` function + a nav entry — do not create new files unless a split is asked for.
- **All server data loads from one endpoint**: `GET /api/bootstrap` returns the whole
  app payload (`user, team, systems, readings, tasks, projects, checklist, partners,
  files, targets, inbox, ...`). Mutations hit the specific resource route, then the
  client updates local state (or calls `refreshAll`).
- **`api(path, opts)` helper** wraps `fetch` with a hard timeout (default 15 s) so a
  dead backend surfaces a Norwegian error instead of a button that silently hangs.
  Gmail/AI calls pass a longer `timeoutMs`.
- **Dates are local (Norwegian), never `toISOString()`** — UTC pushes summer-night
  entries onto the wrong day. Use the `isoDaysAgo` / local-date helpers already present.
- User-facing strings are Norwegian bokmål.

### API route conventions (`app/api/**/route.js`)

Every route follows this shape — match it exactly:

```js
import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";   // never edge — uses node crypto + pg sockets
export const maxDuration = 15;     // per-route budget; higher for slow routes

export const POST = guarded(async (req, ctx, user) => {
  const sql = db();
  // ...
  return json(result);
}, { edit: true });                // { edit:true } requires Admin/Redigering access
```

- **`guarded(handler, { edit, watchdog })`** (`lib/http.js`) wraps every handler: it
  checks the session, optionally checks edit permission, runs the work under a 12 s
  **watchdog**, and converts thrown errors into fast JSON failures. A `retryable`
  error → HTTP 503; anything else → 500. Auth failure → 401; missing edit rights → 403.
- **`watchdog: false`** is for routes that make slow external calls (Gmail bridge,
  Claude API) which manage their own timeouts — otherwise the watchdog would reset the
  DB pool for no reason. See `app/api/inbox/sync/route.js` and set a matching
  `maxDuration` (25–30 s).
- Return with `json(data, status)` / `err(message, status)` — error messages are
  Norwegian, user-facing.
- `[id]` dynamic segments live under `app/api/<resource>/[id]/route.js`.

### Database layer — the sharp edges (`lib/db.js`)

This layer exists specifically to avoid a 300 s / 504 hang the original deployment
suffered. Respect these or you will reintroduce it:

- **Connection string is *discovered*, not hardcoded.** `resolveDatabaseUrl()` checks
  `DASH_DATABASE_URL` / `DATABASE_URL` / `POSTGRES_URL` / … then falls back to any env
  var containing a `postgres://` URL. This keeps the existing Vercel env vars working
  regardless of their names.
- **Transaction pooler only.** Session-mode URLs (port `5432`) are auto-rewritten to
  the Supavisor transaction pooler (`6543`). `prepare: false` is mandatory for
  transaction pooling.
- **Queries in a request MUST run sequentially — never `Promise.all`.** Concurrent
  queries pipelined onto one pooled connection hang indefinitely behind Supavisor.
  `app/api/bootstrap/route.js` runs ~12 queries strictly in sequence on purpose. Do
  not "optimize" it into a parallel batch.
- `resetDb()` drops the pool when the watchdog fires so the next request reconnects fresh.

Data lives in the **`dash` schema** of the Supabase project. The `dash_app` role is
used in production.

### Data model (`dash-scripts/schema.sql`)

Tables: `team`, `systems`, `readings`, `tasks`, `projects`, `checklist`, `partners`,
`files`, `targets`, `meta`, `hygiene_imports`, `hygiene_readings`, `inbox`.

Two important cross-schema details:

- **`public.logs`** is written by a separate phone-logger app (`log.verminord.app`).
  The **`dash.readings_all`** view unifies dashboard-entered rows (`dash.readings`)
  and live phone rows (`public.logs`), dedups by `(system, date)`, and computes
  `avvik` (out-of-range) from `dash.targets`. Read readings through this view; never
  assume `dash.readings` is the whole picture.
- **A missing measurement is `NULL`, never `0`.** `lib/readings.js` `numOrNull()`,
  migration `003`/`004`, and the view all enforce this — a blank temp/pH/moisture is an
  absent reading and must not be fabricated as `0` (it would corrupt trend charts and
  inspection docs). Feeding amount (`for_l`) is the one field where `0` legitimately
  means "not fed."

**Migrations** are plain SQL in `dash-scripts/migrations/00N_name.sql`, applied **by
hand in order** (`psql`). There is no migration runner. When you change the schema:
add a new numbered migration AND update `dash-scripts/schema.sql` to keep the
canonical schema current.

### Auth (`lib/auth.js`)

- Sessions are **HMAC-signed cookies** (`dash_session`, 30-day expiry). The signing
  secret is discovered from env (`DASH_SESSION_SECRET` / …) with a deterministic
  fallback so sessions survive redeploys without extra config.
- `currentUser()` verifies the cookie then looks the user up in `dash.team`.
  `canEdit(user)` = access is `Admin` or `Redigering`.
- Passwords are stored as `salt:hash`. The original KDF is unrecoverable, so
  `verifyPassword()` tries several KDF candidates (scrypt / pbkdf2 / sha256 variants);
  **new** passwords are always written with `hashPassword()` (scrypt). Keep this
  multi-KDF verification — removing a candidate can lock existing users out.

### AI features (`lib/ai.js`) — optional, degrade gracefully

- A dependency-free Claude API client (raw `fetch`, key server-side only). **Always
  check `aiEnabled()` before calling `claude()`** — every AI feature must work with the
  key absent.
- Model is configurable via `DASH_AI_MODEL` (a Haiku model is the cheaper lever for
  drafts). Used by inbox triage/enrich (`/api/inbox/enrich`), draft replies, braindump
  (free-text → tasks/projects, with a no-AI fallback), and `/api/ai/test`.

### Gmail bridge (`lib/bridge.js`)

- Read-only Google Apps Script bridge fetches recent Gmail threads.
  `classifyThread()` is a deterministic heuristic triage (regex rules) so new mail is
  never invisible; the daily Claude routine later enriches but never re-touches rows
  the classifier inserted. Infra-failure mail (Verminord/GODMODE errors) is flagged
  important *before* the noise filter; OTP/marketing mail is auto-archived.
- The default script URL + token in this file were already public in the old client
  bundle; env vars (`APPS_SCRIPT_URL` / `APPS_SCRIPT_TOKEN`) override them. Do not add
  *new* secrets to source — use env vars.

### Deploy

- **Primary path: Vercel git integration** — pushing to `master` auto-deploys the
  `verminord-dash` Vercel project. No token needed.
- **Fallback: GitHub Actions** — `.github/workflows/deploy-verminord-dash.yml`
  (`workflow_dispatch`) only runs if a `VERCEL_TOKEN` repo secret exists. The Claude
  environment's network policy blocks `api.vercel.com`, so deploys happen via git
  integration, that workflow, or a local `npx vercel` (see `DASHBOARD.md`).
- `.github/workflows/fetch-logos.yml` is a one-shot utility that recovered the brand
  logo PNGs from the pre-rebuild deployment.

---

## Part 2 — GODMODE config layer

A curated Claude Code setup (skills + orchestrator/delegator rules) that ships in this
repo and is installed by copying into `~/.claude/` (see `README.md`). Editing these
files changes the *shipped configuration*, not this repo's own tooling.

- **`claude/CLAUDE.md`** — the global orchestrator config: "NEURON.ONE" adaptive-swarm
  model, the 16 orchestrator rules, ecomode (Haiku→Sonnet→Opus routing), the
  agent-communication protocol, and `/dispute` / `/interview` modes. This is the file
  users copy to `~/.claude/CLAUDE.md`.
- **`skills/`** — 56 `SKILL.md` files across categories: `security/`, `development/`,
  `infrastructure/`, `multimodel/`, `design/`, `data/`, `workflow/`, `quality/`,
  `testing/`, `business/`, `ai-training/`. Each skill is a markdown file with YAML
  frontmatter (`name`, `description`, `context: fork|inline`, `model`, `effort`,
  `allowed-tools`) followed by a numbered decision procedure. Some skills carry
  supporting `scripts/`, `data/`, or `references/`. When adding/editing a skill, follow
  the "Skill Design Standards" in `claude/CLAUDE.md` (SKILL.md < 500 lines, description
  < 250 chars keyword-first, third-person imperatives).
- **`rules/delegator/`** — triggers, model-selection, orchestration, and delegation
  format for routing work to external GPT (Codex) / Gemini advisors.
- **`docs/`** — `architecture.svg` plus the Verminord audit/handover docs.

`.claude/settings.json` (repo-local) enables the Firecrawl plugin marketplace.

---

## Working conventions & gotchas

- **Match the existing half.** Dashboard code is JS/Next.js with the patterns above;
  GODMODE content is markdown. Don't cross-contaminate.
- **JS import alias:** `@/*` maps to the repo root (`jsconfig.json`), e.g.
  `import { db } from "@/lib/db"`.
- **No TypeScript, no tests, no linter.** Validate with `npm run build`.
- **Never fabricate `0` for a missing reading** — use `NULL` (see the data-model note).
- **Never parallelize DB queries in a request** — sequential only (Supavisor pooler).
- **Keep AI features optional** — guard on `aiEnabled()`.
- **User-facing strings are Norwegian bokmål**; commits/docs are English.
- **Don't add secrets to source.** Use env vars; the pre-existing public tokens in
  `lib/bridge.js` are legacy, not a pattern to copy.

## Git workflow

- Develop on the designated feature branch; commit with clear English messages.
- Default branch is `master`; pushing there auto-deploys to Vercel — be deliberate.
- Push with `git push -u origin <branch>` and open a **draft PR** for the branch.
