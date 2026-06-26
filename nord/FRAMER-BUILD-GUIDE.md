# NORD — Framer Build Guide

This guide rebuilds the NORD template **inside the Framer editor** so it can be
submitted to the Framer Marketplace. Framer only accepts native Framer projects —
there's no HTML import — so this static site (`nord/`) is the **blueprint**: exact
copy, layout, tokens, CMS, and imagery are all already decided here. Open the live
preview side-by-side while you build:

`https://raw.githack.com/Martin-starr/godmode/claude/nord-coffee-framer-rkvj9k/nord/index.html`

Exact copy for any page lives in the matching HTML file (`shop.html`, etc.) — copy
straight from there. Images are in `assets/img/`.

---

## 0. Project setup (do this first)

### Fonts
- **General Sans** — add via Framer's font picker (Fontshare is built in). Weights: 400, 500, 600.
- **Geist Mono** — add as a custom/Google font. Weight 400.

### Colors → Framer Color Styles
| Style name | Hex |
|---|---|
| Paper (background) | `#F4F1EC` |
| Paper 2 (section tint) | `#EFEBE3` |
| Ink (text) | `#1A1916` |
| Ink 70 (muted) | `#1A1916` @ 70% |
| Ink 55 / 40 (labels) | `#1A1916` @ 55% / 40% |
| Hairline | `#1A1916` @ 14% |
| Clay (accent) | `#A85C3C` |

Set the page background to **Paper** globally. Clay is accent-only (links, the
filter underline, button hover) — never large fills.

### Text Styles (create these, desktop sizes — let Framer scale down per breakpoint)
| Style | Font | Size / line-height | Notes |
|---|---|---|---|
| Display | General Sans 500 | 88px / 0.98, tracking −3.5% | hero H1 |
| H1 | General Sans 500 | 56px / 1.0, tracking −2% | |
| H2 | General Sans 500 | 40px / 1.05 | |
| H3 | General Sans 500 | 22px / 1.1 | card/post titles |
| Body | General Sans 400 | 17px / 1.55, color Ink 70 | |
| Lede | General Sans 400 | 20px / 1.5, color Ink 70 | sub-headers, max ~46ch |
| Mono label | Geist Mono 400 | 11.5px, tracking +18%, UPPERCASE, Ink 55 | eyebrows, specs, meta |

### Breakpoints
Build **Desktop (1280 content max), Tablet (810), Phone (390)**. Rules:
- Two-column sections → stack to one column on Tablet/Phone.
- Coffee grid: 3 cols (desktop) → 2 (tablet) → 1 (phone).
- Footer: 4 cols → 2 → 1. Nav collapses to a hamburger/overlay on Phone.

### Global components to make once and reuse
- **Header** (sticky, blurred Paper bg, hairline appears on scroll) — logo `NORD` left, nav right: Shop · Our Craft · Wholesale · Journal · Contact · `CART 0`.
- **Footer** — brand blurb + Shop / Company / Follow columns + base row (`© 2026 NORD Coffee · Oslo` / `Roasted to order · Shipped within 48h`).
- **Coffee Card** (CMS component — see §CMS).
- **Button** (outline + solid variants; solid hover → Clay).
- **Mono eyebrow**, **Spec row** (label/value), **Hairline divider**.

### Effects (the "premium" motion — keep subtle)
Use Framer's **Appear/Scroll** animations: fade + 12px rise, ~80ms stagger.
Slow image scale-in (1.04 → 1.0). Link underline grow on hover. Respect reduced
motion (Framer does this automatically for Appear effects).

---

## 1. CMS collections (build before the grids)

### Collection: **Coffee**
Fields: `Name` (text) · `Slug` · `Origin` · `Region` · `Process` · `Altitude` ·
`Roast level` (option: Light/Medium/Dark) · `Tasting notes` (text, 3 comma-sep) ·
`Price` (number) · `Weight options` (text) · `Category` (option: Single Origin /
Blend / Decaf) · `Description` (long text) · `Image` (image) · `In stock` (boolean) ·
`Featured` (boolean).

