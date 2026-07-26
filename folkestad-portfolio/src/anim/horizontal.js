/* 03 · the art piece — GSAP ScrollTrigger pin + scrub replaces the
   mockup's hand-rolled sticky/rAF math. Vertical wheel input drives
   the horizontal translate; Lenis (main.js) provides the inertia.

   Per-layer velocity parallax, ported from the mockup's rAF loop:
     layerX = trackShift * (1 - v) * 0.42   (data-v .35/.55/.75/1/1.28)
   v < 1 drifts against travel (slower / further away),
   v > 1 overshoots (faster / closer). */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const PARALLAX = 0.42; // depth factor from the mockup

export function initHorizontal() {
  const section = document.getElementById('art');
  const track = document.getElementById('art-track');
  if (!section || !track) return;

  const layers = gsap.utils.toArray('.layer', track);
  const mm = gsap.matchMedia();

  mm.add(
    {
      wide: '(min-width: 768px)',
      narrow: '(max-width: 767.98px)',
      reduce: '(prefers-reduced-motion: reduce)'
    },
    (ctx) => {
      const { wide, reduce } = ctx.conditions;

      // Mobile + reduced motion: vertically stacked composition, no pin.
      if (!wide || reduce) {
        section.classList.add('art--static');
        ScrollTrigger.refresh();
        return () => section.classList.remove('art--static');
      }

      section.classList.remove('art--static');
      const dist = () => track.scrollWidth - window.innerWidth;

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => '+=' + dist(),
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });

      tl.to(track, { x: () => -dist() }, 0);

      layers.forEach((layer) => {
        const v = parseFloat(layer.dataset.v || '1');
        if (v === 1) return; // rides the track 1:1
        tl.to(layer, { x: () => dist() * (1 - v) * PARALLAX }, 0);
      });

      // gsap.matchMedia reverts the timeline + ScrollTrigger automatically
    }
  );
}
