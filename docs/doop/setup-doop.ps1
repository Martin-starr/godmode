<#
  setup-doop.ps1 — one-command setup for doop (https://github.com/kgoedecke/doop)

      powershell -ExecutionPolicy Bypass -File setup-doop.ps1 [-Dir <path>]

  Default folder: %USERPROFILE%\doop

  What it does:
    1. clones (or updates) doop
    2. installs dependencies
    3. writes a .env with your Anthropic API key, locked to your user account
    4. registers doop's MCP server for THIS FOLDER ONLY, so the design tools
       load when you run Claude Code from the doop folder and nowhere else

  Safe to re-run. It never overwrites an existing .env without asking, and
  never re-registers an MCP server that is already connected (that would throw
  away your OAuth approval).
#>

[CmdletBinding()]
param(
  [string]$Dir = (Join-Path $HOME 'doop')
)

$ErrorActionPreference = 'Stop'
$Repo = 'https://github.com/kgoedecke/doop'

function Say  { param($m) Write-Host ''; Write-Host $m -ForegroundColor White }
function Ok   { param($m) Write-Host "  + $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "  ! $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host ''; Write-Host "x $m" -ForegroundColor Red; Write-Host ''; exit 1 }
function Have { param($c) [bool](Get-Command $c -ErrorAction SilentlyContinue) }

# ---------------------------------------------------------------- 0. checks
Say 'Checking what you have installed'

if (-not (Have git))  { Die 'git is not installed. Get it from https://git-scm.com/' }
if (-not (Have node)) { Die 'Node.js is not installed. Get it from https://nodejs.org/' }
if (-not (Have npm))  { Die 'npm is missing (it ships with Node.js). Reinstall Node.js.' }

$nodeMajor = [int](& node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 18) { Die "Node.js 18 or newer is required. You have $(& node -v)." }
Ok "Node.js $(& node -v)"
Ok "git $((& git --version).Split(' ')[2])"

$haveClaude = Have claude
if ($haveClaude) {
  Ok "Claude Code $((& claude --version).Split(' ')[0])"
} else {
  Warn 'Claude Code CLI not found - I will skip the connect step at the end.'
}

# A globally set ANTHROPIC_API_KEY makes Claude Code itself bill to API
# credits instead of your subscription. doop does not need it set globally -
# the key belongs in doop's .env file, which only doop's server reads.
if ($env:ANTHROPIC_API_KEY) {
  Warn 'ANTHROPIC_API_KEY is set as an environment variable.'
  Warn 'That makes Claude Code bill to API credits instead of your subscription.'
  Warn 'Consider removing it - doop reads its own .env file.'
}

# ------------------------------------------------------------- 1. get doop
if (Test-Path (Join-Path $Dir '.git')) {
  Say "Updating doop in $Dir"
  & git -C $Dir pull --ff-only
  if ($LASTEXITCODE -ne 0) { Die 'git pull failed.' }
  Ok 'up to date'
} else {
  if (Test-Path $Dir) { Die "$Dir already exists and is not a git clone. Move it or pick another folder with -Dir." }
  Say "Downloading doop into $Dir"
  & git clone $Repo $Dir
  if ($LASTEXITCODE -ne 0) { Die 'git clone failed.' }
  Ok 'cloned'
}

# --------------------------------------------------------- 2. dependencies
Say 'Installing dependencies (about a minute the first time)'
Push-Location $Dir
try {
  & npm install --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { Die 'npm install failed.' }
} finally { Pop-Location }
Ok 'installed'

# ------------------------------------------------------------------ 3. env
$EnvFile = Join-Path $Dir '.env'

if (Test-Path $EnvFile) {
  Say "Keeping your existing $EnvFile"
  Ok 'not touched'
  if (Select-String -Path $EnvFile -Pattern '^ANTHROPIC_API_KEY=.' -Quiet) {
    Ok 'an Anthropic API key is already set in it'
  } else {
    Warn "no ANTHROPIC_API_KEY line in it - doop's resident agents stay off"
    Warn 'add one by hand, or delete .env and re-run this script'
  }
} else {
  Say "Setting up doop's configuration"

  $apiKey = $env:DOOP_ANTHROPIC_KEY
  if (-not $apiKey) {
    Write-Host ''
    Write-Host '  Paste your Anthropic API key (starts with sk-ant-).'
    Write-Host '  It will not be shown as you type. Press Enter to skip.'
    Write-Host ''
    $secure = Read-Host -Prompt '  Key' -AsSecureString
    $apiKey = [System.Net.NetworkCredential]::new('', $secure).Password
  }

  if ($apiKey) {
    if ($apiKey.StartsWith('sk-ant-')) {
      Ok "key accepted ($($apiKey.Length) characters)"
    } else {
      Warn 'that does not look like an Anthropic key (they start with sk-ant-), saving it anyway'
    }
  } else {
    Warn "no key given - doop's own resident agents will stay off"
    Warn 'Claude Code designing over MCP still works fine without one'
  }

  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $secret = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''

  $keyLine = if ($apiKey) { "ANTHROPIC_API_KEY=$apiKey" } else { '#ANTHROPIC_API_KEY=' }

  $content = @"
# doop local configuration - written by setup-doop.ps1
# This file is git-ignored. Never commit it or paste it anywhere.

# Signs your login sessions. Random, generated once, keep it.
BETTER_AUTH_SECRET=$secret

# Powers doop's OWN built-in design agents (queue a card, @mention an
# agent). Billed to Anthropic API credits, NOT your Claude subscription.
# Claude Code designing over MCP does not use this key at all.
$keyLine

# Resident design tasks allowed per account.
RESIDENT_TASK_LIMIT=5

# The resident team defaults to claude-opus-5 - best quality, priciest.
# Uncomment the next line to spend noticeably less per design.
#DOOP_AGENT_MODEL=claude-sonnet-5

# Optional, free key from https://www.pexels.com/api/ - lets design
# agents search real stock photos instead of placeholder boxes.
#PEXELS_API_KEY=
"@

  # No BOM: Node's .env parser does not strip one, and a BOM would corrupt
  # the first variable name.
  [System.IO.File]::WriteAllText($EnvFile, $content, [System.Text.UTF8Encoding]::new($false))

  if ($IsWindows -ne $false) {
    # Strip inheritance and grant only the current user.
    & icacls $EnvFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  }
  Ok "wrote $EnvFile (readable only by you)"
}

# ------------------------------------------------------- 4. connect Claude
if ($haveClaude) {
  Say 'Connecting Claude Code to doop'
  Push-Location $Dir
  try {
    & claude mcp get doop *> $null
    if ($LASTEXITCODE -eq 0) {
      Ok 'already connected in this folder - leaving your approval alone'
    } else {
      & claude mcp add --transport http doop http://localhost:4300/mcp
      Ok "registered for $Dir only"
      Warn 'not approved yet - see step 3 below'
    }
  } finally { Pop-Location }
}

# ----------------------------------------------------------------- 5. done
Write-Host ''
Write-Host 'Setup finished. Three things left, and they need you:' -ForegroundColor White
Write-Host @"

  1. Start it:        cd $Dir
                      npm run dev
  2. Open the app:    http://localhost:4300
                      Sign up with any email and password. It is your own
                      machine - no email is actually sent, and the account
                      only exists locally.
  3. Approve Claude:  in a SECOND terminal, with doop still running:

                          cd $Dir
                          claude mcp login doop

                      A browser window opens. Click approve. Once, forever.

Then, from $Dir, start Claude Code and say:

    Work on canvas <id from the top bar>. Design a landing page hero.

To stop doop: press Ctrl+C in the terminal running it.

The design tools only load when you run Claude Code from $Dir.
Every other project you have stays exactly as it is.
"@
