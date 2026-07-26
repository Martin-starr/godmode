/* 00 · preloader — ink curtain: wordmark mask-reveal, hold, lift. */
import gsap from 'gsap';

export function initPreloader({ reduced, onDone }) {
  const el = document.getElementById('preloader');
  if (!el) { onDone?.(); return; }

  // Reduced motion: no curtain at all (CSS also hides it), plain page.
  if (reduced) {
    el.classList.add('is-done');
    onDone?.();
    return;
  }

  const word = el.querySelector('.pl-word');
  const meta = el.querySelector('.pl-meta');

  const tl = gsap.timeline({
    defaults: { ease: 'expo.out' },
    onComplete: () => {
      el.classList.add('is-done');
      onDone?.();
    }
  });

  tl.fromTo(word, { yPercent: 115 }, { yPercent: 0, duration: 0.9 }, 0.25)
    .fromTo(meta, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.45')
    .to({}, { duration: 0.55 }) // hold
    .to(word, { yPercent: -115, duration: 0.55, ease: 'expo.in' }, 'lift')
    .to(meta, { opacity: 0, duration: 0.35 }, 'lift')
    .to(el, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, 'lift+=0.15');

  return tl;
}
