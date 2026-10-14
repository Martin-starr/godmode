/* 04 · inversion — the ink panel's "fire prosjekter" blurs and fades
   as you scroll out of the beat (storyboard beat 4). */
import gsap from 'gsap';

export function initInversion({ reduced }) {
  const section = document.getElementById('inversion');
  const inner = document.getElementById('out');
  if (!section || !inner || reduced) return;

  gsap.to(inner, {
    filter: 'blur(14px)',
    opacity: 0.25,
    ease: 'none',
    scrollTrigger: {
      trigger: section,
      start: 'center center',
      end: 'bottom top',
      scrub: true
    }
  });
}
