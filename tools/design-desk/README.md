# Design Desk

A single-file proofing desk and mockup builder. Open `design-desk.html` in a browser —
no server, no build step, no install. Drop in an `.html`, `.pdf`, `.png`, `.jpg` or `.svg`
and work on it.

## Three modes

| Key | Mode | What it does |
|-----|------|--------------|
| `M` | **Marker** | Click anything to attach a note. Notes become numbered pins and export as a markdown brief. The artifact is never touched. |
| `V` | **Velg element** | Click to select and adjust type, colour and spacing. Content is never touched. |
| `R` | **Rediger** | The editing mode: write, delete, duplicate, move, insert, reorder. |

The mode is always named in the strip at the bottom-left, so it is never a mystery
whether a click is about to change the artifact.

## Editing (Rediger)

- **Click** selects. A second press-and-drag on the *same* element moves it — so a
  stray click can never nudge your layout.
- **Double-click** writes in the text. Paste arrives as plain text, `Enter` inserts a
  line break, and `⌘B`/`⌘I` are ignored, so no `<font>` soup ends up in the export.
  `Escape` cancels, clicking outside saves.
- **Right-click** opens a short menu: edit, duplicate, delete, move up/down,
  **select parent**, hide, mark, reset.
- **Delete** removes the selection. There is no confirmation dialog — `⌘Z` is the
  confirmation, and the undo button sits in the top bar.
- **Arrow keys** nudge 1 px, `Shift` 10 px. A run of nudges collapses into one undo step.
- Moving writes `transform: translate(…)` (or `left`/`top` on absolutely-positioned
  elements), so siblings never reflow. If an element cannot move without dragging its
  absolutely-positioned children with it, the move is refused rather than silently
  wrecking the layout — use **Flytt opp/ned** instead.

## Layers (Lag)

A live tree of the document. Sections are named by their heading, text by its own words.
Hovering a row outlines it on the plate; clicking selects it. Each row can be hidden or
deleted, and rows can be dragged to reorder — before/after only, never into another
container. A sticky **Du er i** strip names the section currently on screen.

## Type

A floating toolbar appears on the selection with font, size, weight, tracking, line
spacing, alignment and colour; `⋯` opens the full panel. The toolbar, its popovers and
the panel read and write through one path, so they can never disagree about a value.

The library carries ~80 families (Sans / Serif / Display / Mono / Handwriting) plus
system stacks, each row previewed in its own face and downloaded only when it scrolls
into view. Google families need a network connection; without one the picker says so and
the system stacks still work. **The per-family weight specs in `FONTS` are written by
hand and must stay that way** — the Google `css2` API answers `400 Bad Request` for a
weight a family does not have, so a derived spec would silently break half the list.

## Getting the work out

`Hent brief` opens two views:

- **Brief** — the markdown handover: notes by priority, changed CSS variables, the
  per-element adjustments, and a chronological log of every edit made in the desk.
- **HTML** — the edited document as a clean standalone file. Editor attributes are
  stripped, chosen webfonts are kept, and variable overrides become a readable
  `:root{…}` block. `Fjern skjulte` drops hidden elements; `Fjern skript` makes it a
  static mockup — worth ticking for any page whose own JavaScript builds DOM, since the
  export already contains what that script produced.

Work is autosaved to the browser after every change; reload and a **Fortsett der du
slapp** strip offers it back. Undo history is not part of that snapshot.

## Undo

Every mutation — text, delete, insert, duplicate, move, reorder, style, variable — goes
through one op engine with real inverse operations, capped at 80 steps. Deleted nodes are
kept alive rather than re-parsed, so undoing a delete restores the actual element,
including anything the page's own scripts had built inside it.

## Non-HTML files

PDFs (first page) and images mount as a flat plate: annotation and the brief work, and
editing, layers and the toolbar say why they are unavailable. Pins are stored as
percentages, so they survive width changes.

## Tests

```
node tools/design-desk/test/smoke.mjs     # 84 checks, regression + new features
node tools/design-desk/test/shots.mjs     # renders PNGs of each UI state for review
```

Both need Chromium and `playwright`; they resolve it from a global install so the repo
picks up no dependencies. `smoke.mjs` deliberately ignores console errors from
`fonts.googleapis.com` — a sandbox without egress is expected, and the font URL table is
validated separately with `curl`.
