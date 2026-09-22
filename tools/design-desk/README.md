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
  `:root{…}` block. `Fjern skjulte` drops the elements *you* hid — never ones the page
  itself had hidden. `Fjern skript` makes it a static mockup — worth ticking for any page
  whose own JavaScript builds DOM, since the export already contains what that script
  produced.

Work is autosaved to the browser after every change; reload and a **Fortsett der du
slapp** strip offers it back. Undo history is not part of that snapshot.

Two limits worth knowing, because they are the ones you can feel. Only the most recent
session is kept, so opening a second file discards the first one's copy. And embedded
photos blow past the browser's storage budget quickly — when a snapshot is too big to
save, the desk says so and **deletes the old one rather than keeping it**, since a strip
offering a document older than what is on screen reads as data loss. Download the HTML
for anything you want to keep.

## Undo

Every mutation — text, delete, insert, duplicate, move, reorder, style, variable — goes
through one op engine with real inverse operations, capped at 80 steps. Deleted nodes are
kept alive rather than re-parsed, so undoing a delete restores the actual element,
including anything the page's own scripts had built inside it.

## Non-HTML files

PDFs (first page) and images mount as a flat plate: annotation and the brief work, and
editing, layers and the toolbar say why they are unavailable. Pins are stored as
percentages, so they survive width changes.

## Starter pages

`starters/` holds four finished pages to drop into the desk when you are building a
mockup from nothing rather than marking up someone else's file. Each is a distinct
aesthetic position, not a variation on one template:

| File | Direction |
|------|-----------|
| `redaksjonell.html` | Editorial journal — Newsreader, asymmetric grid, drop cap, dot-leader contents, marginalia |
| `konstruksjon.html` | Brutalist spec sheet — Archivo Black on Space Mono, 2px rules, safety orange, exposed grid |
| `stillhet.html` | Quiet luxury — Cormorant Garamond, enormous air, one hairline, an off-axis product block |
| `jordnaer.html` | Warm organic — Fraunces, grain, soil speckle, rounded cards, dark hero |

All four are built to be edited, not just looked at:

- Colours and type live in `:root`, so the System tab can restyle the whole page at once.
- Sections are semantic with a heading first, so the Layers tree reads as
  "Om oss / Tre kort / Rutenett" rather than a wall of `div`.
- No scripts and no external images — every graphic is inline SVG or CSS, so they work
  offline and the HTML export is genuinely self-contained.

## The desk's own look

The chrome is deliberately quiet: cool graphite, desaturated grain in the room and never
on the plate, one accent. A proofing tool that has its own colour cast lies to you about
the artwork, so the design investment goes into type scale, density, motion and hairlines
rather than into colour. Motion is orchestrated at three moments only — the plate lifting
in on mount, the layers tree staggering on first build, and the rail assembling when you
select something new — and is deliberately absent from every repeated action, because a
slider that animates on each commit is a slider that fights you.

## Tests

```
node tools/design-desk/test/smoke.mjs      # 84 checks, regression + new features
node tools/design-desk/test/starters.mjs   # 52 checks, each starter standalone and in the desk
node tools/design-desk/test/regress.mjs    # 39 checks, one per defect found in review
node tools/design-desk/test/shots.mjs      # renders PNGs of each UI state for review
```

`regress.mjs` is the important one to keep green. Each block reproduces a defect that
was found in an adversarial review and confirmed in a real browser before being fixed —
undo surviving a page that mutates its own DOM, ⌘Z belonging to whatever field you are
typing in, links never navigating the plate away, pin coordinates on a scrolled image
plate, a restored session bringing its CSS back and not just its looks. If one of those
blocks goes red, a fix has been undone rather than a test having drifted.

All need Chromium and `playwright`; they resolve it from a global install so the repo
picks up no dependencies. The suites deliberately ignore console errors from
`fonts.googleapis.com` — a sandbox without egress is expected, and the font URL table is
validated separately with `curl`.
