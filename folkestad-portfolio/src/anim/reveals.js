/* Hand-rolled line/word-mask reveals — no Club plugins.
   [data-reveal="words"] : walks text nodes (markup-safe), wraps each
                           word in .w > .wi masks, staggers them up.
   [data-reveal="fade"]  : simple fade/drift entrance.               */
import gsap from 'gsap';

/* Wrap every word of el (preserving nested inline markup) in
   <span class="w"><span class="wi">word</span></span>. Returns the
   inner spans. */
export function splitWords(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue.trim() !== '') textNodes.push(walker.currentNode);
  }
  textNodes.forEach((node) => {
    const frag = document.createDocumentFragment();
    node.nodeValue.split(/(\s+)/).forEach((part) => {
      if (part === '') return;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const w = document.createElement('span');
        w.className = 'w';
        const wi = document.createElement('span');
        wi.className = 'wi';
        wi.textContent = part;
        w.appendChild(wi);
        frag.appendChild(w);
      }
    });
    node.parentNode.replaceChild(frag, node);
  });
  return Array.from(el.querySelectorAll('.wi'));
}

export function initReveals({ reduced }) {
  if (reduced) return; // CSS resets .wi transform under reduced motion

  document.querySelectorAll('[data-reveal="words"]').forEach((el) => {
    const inners = splitWords(el);
    if (!inners.length) return;
    gsap.fromTo(
      inners,
      { yPercent: 115 },
      {
        yPercent: 0,
        duration: 0.9,
        ease: 'expo.out',
        stagger: 0.035,
        scrollTrigger: { trigger: el, start: 'top 80%', once: true },
        onComplete: () => el.setAttribute('data-reveal-done', '')
      }
    );
  });

  document.querySelectorAll('[data-reveal="fade"]').forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 28 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      }
    );
  });
}
