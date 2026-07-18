# HANDOFF — Phase 4: rebuild the template library (15 unique flagship templates)

> Phases 1–3 (builder chrome + GSAP/Lenis motion engine) are DONE and on this branch.
> Phase 4 is a fresh, large piece of work. **This document is the handover** — open it at the
> start of the new session and execute Phase 4 from it.

## Mission / North Star
`lagd.html` is a single-file, no-code builder that exports ultra-premium, agency-grade websites.
The bar ("done" = producing sites at this level):
- https://www.ryanritzenthaler.com/ — blackletter mega-type + liquid/RGB-glitch distortion + spinning circular badge
- https://rblln.fr/en/agence — Lenis-smooth editorial, oversized type, image reveals
- https://www.brandappart.com/ — arc/orbit of floating cards, 3D tilt, dark & playful
- https://www.papertiger.com/ — giant overlapping type, converging client-name columns, horizontal-scroll chapters

## File & workflow
- Single file: `/home/user/godmode/lagd.html` (~12,357 lines; builder chrome lines 1–~1100, main `<script>` ~1103–12355).
- Repo: `martin-starr/godmode`, branch **`claude/website-builder-ui-overhaul-oicatv`**. Commit + push there only. Repo clones fresh each session, so this file is present on checkout.
- Commit trailers required:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01QQKoWu7cF4ziMybaRjTh9T`
- Do NOT put the model id in commits/PRs. Do NOT open a PR unless asked.

## What's already built (Phases 1–3) — do not re-do
- **Phase 1 — chrome**: glassmorphism panels (`--glass*`/`--blur` tokens ~line 15), premium canvas selection (sleek outline + accent glow, injected editor CSS ~line 4344), a hidden "Motion / Scroll animations" inspector tier, and a "✦ Premium — GSAP" group in ⌘K + ＋Add.
- **Phase 2 — engine**: GSAP core + ScrollTrigger + Lenis from **pinned jsDelivr CDN** (`GSAP_CDN_TAGS`, `siteUsesGsap(st)` right before `generateSiteHTML` ~line 8090), injected only when premium motion is used and only in Preview+Export (`!editMode`). 5 real premium section types in `SECTION_DEFS` (~line 1798): `pxhero`, `pximg`, `pxhscroll`, `pinreveal`, `velmarquee` — render cases in the central `renderSectionBase` switch (~line 5103), runtime in `siteJS` (the `try{ if(!reduced && window.gsap){...}}` block ~line 7855). Per-section `s.scroll` tier drives entrance/parallax/pin via a `data-ux` JSON hook (emitted in `renderSection` ~line 5688).
- **Phase 3 — control + safety**: per-block controls via `data-pxo` JSON + `PX_MAP` named→number maps (~line 3793); `pxLetters()`/`pxSplit()` character/line reveal (~line 3800); generic tier gained Playback (scrub), Stagger children, Rotate/Clip-wipe; **mobile safety via `gsap.matchMedia()`** — heavy pins/hscroll/parallax only ≥761px, graceful downgrade ≤760px (native swipe strip, simple fades, reduced parallax). CDN pins: gsap@3.13.0 (gsap.min.js + ScrollTrigger.min.js), lenis@1.1.20 (globals `gsap`, `ScrollTrigger`, `Lenis`).

## Template system mechanics (reuse these)
- `tpl(theme, fonts, scale, secs, title, opts)` (~line 2169) returns `{meta:{title},theme,fonts,scale,speed,cursor,grain,progress,underline,radius,sections}`. `opts.extra` = free-form state overrides — **this is how to set `lenis:true`, `snap`, `bgmorph`, `magnetic`, etc.** Block-form factories can post-mutate `header`, `intensity`, `balance`, section colors.
- `S(type, overrides)` (~line 2185) = `Object.assign(SECTION_DEFS[type].make(), overrides)`. Premium types work directly: `S("pxhero",{title:"…",reveal:"characters",speed:"fast",depth:"deep"})`.
- `TEMPLATES` (~line 2488) = key→factory map (~130 defined, 88 surfaced). `BUILTIN_TPL_OPTS` (~line 11239) = `[[key,label],…]`; **project type is encoded in the label emoji** (`📱` mobile, `📊` dash, else web) and read by `loadTemplateByKey` (~line 11951) + the gallery.
- `normalize(st)` (~line 1520): **`lenis` and `s.scroll` need NO backfill** — `lenis` read only in `generateSiteHTML`/`siteUsesGsap`; `s.scroll` read in `renderSection` with per-field fallbacks; premium sections get only generic backfill (harmless) and rely on inline render-case fallbacks. New templates using premium blocks + `lenis` + `s.scroll` pass through cleanly with zero normalize changes.
- **Gallery** (`#tplgal`, `galRender` ~11461, `galPrevSrc` ~11485): reads `BUILTIN_TPL_OPTS`, tabs `web/mob/dash/mine` (`GAL_TABS` ~11447), previews via `generateSiteHTML(stp,false,false)` in scaled `srcdoc` iframes — so premium templates animate live (GSAP loads). GOTCHA: thumbnails are ~0.21× and **not scrolled**, so scroll-driven motion shows only the at-rest frame — the top section (hero) must look great static; keep pinreveal/hscroll BELOW the fold so thumbnails read well.
- `portfolio` (line ~3183) is the template loaded as the default document at startup (line ~3740) — repoint this to one of the new keys when deleting the old library.

