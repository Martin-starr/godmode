# Asme — Liquid Glass Landing

A single-page landing site built with **React + TypeScript + Vite + Tailwind CSS + framer-motion + lucide-react**.

The page is a black-background, video-driven marketing site featuring a reusable
"liquid glass" surface treatment, a seamlessly cross-fading hero video, and
scroll-reveal animations.

## Stack

- [Vite](https://vitejs.dev/) — dev server & build
- [React 18](https://react.dev/) + TypeScript
- [Tailwind CSS 3](https://tailwindcss.com/) — utility styling
- [framer-motion](https://www.framer.com/motion/) — scroll-reveal + hover animation
- [lucide-react](https://lucide.dev/) — icons
- [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) via Google Fonts

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
│  ├─ index.css                # Tailwind layers + .liquid-glass component + font import
│  ├─ pages/
│  │  └─ Index.tsx             # Section 1 — hero (nav, headline, email, socials) + page assembly
│  └─ components/
│     ├─ AboutSection.tsx      # Section 2 — About
│     ├─ FeaturedVideoSection.tsx  # Section 3 — Featured video
│     ├─ PhilosophySection.tsx     # Section 4 — Innovation × Vision
│     └─ ServicesSection.tsx       # Section 5 — What we do
```

## The liquid-glass treatment

`.liquid-glass` (defined in `src/index.css`) layers a near-transparent white
fill, a 4px backdrop blur, an inner highlight, and a masked gradient border
(`::before`) to produce a frosted-glass edge on any element it's applied to.

## Hero video crossfade

The hero video loops with a smooth crossfade to black between plays. Opacity is
tweened in vanilla JS via `requestAnimationFrame` (no CSS transitions):

- **canplay** → play and fade `0 → 1` over 500ms
- **timeupdate** → when ≤ 0.55s remain, fade current → `0` over 500ms
- **ended** → snap to `0`, wait 100ms, reset to the start, replay, and fade back in
