/* ===========================================================================
   PARALLAX RIDGE — GSAP + ScrollTrigger + Lenis
   ---------------------------------------------------------------------------
   How it works:
   1. Lenis gives us buttery, momentum-based smooth scrolling.
   2. We drive Lenis from GSAP's ticker so ScrollTrigger and Lenis share
      one clock (no jitter, no double RAF loops).
   3. One pinned ScrollTrigger drives a timeline. Every layer gets its own
      tween on that timeline; because they all share `scrub`, they move in
      lock-step with the scrollbar but at different distances/speeds.

   TWEAK GUIDE (search these while adjusting):
     • SCROLL_LENGTH  -> how many screen-heights the pin lasts.
     • markers:true   -> flip on to SEE the start/end trigger points.
     • scrub          -> `true` = 1:1 with scrollbar, a number = catch-up ease.
     • The `y` / `scale` values on each tween = movement distance/speed.
   =========================================================================== */

/* Register the plugin so GSAP knows about ScrollTrigger. */
gsap.registerPlugin(ScrollTrigger);

/* --------------------------------------------------------------------------
   1. SMOOTH SCROLL (Lenis)
   -------------------------------------------------------------------------- */
const lenis = new Lenis({
  duration: 1.1,          // higher = slower, floatier momentum
  smoothWheel: true,      // smooth the mouse wheel
  wheelMultiplier: 1,     // scroll speed (lower = slower)
});

/* Keep ScrollTrigger in sync every time Lenis scrolls. */
lenis.on("scroll", ScrollTrigger.update);

/* Drive Lenis from GSAP's own ticker so both share a single RAF loop.
   GSAP gives time in seconds; Lenis wants milliseconds -> * 1000. */
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);   // don't let GSAP "catch up" after tab blur

/* Respect users who ask for reduced motion — kill smooth scroll for them. */
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  lenis.destroy();
}

/* --------------------------------------------------------------------------
   2. THE PARALLAX TIMELINE
   -------------------------------------------------------------------------- */
const SCROLL_LENGTH = "+=250%";   // pin lasts 2.5 viewport-heights of scroll

const tl = gsap.timeline({
  scrollTrigger: {
    trigger: "#stage",
    start: "top top",         // begin when the stage's top hits viewport top
    end: SCROLL_LENGTH,       // ...and run for SCROLL_LENGTH of scrolling
    scrub: 1,                 // 1s smoothing so layers "catch up" gracefully
    pin: true,                // freeze the stage while the timeline plays
    // markers: true,         // <-- UNCOMMENT to visualize start/end + progress
    // anticipatePin: 1,      // reduces a 1-frame pin jump on fast scroll
  },
});

/* All tweens start at position 0 ("<<") so they animate together, each
   covering its own distance. The bigger the number, the faster that layer
   appears to move relative to the others = the depth illusion. */

/* SKY — deepest layer: barely moves, gently scales up (pushes horizon back). */
tl.to(".layer--sky", { scale: 1.18, yPercent: -6, ease: "none" }, 0);

/* SUN — drifts up a touch and dims as we descend. */
tl.to(".layer--sun", { yPercent: -14, opacity: 0.35, ease: "none" }, 0);

/* FAR MOUNTAINS — slow rise. */
tl.to(".layer--far", { yPercent: -16, ease: "none" }, 0);

/* MID HILLS — medium rise (moves more than the far mountains). */
tl.to(".layer--mid", { yPercent: -26, ease: "none" }, 0);

/* HEADLINE — starts low & hidden behind the foreground, then rises into
   view and fades in as the foreground clears it. */
tl.fromTo(
  ".headline",
  { yPercent: 40, opacity: 0, scale: 0.94 },
  { yPercent: -8, opacity: 1, scale: 1, ease: "none" },
  0
);

/* BACK TREES — rise faster than the hills. */
tl.to(".layer--trees", { yPercent: -34, ease: "none" }, 0);

/* FOREGROUND GROUND — the star move: slides DOWN and fully off-screen,
   fastest of all, uncovering the headline behind it. */
tl.to(".layer--fore", { yPercent: 55, ease: "none" }, 0);

/* INTRO OVERLAY — leaves the screen quickly (upward) at the very start. */
tl.to(
  ".layer--intro",
  { yPercent: -120, opacity: 0, ease: "none", duration: 0.4 },
  0
);

/* --------------------------------------------------------------------------
   3. HYGIENE
   Recalculate trigger positions after fonts/images settle & on resize.
   -------------------------------------------------------------------------- */
window.addEventListener("load", () => ScrollTrigger.refresh());