## Phase 4 scope (the work for the new session)
1. **Delete the entire built-in template library** — empty `TEMPLATES` + `BUILTIN_TPL_OPTS` (keep `blank`; repoint the startup default off `portfolio`). Leave `tpl`/`S` helpers and section defs intact. (Legacy factory keys can be dropped wholesale.)
2. **Author 15 brand-new templates**, each a UNIQUE signature (distinct theme/font pairing + distinct subset of premium blocks + distinct scroll behavior). No two share the same section+effect recipe. **Quality over quantity.** Recommended default: all **15 web** flagships (references are all web); mobile/dash starters dropped (project types still reachable via Blank). CONFIRM at session start (see Open decisions).
3. **Build the 2–4 signature capabilities the references demand** (below) so the templates can hit the bar — templates only showcase what the engine can do.

### Candidate 15 (distinct signatures — finalize copy/images in the new session)
1. **Nocturne** — dark agency; blackletter mega-hero + liquid distortion + rotating circular badge (Ryan Ritzenthaler); Lenis; char reveal.
2. **Broadsheet** — light editorial/longform; oversized serif; converging-columns index; subtle fade-ups; NO pins (rblln).
3. **Tigerpress** — bold agency (Paper Tiger); giant overlapping sans; horizontal-scroll chapters + marquee + converging client columns; mono + 1 accent.
4. **Orbit** — playful studio (Brand Appart); arc/orbit floating cards w/ scroll-float + 3D tilt; gradient accents; dark.
5. **Atelier** — fashion house; minimal luxury serif; velocity marquee + horizontal lookbook + char reveal; cream/black.
6. **Foundry** — SaaS/product; clean grid; scale-in + stagger; minimal parallax; pinned feature reveal; cool palette.
7. **Meridian** — photography; full-bleed parallax images (pximg) + pinned captions; dark, restrained.
8. **Cadence** — music/festival; velocity marquee + word wall; vivid; scroll-skew.
9. **Ledger** — personal CV; refined; pinned text reveal manifesto; warm neutral; gentle.
10. **Provisions** — restaurant/café; warm; parallax hero image + word-reveal menu; soft motion.
11. **Concrete** — architecture; brutalist; big type; horizontal project gallery + pinned stats; grayscale.
12. **Signal** — fintech; confident; scale-in + count-up; dark navy + electric accent.
13. **Kinship** — cause/nonprofit; emotive; pinned text reveal + parallax image; human palette.
14. **Voyage** — travel/hotel; cinematic parallax hero + horizontal destination scroll; warm.
15. **Rewind** — retro/experimental; RGB-glitch display + vivid; playful.

## New signature capabilities to build (priority order)
- **P1 Rotating circular badge** — SVG `<textPath>` around a circle that spins (CSS `@keyframes` rotate, or scroll-linked via GSAP). Add as a freeform element (extend `mkObj`/`EL_DEFS` ~line 11795 + `objHTML` ~line 5451) OR a small section adornment. Reusable; core to the Ryan-Ritzenthaler look.
- **P1 Blackletter/display font** — add a pairing to `FONTS` (Google Font, e.g. UnifrakturCook / Pirata One / a heavy display gothic) so Nocturne/Rewind can use it. Follow the FONTS entry shape (`url`, `head`/`body`, weights `w`).
- **P2 Converging-columns section** — new section type (or a `wordwall`/`marquee` variant) with two offset columns of names/words that drift toward center on scroll (Paper Tiger clients). SECTION_DEFS entry + `renderSectionBase` case + optional `data-ux`/GSAP.
- **P2 Orbit scroll-float** — inspect the existing `orbit` section (line ~2018) then enhance so cards float/rotate/scatter on scroll via GSAP (Brand Appart). May become `pxorbit` or an option on `orbit`.
- **P3 (stretch) RGB-glitch text** — chromatic-aberration hover/scroll on display headings (layered text-shadow or GSAP), distinct from the existing WebGL "liquid headline". For Rewind/Nocturne accents.

