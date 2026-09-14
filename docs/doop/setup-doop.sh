#!/usr/bin/env bash
#
# setup-doop.sh — one-command setup for doop (https://github.com/kgoedecke/doop)
#
#   bash setup-doop.sh [install-dir]      # default: ~/doop
#
# What it does:
#   1. clones (or updates) doop
#   2. installs dependencies
#   3. writes a .env with your Anthropic API key, chmod 600
#   4. registers doop's MCP server for THIS FOLDER ONLY, so the design tools
#      load when you run Claude Code from ~/doop and nowhere else
#
# Safe to re-run. It never overwrites an existing .env without asking, and
# never re-registers an MCP server that is already connected (that would throw
# away your OAuth approval).

set -euo pipefail

DIR="${1:-$HOME/doop}"
REPO="https://github.com/kgoedecke/doop"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 0. checks
say "Checking what you have installed"

command -v git  >/dev/null || die "git is not installed. Get it from https://git-scm.com/"
command -v node >/dev/null || die "Node.js is not installed. Get it from https://nodejs.org/"
command -v npm  >/dev/null || die "npm is missing (it ships with Node.js). Reinstall Node.js."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18 or newer is required. You have $(node -v)."
ok "Node.js $(node -v)"
ok "git $(git --version | awk '{print $3}')"

if command -v claude >/dev/null; then
  ok "Claude Code $(claude --version 2>/dev/null | awk '{print $1}')"
  HAVE_CLAUDE=1
else
  warn "Claude Code CLI not found — I will skip the connect step at the end."
  HAVE_CLAUDE=0
fi

# A globally exported ANTHROPIC_API_KEY makes Claude Code itself bill to API
# credits instead of your subscription. doop does not need it exported — the
# key belongs in doop's .env file, which only doop's server reads.
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY is exported in your shell."
  warn "That makes Claude Code bill to API credits instead of your subscription."
  warn "Consider removing it from your shell profile — doop reads its own .env."
fi

# ------------------------------------------------------------- 1. get doop
if [ -d "$DIR/.git" ]; then
  say "Updating doop in $DIR"
  git -C "$DIR" pull --ff-only
  ok "up to date"
else
  [ -e "$DIR" ] && die "$DIR already exists and is not a git clone. Move it or pick another folder."
  say "Downloading doop into $DIR"
  git clone "$REPO" "$DIR"
  ok "cloned"
fi

# --------------------------------------------------------- 2. dependencies
say "Installing dependencies (about a minute the first time)"
( cd "$DIR" && npm install --no-fund --no-audit )
ok "installed"

# ------------------------------------------------------------------ 3. env
ENV_FILE="$DIR/.env"

read_key() {
  # Reads the key without echoing it to the screen or the shell history.
  local key=""
  printf '\n  Paste your Anthropic API key (starts with sk-ant-).\n'
  printf '  It will not be shown as you type. Press Enter to skip.\n\n'
  printf '  Key: '
  read -rs key < /dev/tty || true
  printf '\n'
  printf '%s' "$key"
}

if [ -f "$ENV_FILE" ]; then
  say "Keeping your existing $ENV_FILE"
  ok "not touched"
  if grep -q '^ANTHROPIC_API_KEY=.' "$ENV_FILE"; then
    ok "an Anthropic API key is already set in it"
  else
    warn "no ANTHROPIC_API_KEY line in it — doop's resident agents stay off"
    warn "add one by hand, or delete .env and re-run this script"
  fi
else
  say "Setting up doop's configuration"

  API_KEY="${DOOP_ANTHROPIC_KEY:-}"
  if [ -z "$API_KEY" ] && [ -t 0 ]; then
    API_KEY="$(read_key)"
  fi

  if [ -n "$API_KEY" ]; then
    case "$API_KEY" in
      sk-ant-*) ok "key accepted (${#API_KEY} characters)" ;;
      *) warn "that does not look like an Anthropic key (they start with sk-ant-), saving it anyway" ;;
    esac
  else
    warn "no key given — doop's own resident agents will stay off"
    warn "Claude Code designing over MCP still works fine without one"
  fi

  if command -v openssl >/dev/null; then
    SECRET="$(openssl rand -hex 32)"
  else
    SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  fi

  umask 077
  {
    echo "# doop local configuration — written by setup-doop.sh"
    echo "# This file is git-ignored. Never commit it or paste it anywhere."
    echo
    echo "# Signs your login sessions. Random, generated once, keep it."
    echo "BETTER_AUTH_SECRET=$SECRET"
    echo
    echo "# Powers doop's OWN built-in design agents (queue a card, @mention an"
    echo "# agent). Billed to Anthropic API credits, NOT your Claude subscription."
    echo "# Claude Code designing over MCP does not use this key at all."
    if [ -n "$API_KEY" ]; then
      echo "ANTHROPIC_API_KEY=$API_KEY"
    else
      echo "#ANTHROPIC_API_KEY="
    fi
    echo
    echo "# Resident design tasks allowed per account."
    echo "RESIDENT_TASK_LIMIT=5"
    echo
    echo "# The resident team defaults to claude-opus-5 — best quality, priciest."
    echo "# Uncomment the next line to spend noticeably less per design."
    echo "#DOOP_AGENT_MODEL=claude-sonnet-5"
    echo
    echo "# Optional, free key from https://www.pexels.com/api/ — lets design"
    echo "# agents search real stock photos instead of placeholder boxes."
    echo "#PEXELS_API_KEY="
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "wrote $ENV_FILE (readable only by you)"
fi

# ------------------------------------------------------- 4. connect Claude
if [ "$HAVE_CLAUDE" = "1" ]; then
  say "Connecting Claude Code to doop"
  if ( cd "$DIR" && claude mcp get doop >/dev/null 2>&1 ); then
    ok "already connected in this folder — leaving your approval alone"
  else
    ( cd "$DIR" && claude mcp add --transport http doop http://localhost:4300/mcp )
    ok "registered for $DIR only"
    warn "not approved yet — see step 3 below"
  fi
fi

# ----------------------------------------------------------------- 5. done
cat <<EOF

$(printf '\033[1m%s\033[0m' "Setup finished. Three things left, and they need you:")

  1. Start it:        cd $DIR && npm run dev
  2. Open the app:    http://localhost:4300
                      Sign up with any email and password. It is your own
                      machine — no email is actually sent, and the account
                      only exists locally.
  3. Approve Claude:  in a SECOND terminal, with doop still running:

                          cd $DIR && claude mcp login doop

                      A browser window opens. Click approve. Once, forever.

Then, from $DIR, start Claude Code and say:

    Work on canvas <id from the top bar>. Design a landing page hero.

To stop doop: press Ctrl+C in the terminal running it.

The design tools only load when you run Claude Code from $DIR.
Every other project you have stays exactly as it is.
EOF
