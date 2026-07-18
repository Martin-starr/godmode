# Next-session kickoff prompt — Phase 4

Paste the block below into a fresh session to start Phase 4 (rebuilding the template library).
The full context lives in `HANDOFF-PHASE4.md` (same folder).

---

```
Continue the lagd.html premium website-builder project. Phases 1–3 are complete and on branch
claude/website-builder-ui-overhaul-oicatv.

First, read HANDOFF-PHASE4.md in the repo root — it's the full handover: the engine map (GSAP/Lenis,
the 5 premium blocks, s.scroll/data-ux/data-pxo), the template-system mechanics (tpl(), S(), TEMPLATES,
BUILTIN_TPL_OPTS, the gallery), the critical gotchas, the 15-template plan with theme/font pairings,
the new capabilities to build, and how to rebuild the Playwright verification rig.

Then execute Phase 4 — rebuild the template library. My confirmed decisions:
- Delete the entire built-in template library and author 15 brand-new web templates, each with its own
  unique style — a distinct theme/font pairing, a distinct subset of the premium blocks, and a distinct
  scroll behavior. No two templates share the same section + effect recipe. Quality over quantity. Drop
  the mobile/dashboard starters (repoint the startup default off `portfolio`).
- Build the signature capabilities first so the templates can hit the reference bar (ryanritzenthaler.com,
  papertiger.com, brandappart.com, rblln.fr): the rotating circular badge, a blackletter/display font,
  the converging-columns section, and orbit scroll-float. RGB-glitch text is optional/stretch.
- Each template should read like a real agency site, and collectively they must exercise every premium
  capability.

Work autonomously (plan briefly if useful, then build). Rebuild the Playwright rig per the handover
(npm-pack gsap@3.13.0 + lenis@1.1.20, route the jsDelivr CDN to local copies) and verify: every template
loads via loadTemplateByKey without normalize throwing, renders in Preview with GSAP ScrollTriggers
attaching and no console errors, degrades on mobile (pinned triggers → 0 at ≤760px), and shows a good
at-rest hero in the gallery thumbnail. node --check the main script after edits. Commit + push to the
same branch with the required trailers. Finish by showing me screenshots of the new gallery and a few
flagship templates.
```