Each new section type = SECTION_DEFS entry (make+fields) + `renderSectionBase` case + optional CSS in `siteCSS` (append before its closing backtick) + optional runtime in `siteJS` (append inside the `try{ if(!reduced && window.gsap){...}}` block; put desktop-heavy motion inside the `gsap.matchMedia('(min-width:761px)')` scope). Add to `SEC_GROUPS` (~line 11802) if it should appear in ＋Add categories. Follow the Phase-2/3 patterns exactly.

## Critical gotchas (will bite otherwise)
- `siteCSS` (~line 3868→4900) and `siteJS` (~line 5727→7920) are **template literals**. Inside them: NO stray backticks, NO stray `${`. Interpolations only where intended.
- Any literal `</script>`/`<script>` emitted into output must be split as `'<scr'+'ipt>'` / `'</scr'+'ipt>'` (see `GSAP_CDN_TAGS`) or it breaks the builder's own parser.
- `data-ux` / `data-pxo` are serialized with `esc(JSON.stringify(x)).replace(/'/g,"&#39;")` and read with `JSON.parse(getAttribute(...))`. Schema-free — extra keys ride through.
- Motion targets block-scoped nodes, NEVER `.wrap` (the skew loop owns `.wrap` transforms).
- Reduced-motion: whole runtime gated on `!reduced`; keep it.
- Sandbox is OFFLINE for CDNs (jsDelivr blocked, npm registry allowed). Real users' browsers load fine.
- Content must render fully with NO JS (progressive enhancement); GSAP only enhances.
- After ANY edit, syntax-check: extract the main `<script>` body and run `node --check` before testing (the template literals hide errors from the eye).

## Verification harness (rebuild it — scratchpad is ephemeral)
```
cd <session scratchpad dir>
npm init -y && npm i playwright-core@1.48.0
mkdir vendor && cd vendor && npm pack gsap@3.13.0 lenis@1.1.20
# tar-extract each; copy dist/gsap.min.js, dist/ScrollTrigger.min.js, dist/lenis.min.js into a flat libs/ dir
```
- Chromium: `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` (full chrome dropped old-headless — use the shell). `chromium.launch({executablePath, headless:true})`.
- Route jsDelivr → local libs in ONE `context.route('**/*', …)` handler (fulfill jsdelivr from libs, allow file/data/blob, abort the rest). Do NOT use two routes (the catch-all `continue()`s jsdelivr to the blocked network first).
- Load builder at `file:///home/user/godmode/lagd.html`, `waitUntil:'domcontentloaded'` (the `load` event never fires — external subresources hang). Dismiss the gallery (`#tplgal-blank`) if open.
- Test EXPORT at controlled widths: `generateSiteHTML(state,false)` → write to a file → load standalone at 1440 and 375; assert `ScrollTrigger.getAll().filter(t=>t.pin).length` >0 desktop / ===0 mobile.
- Screenshots: GSAP rAF can't be frozen — screenshot pages WITHOUT an infinite marquee, or set the iframe `src='about:blank'` for pure chrome shots; use `{animations:'disabled', timeout:15000}`.

### What to verify for Phase 4
- Each of the 15: loads via `loadTemplateByKey`, `normalize` doesn't throw, renders in Preview with no console errors, GSAP triggers attach, gallery thumbnail (`galPrevSrc`) shows a good at-rest hero.
- Desktop vs mobile: pins present ≥761px, zero ≤760px, content still readable.
- New capabilities: rotating badge spins; blackletter font loads; converging-columns/orbit-float animate; each used in ≥1 template.
- Regression: builder chrome intact, ⌘K + ＋Add still list the premium group, ordinary export stays CDN-free.

## Definition of done
15 distinct, polished templates in the gallery, each exercising a different slice of the premium engine, collectively covering all references' signature moves; the 2–4 new capabilities shipped and used; all verifications green; committed + pushed.

## Open decisions to confirm at session start
1. 15 all-web, or a mix incl. mobile/dash? (recommend all-web; drop mobile/dash starters.)
2. Which new capabilities to build now vs defer? (recommend P1+P2; P3 glitch optional.)
3. Keep gallery flagship-✦ ordering / tab names as-is? (recommend yes.)

