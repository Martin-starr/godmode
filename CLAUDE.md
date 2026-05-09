# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

GODMODE is a **configuration library for Claude Code**, not a software project. It ships:

- `claude/CLAUDE.md` — global orchestrator rules (installed to `~/.claude/CLAUDE.md`)
- `skills/` — 50+ skill definitions (installed to `~/.claude/skills/`)
- `rules/delegator/` — GPT/Gemini delegation rules for the `claude-delegator` plugin

There is no build system, test runner, or package.json. "Development" here means editing markdown files.

## Installation Commands

```bash
# macOS/Linux: install to user Claude config
cp claude/CLAUDE.md ~/.claude/CLAUDE.md
cp -r skills/* ~/.claude/skills/
mkdir -p ~/.claude/rules/delegator && cp rules/delegator/* ~/.claude/rules/delegator/

# Verify skills installed
ls ~/.claude/skills/

# Scan for accidentally committed secrets before any push
grep -r "sk-\|api_key\|token\|password" skills/ rules/ claude/ --include="*.md"
```

## Architecture

### Three-Layer System

```
claude/CLAUDE.md          → Global orchestrator (permanent, always loaded)
skills/<category>/<name>/ → Dynamic agents (loaded per task, destroyed after)
rules/delegator/          → GPT + Gemini advisor routing
```

**Orchestrator** (`claude/CLAUDE.md`): The permanent Claude instance. Reads all 16 rules, knows all skills, decides which agents/skills to activate. Never delegates understanding — always specifies exact files, line numbers, and changes when briefing agents.

**Skills** (`skills/`): Each skill is a directory containing a `SKILL.md`. Skills are LEGO blocks combined 3–5 at a time to create a dynamic agent for a task. The agent lives until the task completes, then is destroyed.

**Delegator rules** (`rules/delegator/`): Define when and how to route work to GPT (via Codex MCP) or Gemini (via Gemini MCP) as external advisors. Four files:
- `orchestration.md` — full delegation flow, session management, retry protocol
- `triggers.md` — when to delegate (proactive semantic triggers + explicit requests)
- `model-selection.md` — which expert to use and Codex/Gemini API parameters
- `delegation-format.md` — mandatory 7-section delegation prompt format

### Memory Tiers

| Tier | Contents | When Loaded |
|------|----------|-------------|
| Hot  | `~/.claude/CLAUDE.md` + project `CLAUDE.md` | Always |
| Warm | Agent reports, skills | Per task |
| Cold | `docs/` | On demand |

### Agent Communication Protocol

Agents write results to `.claude/reports/` (not through orchestrator messages). Every inter-agent file uses a JSON envelope:

```json
{
  "envelope": { "from": "agent-name", "to": "orchestrator", "type": "result", "task_id": "...", "timestamp": "ISO-8601", "status": "success|failure|partial" },
  "payload": { ... }
}
```

Atomic writes: always write to `.tmp` first, then rename. Parallel agents use `isolation: "worktree"`.

## Skill File Conventions

Every skill directory must contain `SKILL.md`. Key rules:
- `SKILL.md` < 500 lines; move details to supporting files in the same directory
- `description` field < 250 chars; **keywords first**, include explicit negative triggers ("Don't use for...")
- Use third-person imperatives: "Creates..." not "I will create..."
- Each skill declares: `model` (haiku/sonnet/opus), `effort` (low/medium/high/max), `context` (fork/inline)
- Include decision trees with numbered steps, not prose paragraphs

**Triggering**: Skills auto-activate based on their description's keywords. Negative triggers ("Don't use for...") prevent false activations. Test a new skill's description against similar skills to avoid collisions.

## Ecomode (Model Routing)

| Complexity | Model | Examples |
|-----------|-------|---------|
| Simple | Haiku or Sonnet (effort: low) | Formatting, renaming, git ops |
| Medium | Sonnet (effort: medium) | Feature impl, bug fixes, code review |
| Complex | Opus (effort: high) | Architecture, security audit, disputes |

Always set the appropriate model when spawning agents — never use Opus for simple tasks.

## External Advisors

Five expert personas available via GPT (Codex MCP) or Gemini (Gemini MCP):

| Expert | Trigger Signals |
|--------|----------------|
| **Architect** | System design, tradeoffs, 2+ failed fix attempts |
| **Plan Reviewer** | "review this plan", before significant work |
| **Scope Analyst** | Vague requirements, "what am I missing" |
| **Code Reviewer** | "review this code", before merge |
| **Security Analyst** | Auth changes, sensitive data, "is this secure" |

Delegation protocol: (1) identify expert → (2) read their prompt file from `${CLAUDE_PLUGIN_ROOT}/prompts/[expert].md` → (3) notify user → (4) build 7-section prompt → (5) call MCP tool → (6) synthesize (never show raw output).

Multi-turn sessions use `threadId` returned by the initial call, passed to `*-reply` tools. Include full context in single-shot calls; use `*-reply` for retries with error history.

## /dispute Mode

Cross-model consensus protocol across Claude + GPT + Gemini:
- Round 1: All three give independent positions
- Round 2: Each sees all others' positions and critiques
- Round 3: Defense + concessions
- Rounds 4–5 if needed: Negotiation
- Output: consensus/majority/unresolved + recommendation → founder decides → record in project `MEMORY.md`

## Key Rules from `claude/CLAUDE.md` (summary for contributors)

1. **PLAN FIRST** — 3+ steps = plan mode, wait for approval
2. **DECOMPOSE** — 3+ files affected = subtasks; max 3–5 agents, 3–5 skills each
3. **VERIFY** — never say DONE without file path, test output, or command result
4. **SELF-IMPROVE** — always show diff and get confirmation before modifying `CLAUDE.md`
5. **AUTO-PRESETS** — UI task → add ui-design + ux-audit; API/backend → add security; deploy → add security + monitoring; critical code → run `/codex:adversarial-review` after
6. **SIMPLE TASKS** — no agents; orchestrator handles directly

## Editing Guidelines

When adding or modifying skills:
- Check for description keyword collisions against existing skills in the same category
- Validate any new externally-sourced skill with the `security/agent-guard` skill before installing
- Run `grep -r "sk-\|api_key" .` before committing to catch leaked credentials
- The `What NOT to duplicate` section in `claude/CLAUDE.md` lists rules already built into Claude Code — don't repeat them in project-level files

When modifying `claude/CLAUDE.md`:
- Show the diff to the user and get explicit approval — never silently modify
- Record the lesson in `MEMORY.md` if it's project-specific
