# HANDOVER — lagd.html · Phase 7 (final push). Read this first, then go one-by-one.

## TL;DR
Phases 4–6 are DONE, committed, pushed (`04cc4df` on `claude/website-builder-ui-overhaul-oicatv`).
`lagd.html` is currently at that clean Phase-6 state (~812 KB, `node --check` OK, 3 premium templates).
Phase 7 = the **final push**: add a visible gallery "Premium" tab + integrate the user's queued
full-page templates **ONE AT A TIME, verifying each before the next** (hard lesson — see below).

## Ground truth / workflow
- File: `/home/user/godmode/lagd.html`. Branch `claude/website-builder-ui-overhaul-oicatv` (push here).
- After ANY edit: `node --check` via `scratchpad/check.sh` (extracts the main `<script>`).
- Verify rig: `scratchpad/harness/` — Playwright + vendored `libs/{gsap,ScrollTrigger,lenis}.min.js`.
  **Route CDNs by FILENAME** (templates use varied versions e.g. gsap@3.12.5, @studio-freight/lenis):
  match `/ScrollTrigger\.min\.js/`, `/\bgsap\.min\.js/`, `/lenis[^"']*\.min\.js/` → local copies.
  Load builder at `file://…/lagd.html`, `waitUntil:'domcontentloaded'`, wait for `window.__atelier`.
- Commit trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` /
  `Claude-Session: https://claude.ai/code/session_01X5F4MfWXzTbcznAsRrVyqE`. Do NOT model-id in commits.
  The stop-hook "Unverified" = missing GPG signature only (identity is correct); do not rewrite history.

## What's already shipped (Phases 4–6 — do NOT redo)
- 15 original editable flagship templates + capabilities (blackletter, spinbadge, converge, orbit-float, glitch).
- Phase 5: Signal/Tigerpress/Foundry upgraded; sections `ticker`, `testimonials`, gradient-text (`grad`); 6 Higgsfield images in `AI · Generated` image-library tab.
- Phase 6: **FLUID FX engine** `FLUID_FX_JS` (inline, no CDN): global byte-texture WebGL fluid-cursor canvas + SVG `feDisplacement` ripple; `data-fluid-fx="water|intense"` on any section (inspector "Liquid FX")/object; injected into exports via `siteUsesFluid()`. **3 bespoke premium templates** (kinetic-agency, editorial-luxury, fluid-portfolio) in `premiumTemplates` registry, loaded raw via Cmd+K → "✦ Premium — Full Page" (`loadPremiumTemplate`), guarded by `state.raw` on `rebuildFrame`/`doExport`. Engine injected per-template via `<!--FLUIDENGINE-->` marker (`premiumHTML(key)`).