## Inventory — themes / fonts / reusable sections
**THEMES** — `const THEMES` (~line 1138), 44 keys. Dark-bg: `natt, skog, grafitt, noir, ember, kveld, plomme, kobber, havblaa, karbon, skumring, lanternnatt, solefall, velmont`. Light/other: `papir, jaeren, galleri, roedjord, sand, rose, isblaa, smie, stein, kritt, mose, terrakotta, oliven, kobolt, korall, lavendel, blaagraa, parlor, soleil, koralvarme, triptik, ledgernoir, tegl, margin, brann, monokrom, pinekrem, leirkrem, signalsand, rustpapir`. Each carries MOOD_TAGS (`THEME_TAGS` ~1192). Custom palettes can also be authored.

**FONTS** — `const FONTS` (~line 1212), 40 keys (Head/Body). Display: `poster`(Anton), `svartgrotesk`(Archivo Black), `storslatt`(Bodoni Moda), `abril`(Abril Fatface), `skarp`(Unbounded), `brutal`(Archivo Black/Space Mono), `avant`(Syne). Serif/editorial: `editorial`(Fraunces), `gallery`(Cormorant), `klassisk`(Playfair), `garamond`(EB Garamond), `luksus`(DM Serif), `krimson`(Crimson), `redaksjon`(Instrument Serif), `libre`(Libre Baskerville), `spektral`(Spectral), `tidlos`(Source Serif). Sans/tech: `sveitsisk`(Inter Tight), `moderne`(Space Grotesk), `arkiv`(Archivo/IBM Plex Mono), `teknisk`(JetBrains Mono), `kondens`(Oswald), `bricolage`, `presise`(Sora), `rundet`(Baloo 2). **UNUSED / free:** `slab, elegant, epilog, abril, skarp, chivo`. **NO blackletter font exists → ADD one (P1).**

**Reusable showcase sections in SECTION_DEFS** (compose alongside premium blocks for variety):
`wordwall` (1991), `orbit` (2018), `layers` (2010, multi-speed stacked parallax), `cascade` (2000, pinned heading + fading list), `filmstrip` (1901), `pinned` (1908), `zoom` (1916, grows to full-bleed), `marquee` (1982, **already has `react:true` scroll-velocity coupling**), `logos` (1957), `gallery` (1883, `depth`+`pxin` inner-parallax; `splitscroll` variant), `split` (1872, `parallax:true`), plus `stats`, `timeline`, `prose`, `alternate`, `catalog`, `pricing`, `faq`, `cta`, `newsletter`, `footer`, `team`, `list`, `quote`.
Premium↔ordinary map: `pxhero`↔`hero`/`statement`; `pximg`↔`zoom`/`split(parallax)`/`layers`; `pxhscroll`↔`hscroll`/`filmstrip`; `pinreveal`↔`statement`/`pinned`/`cascade`; `velmarquee`↔`marquee`/`logos`.

**Concrete pairing suggestions for the 15** (real keys; adjust freely):
1 Nocturne → `natt`/`noir` + new blackletter (fallback `svartgrotesk`), Lenis. 2 Broadsheet → `papir`/`margin` + `editorial`/`redaksjon`. 3 Tigerpress → `monokrom` + `poster`. 4 Orbit → `karbon`/`skumring` + `moderne`/`bricolage`. 5 Atelier → `kritt`/`sand` + `storslatt`/`gallery`. 6 Foundry → `kobolt`/`isblaa` + `sveitsisk`. 7 Meridian → `noir`/`karbon` + `presise`/`teknisk`. 8 Cadence → `brann`/`solefall` + `brutal`/`skarp`. 9 Ledger → `papir`/`ledgernoir` + `tidlos`/`garamond`. 10 Provisions → `kveld`/`terrakotta` + `luksus`/`spektral`. 11 Concrete → `stein`/`grafitt` + `arkiv`/`kondens`. 12 Signal → `havblaa`/`kobolt` + `chivo`/`sveitsisk`. 13 Kinship → `leirkrem`/`mose` + `rundet`/`epilog`. 14 Voyage → `lanternnatt`/`velmont` + `gallery`/`garamond`. 15 Rewind → `parlor`/`kobolt` + `abril`/`poster` (+ RGB-glitch).

---
*Prepared at the end of the Phase 1–3 session. Start the new session by reading this file, confirming the three Open decisions, then executing Phase 4 scope in order (delete library → build capabilities → author the 15 → verify → commit).*
