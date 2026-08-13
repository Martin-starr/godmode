# Lucid — Liquid Glass Portfolio

A single-page creative-studio landing site built with **React + TypeScript + Vite + Tailwind CSS + framer-motion + lucide-react**.

A black-background, video-driven portfolio site with a "smooth acid trip"
aesthetic: dark, iridescent, liquid. It pairs a reusable **liquid-glass**
surface treatment with AI-generated 4K background videos, an animated
iridescent "acid" gradient on emphasised words, a subtle film-grain overlay,
and scroll-reveal animations.

## Stack

- [Vite](https://vitejs.dev/) — dev server & build
- [React 18](https://react.dev/) + TypeScript
- [Tailwind CSS 3](https://tailwindcss.com/) — utility styling
- [framer-motion](https://www.framer.com/motion/) — scroll-reveal + hover animation
- [lucide-react](https://lucide.dev/) — icons
- Type: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) (display) + [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) (body), via Google Fonts

## Media

The background videos are 4K (3840×2160) clips generated with Higgsfield
(Kling 3.0, `4k` mode) and streamed from a CloudFront CDN — the same hosting
pattern the project started with. They are referenced by URL in the section
components, so nothing large is committed to the repo. If those URLs ever
rotate, swap the constants at the top of each section component (and the
`HERO_VIDEO` constant in `src/pages/Index.tsx`) for self-hosted copies.

## Getting started

```bash
cd landing
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

## Structure

```
landing/
├─ index.html
├─ src/
│  ├─ main.tsx                 # app entry
│  ├─ index.css                # Tailwind layers, fonts, .liquid-glass, .acid-text, .grain
│  ├─ pages/
│  │  └─ Index.tsx             # Hero (nav, headline, email, socials) + page assembly
│  └─ components/
│     ├─ AboutSection.tsx          # The Studio
│     ├─ FeaturedVideoSection.tsx  # The Method — featured video
│     ├─ PhilosophySection.tsx     # Chaos × Control
│     └─ ServicesSection.tsx       # What we do
```

## Design details

- **`.liquid-glass`** — near-transparent white fill, 4px backdrop blur, inner
  highlight, and a masked gradient border (`::before`) for a frosted edge.
- **`.acid-text`** — a slow, smooth iridescent gradient clipped to the glyphs,
  used on emphasised words (respects `prefers-reduced-motion`).
- **`.grain`** — a fixed, low-opacity SVG film-grain overlay for analog texture.
- **Hero crossfade** — the hero video loops with a smooth crossfade to black
  between plays, tweened in vanilla JS via `requestAnimationFrame` (no CSS
  transitions): fade in on `canplay`, fade out at ≤ 0.55s remaining, seamless
  restart on `ended`.
