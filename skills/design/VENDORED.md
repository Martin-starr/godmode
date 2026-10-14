# Vendored design skills

13 of the skills in this directory are vendored verbatim from
[`Leonxlnx/taste-skill`](https://github.com/Leonxlnx/taste-skill), installed with:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill
```

Per-skill source paths and content hashes are recorded in `taste-skill-lock.json`.

## Vendored skills

| Skill | Focus |
|-------|-------|
| `design-taste-frontend` | Anti-slop frontend for landing pages, portfolios, redesigns (v2, default) |
| `design-taste-frontend-v1` | Original v1 behaviour, kept for backward compatibility |
| `high-end-visual-design` | Agency-grade fonts, spacing, shadows, card structure, animation |
| `redesign-existing-projects` | Audits existing UI, removes generic AI patterns without breaking it |
| `minimalist-ui` | Warm monochrome, editorial, flat bento grids |
| `industrial-brutalist-ui` | Swiss print × military terminal, data-heavy dashboards |
| `gpt-taste` | UX/UI + GSAP motion, AIDA structure, layout randomization |
| `stitch-design-taste` | Generates `DESIGN.md` design systems for Google Stitch |
| `brandkit` | Brand-guideline boards, logo systems, identity decks |
| `imagegen-frontend-web` | One horizontal reference image per landing-page section |
| `imagegen-frontend-mobile` | Premium app-native mobile screen concepts |
| `image-to-code` | Generate the design image first, then implement to match |
| `full-output-enforcement` | Bans truncation and placeholder code in generated output |

The remaining skills in this directory (`components`, `mobile-design`, `react-bits`,
`screen-coder`, `ui-ux-pro-max`) are GODMODE's own and are not vendored.

## Updating

Re-run `npx skills add https://github.com/Leonxlnx/taste-skill` and copy the result over
these directories. Keep them unmodified — local edits turn every upstream update into a
manual merge. If a skill needs GODMODE-specific behaviour, add a separate skill that
wraps it rather than editing it in place.

## Caveats

- These are third-party prompts that run with full agent permissions. Review before use.
- Their frontmatter carries only `name` and `description` — no `model`, `effort`, or
  `user-invocable` keys, so they inherit defaults rather than following the GODMODE
  routing conventions used by the other skills here.
- `image-to-code` and `gpt-taste` are written for Codex and GPT respectively; they work
  under Claude Code but their tool-specific instructions do not all apply.