## THE HARD LESSON (why we reset): verify self-containment BEFORE embedding
A premium template is embedded as ONE JS backtick string inside lagd's single `<script>`. It MUST be
fully self-contained. **PIXEL failed**: it had `<script src="script.js">` and NO inline `<style>`/JS →
rendered as unstyled text. **Pre-flight EVERY candidate** before embedding:
1. Has inline `<style>` (grep `-c '<style'` ≥1) AND inline `<script>` logic (not just external src).
2. NO external local refs: grep for `src="(?!http|data:)` and `href="[^h#]` and `assets/` and `./` — must be none (or repoint/inline them).
3. Escape for the backtick literal (order matters): `\`→`\\`, `` ` ``→`` \` ``, `${`→`\${`, then `</script`→`<\/script`. Reusable: `scratchpad/integrate.js` (`node integrate.js <src> <key> <name> <ico>` splices before the `premiumTemplates` `};`).
4. **Removal caveat:** an entry spans MANY lines (HTML newlines are preserved in the backtick string) — never delete "by first line". To back out, `git checkout -- lagd.html` and re-apply.
5. After embed: `node --check`, then `scratchpad/harness/incverify.js <key>` → assert `state.raw`, iframe renders, GSAP present (if used), **0 real console errors** (ignore offline font/image aborts), premium card appears in gallery tab. Screenshot via `onepshot.js <key> <scrollY>`.

## Gallery "Premium" tab (increment 0 — prototyped + verified this session; re-apply cleanly)
Exact edits (all near ~12122–12196):
- `GAL_TABS` → `[["web","Websites"],["premium","✦ Premium pages"],["mob",…],["dash",…],["mine",…]]`.
- `galRender`: add a branch `if(_galTab==="premium"){ Object.keys(premiumTemplates).forEach(k=>{ h+=galCardHTML(k, premiumTemplates[k].name.replace(/\s*✦\s*$/,"")); }); } else if(_galTab==="mine"){…} else {…}`.
- `galPrevSrc(k)`: first line inside `try{` → `if(premiumTemplates[k]){ const html=premiumHTML(k); _galPrevCache[k]=html; return html; }`.
- `pickTpl(k)`: top → `if(premiumTemplates[k]){ if(!_galFresh && !confirm(...)) return; _galFresh=false; closeTplGallery(); loadPremiumTemplate(k); return; }` then the existing body.
(Verified: tab shows all premium cards; clicking loads via `loadPremiumTemplate`; thumbnails render.)

## Queued templates — triage (uploads in `/root/.claude/uploads/86b3031b-27f9-5f86-a615-9bc8ff139373/`)
| Template | File | Class | Action |
|---|---|---|---|
| **Parallax Ridge** | `82c2f15d-parallaxridgestandalone.html` (15 KB SVG) | ✅ clean, self-contained | Embed as-is. **Was integrated + verified this session** (gsap 3.12.5, 0 errors) — re-apply. key `parallax-ridge`. |
| **Triptych preview** | `256e5543-preview.html` (40 KB, 14 small inline data-URIs) | ✅ likely clean | Pre-flight self-containment, then embed. |
| **Meridian** | `ceeb5671`/`335b2212` (37 KB, identical) | ⚠ self-contained code but 15 Unsplash imgs | Embed (network imgs like the rest); pre-flight it's inline CSS+JS (it's a config-driven engine — verify the engine is inline). |
| **PIXEL journey** | `ec8ec055-…` (7 KB) | ❌ BROKEN | External `script.js`, no inline CSS. **Needs its assets** (user may send a zip like Last Round). Skip until assets provided. |
| **Last Round** | ZIP `b1126b6f-1st_template_from_me.zip` = `index.html` (30 KB) + `assets/last-round/*` (5.2 MB jpg/webp) + READ-ME | ⚠ HEAVY (real images) | See decision below. |
| Jacquemus / Jeton / M+ / End Speciesism | `79cbd11a`,`b105b7a9`,`b4297e14`,`ce8bbc76` (1.4–6.8 MB) | ⛔ EXCLUDE | Multi-MB scrapes of real brand sites — bloat + non-original. Do not embed. |

Dedupe: Meridian ×2 identical; Last Round has 4 near-identical HTML copies (the ZIP one is canonical — it has assets).

## Decision needed at start of final push
**Last Round images (5.2 MB):** embedding as data-URIs adds ~7 MB → lagd.html ~8 MB (too heavy for a single-file builder). Options — pick with the user:
1. **Slim + embed (recommended):** downscale/compress the 18 images with ffmpeg (`/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux`) to ~1200px JPEG q70 ≈ 60–100 KB each → ~1.2 MB total → +~1.6 MB data-URIs (lagd ~2.4 MB). Rewrite `index.html`'s `assets/last-round/*` paths to the data-URIs, then embed as a premium template. True single-file.
2. **Keep Last Round standalone** (ship the zip as-is, not inside the builder).
3. Repoint to remote-hosted images (needs hosting).

## Phase 7 execution (ONE AT A TIME — user directive, strict)
Per template: pre-flight self-containment → embed (integrate.js) → `node --check` → `incverify.js` (0 errors) → `onepshot.js` screenshot → **show the user, get the nod** → next. Accumulate commits; **one final push** at the end. Recommended order: Parallax Ridge → Triptych → Meridian → Last Round (slimmed). Then final regression (15/15 editable + all premium load), screenshots of the gallery Premium tab, commit + push, update this handover.

## Anchors (lagd.html, Phase-6 clean state)
`premiumTemplates` (~7536), `premiumHTML` (~8926), `loadPremiumTemplate` (~12655), Cmd+K group in `buildCommands` (~12554), `GAL_TABS` (~12122), `galRender`/`galPrevSrc` (~12160)/`pickTpl` (~12186), `state.raw` guards in `rebuildFrame` (~10451)/`doExport` (~11567). Fluid engine source: `scratchpad/harness/fluidengine.js`.
