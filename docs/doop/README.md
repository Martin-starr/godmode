# Setting up doop

[doop](https://github.com/kgoedecke/doop) is a shared design canvas that Claude Code can
draw on while you watch. You open a whiteboard in your browser, Claude builds web pages
into it live, and you comment on what you see instead of describing it in words.

These scripts set it up in one command and connect Claude Code to it — **without touching
your GODMODE setup**.

## Run one command

**macOS / Linux**

```bash
bash docs/doop/setup-doop.sh
```

**Windows (PowerShell)**

```powershell
powershell -ExecutionPolicy Bypass -File docs\doop\setup-doop.ps1
```

It installs doop into `~/doop` (or `%USERPROFILE%\doop`). Add a folder name at the end if
you want it somewhere else. Re-running is safe — it updates instead of starting over.

The script asks for your Anthropic API key. It is not shown as you type, and it is written
only to `doop/.env`, a file locked to your user account that git already ignores.

## Then three steps only you can do

1. **Start it** — `cd ~/doop` then `npm run dev`
2. **Sign up** — open <http://localhost:4300>, any email and password. It runs on your own
   machine, no email is sent, the account exists nowhere else.
3. **Approve Claude** — in a second terminal, while doop is still running:
   ```bash
   cd ~/doop && claude mcp login doop
   ```
   A browser window opens. Click approve. Once, and never again.

Now start Claude Code **from the `~/doop` folder** and say:

> Work on canvas `<id from the top bar>`. Design a landing page hero.

Stop doop with `Ctrl+C` in its terminal.

## About the API key

There are two separate things here, and only one of them costs API money.

| | Powered by | Costs |
|---|---|---|
| **Claude Code designing on the canvas** — the main event | your Claude subscription | nothing extra |
| **doop's own resident agents** — queue a card, @mention an agent | the API key in `.env` | Anthropic API credits |

So doop works fine with no key at all. The key only adds its built-in design team.

Two things worth knowing:

- The resident team defaults to **claude-opus-5** — best quality, priciest per design.
  `.env` has a commented `DOOP_AGENT_MODEL=claude-sonnet-5` line; uncomment it to spend
  noticeably less.
- **Do not set `ANTHROPIC_API_KEY` as a system-wide environment variable.** If you do,
  Claude Code itself starts billing to API credits instead of your subscription. Keeping
  it in `doop/.env` avoids that entirely — only doop's server reads that file. The script
  warns you if it finds one set globally.

## What this changes on your machine

Almost nothing, and all of it is reversible.

- **A new folder** (`~/doop`) holding the app, its dependencies, and a small local database
  in `doop/data/pg`. Delete the folder and everything is gone.
- **One line in your Claude Code config**, registering doop's tools **for the `~/doop`
  folder only**. Every other project — GODMODE, the Verminord dashboard, anything else —
  sees no change at all. Verified: `claude mcp list` shows doop inside `~/doop` and shows
  nothing anywhere else.

Nothing is written to `~/.claude/CLAUDE.md`, your skills, or your delegator rules.

To undo it completely:

```bash
cd ~/doop && claude mcp remove doop
cd ~ && rm -rf ~/doop
```

## If you want Claude to design based on an existing project

Run the same registration line inside that project's folder:

```bash
cd ~/my-project && claude mcp add --transport http doop http://localhost:4300/mcp
```

Claude then has both your code and the canvas. The trade-off is that the design tools now
load in that project too, so only do it where you actually want them.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Needs authentication` in `claude mcp list` | Normal until you do step 3 — run `claude mcp login doop` with doop running |
| Claude has no doop tools | You started Claude Code from the wrong folder — it must be `~/doop` |
| Tool calls fail with a connection error | doop is not running. `cd ~/doop && npm run dev` |
| Port 4300 or 4400 already in use | Something else is on those ports. Stop it, or set `PORT` for the backend |
| Screenshots fail | doop renders through your system Chrome. Install Chrome, or set `CHROME_PATH` |
| Resident agents do nothing | No API key in `.env`, or your API credits are empty |