Seed 6 entries (data in `shop.html`): Konga, Huila, Nyeri AA, Cerrado, Daglig
(House Blend), Sugarcane Decaf. Images: `assets/img/coffee-*.jpg`.

### Collection: **Journal**
Fields: `Title` · `Slug` · `Date` · `Author` · `Category` · `Excerpt` ·
`Cover image` · `Body` (rich text) · `Read time`.
Seed 3 entries (data in `journal.html`). Covers: `assets/img/journal-1..3.jpg`.

### Coffee Card component (bind to Coffee CMS)
Vertical stack inside a cell with hairline separators (use a 1px-gap grid on a
hairline background to get the divider look):
`Image (1:1)` → `Mono spec line` (e.g. `ETHIOPIA · WASHED`) → `Name (H3)` →
`Roast indicator` (`ROAST ●●○ MEDIUM`) → footer row `Price + [Add to cart]`.

---

## 2. Pages (build in this order)

For each page, the exact copy is in the matching HTML file. Section list per page:

**Home (`index.html`)** — Hero (eyebrow, Display H1 "Coffee with nothing to hide.",
lede, two CTAs, 16:9 hero image) → Lineup teaser (3 featured Coffee cards) →
Craft band (tinted, 2-col text + roaster image) → Wholesale teaser (2-col image +
text + button) → Journal teaser (3 latest posts).

**Shop (`shop.html`)** — Heading block (eyebrow `ALL COFFEE`, H1 "The current
lineup.", lede) → Filter row (`ALL · SINGLE ORIGIN · BLENDS · DECAF · SUBSCRIPTIONS`
+ right `SORT: ROAST · PRICE · ORIGIN`) → CMS grid of Coffee cards → Subscription
band. Wire the filter to the Coffee `Category` field.

**Product (`product.html`)** — Breadcrumb → 2-col (4:5 image left; right: eyebrow,
H1, spec block, price, Weight selector `250g/1kg`, Grind `Whole bean/Filter/Espresso`,
Quantity + Add to cart, Subscribe toggle, 2 short paras) → Brew-guide block
(`HOW WE BREW IT — V60` with Ratio/Dose/Water/Temp/Time) → Story (2-col, washing-
station image) → Related (3 Coffee cards). Make this a **CMS detail page** bound to
the Coffee collection so every coffee gets its own page.

**Our Craft (`our-craft.html`)** — Hero → How we source (2-col) → roaster image →
How we roast (2-col) → Pull quote (tinted, centered) → What's in the bag (2-col,
roast-log image) + CTA.

**Wholesale (`wholesale.html`)** — Hero + `Enquire ↓` → What you get (4 numbered
hairline rows) → Who we work with (tags + bulk image) → How it works (4 numbered
steps, tinted) → Enquiry form (Business name · Contact · Email · Business type
dropdown · Monthly volume · Message · Send). Use Framer's Form + a form handler.

**Journal index (`journal.html`)** — Heading → CMS grid of posts (cover, `DATE ·
CATEGORY`, H3 title, excerpt).

**Journal post (`journal-post.html`)** — CMS detail page: meta row, H1, full-width
cover, rich-text body (18px, line-height 1.6, ~68ch measure), author line, 3
related posts.

**Contact (`contact.html`)** — Heading → 2-col: Form (Name · Email · Subject ·
Message · Send) left; mono details (Visit / Email / Hours / Wholesale / Follow) +
roastery image right.

---

## 3. Pre-submission checklist (Framer review guidelines)

- [ ] Responsive on Desktop / Tablet / Phone — no overflow, tap targets ≥ 44px.
- [ ] All CMS collections populated; detail pages work for every entry.
- [ ] Per-page **SEO**: title, description, OG image (set in Page settings).
- [ ] No broken links; nav + footer link to every page.
- [ ] Layers named sensibly; components reused (not copy-pasted).
- [ ] Forms connected (or set to a clear placeholder action).
- [ ] Favicon + site-wide OG image set.
- [ ] Fast: images compressed (the ones in `assets/img/` already are).
- [ ] No exclamation marks in copy; currency shown as `kr`.

See the listing + submission steps in `MARKETPLACE-LISTING.md`.
