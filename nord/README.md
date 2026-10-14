# NORD — Specialty Coffee Roastery Template

A minimal, editorial static template for specialty coffee roasteries, cafés, and
premium food brands. Austere Scandinavian design system, built as hand-crafted
HTML/CSS so it can be viewed and hosted directly, or used as a precise reference
for a rebuild in Framer.

> This is **Block 2** of the NORD build — the inner pages, shop, and listing.
> The homepage (`index.html`) is included so the site is coherent and navigable.

## View it

It's a static site — no build step. Open `index.html` in a browser, or serve the
folder:

```bash
cd nord
python3 -m http.server 8000   # then open http://localhost:8000
```

## Pages

| File | Spec § | What it is |
|------|--------|------------|
| `index.html` | — | Homepage: hero, lineup teaser, craft / wholesale / journal teasers |
| `shop.html` | §1 | Collection grid (6 coffees), filter row, subscription band |
| `product.html` | §2 | Single coffee (Konga): spec block, brew guide, origin story, related |
| `our-craft.html` | §3 | Full story: source / roast / bag, pull quote, CTA |
| `wholesale.html` | §4 | B2B page: what-you-get, how-it-works, enquiry form |
| `journal.html` | §5 | CMS-style blog index (3 posts) |
| `journal-post.html` | §5 | Post template: meta row, cover, rich-text body, related |
| `contact.html` | §6 | Contact form + mono details column |

Shared assets: `css/nord.css` (design system + components) and `js/nord.js`
(scroll-reveal, mobile nav, filter, cart-count, qty stepper, form demo).

## Design system

- **Type:** General Sans (headings/body, Fontshare CDN) + Geist Mono (mono labels,
  jsDelivr CDN). System fallbacks if offline.
- **Palette:** paper `#F4F1EC` · ink `#1A1916` · clay `#A85C3C` (accent only).
- **Rules:** hairlines not cards, no shadows, generous whitespace, no exclamation
  marks, currency in `kr`. All tokens live in `:root` in `css/nord.css`.

## Animation

Subtle and Framer-like: IntersectionObserver scroll reveals (fade + slight rise),
hairline-grow link underlines, a sticky header that thins on scroll, and a slow
image reveal. All motion is disabled under `prefers-reduced-motion`.

## Imagery

The 18 photographs in `assets/img/` were generated as one consistent set (single
soft light, paper / concrete / steel backgrounds, cool muted tone, heavy negative
space). If any image is missing, the page degrades to an on-brand placeholder
(see `.ph` in `css/nord.css` and `window.NORDph` in `js/nord.js`). Swap in your
own photography by replacing the files of the same name.

## CMS field reference (for a Framer rebuild)

Content is hardcoded here. To rebuild in Framer, create these CMS collections:

**Coffee** — `Name` · `Slug` · `Origin` · `Region` · `Process` · `Altitude` ·
`Roast level` (Light/Medium/Dark) · `Tasting notes` (3) · `Price` ·
`Weight options` · `Category` (Single Origin / Blend / Decaf) · `Description` ·
`Image` · `In stock` (bool) · `Featured` (bool).
Used by Shop grid, Product page, and Related.

**Journal** — `Title` · `Slug` · `Date` · `Author` · `Category` · `Excerpt` ·
`Cover image` · `Body` (rich text) · `Read time`.
Used by Journal index and Post template.

## Demo content

Six coffees (Konga, Huila, Nyeri AA, Cerrado, Daglig House Blend, Sugarcane Decaf)
and three journal posts, reused across pages so the template reads as a coherent
brand (NORD, a small-batch roastery in Oslo).
