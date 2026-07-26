/* ============================================================
   main.js — boot: content injection, Lenis + GSAP registration,
   fixed chrome, section animation modules.
   ============================================================ */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import './styles/base.css';
import './styles/chrome.css';
import './styles/sections/landing.css';
import './styles/sections/intro.css';
import './styles/sections/art.css';
import './styles/sections/inversion.css';
import './styles/sections/stubs.css';

import { site, intro, art, inversion, projects, colophon, assets } from './content.js';
import { initPreloader } from './anim/preloader.js';
import { initHorizontal } from './anim/horizontal.js';
import { initInversion } from './anim/inversion.js';
import { initReveals } from './anim/reveals.js';

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

/* ---------- content injection (content.js is the source of truth) ---------- */
function populate() {
  // preloader
  $('pl-word').innerHTML =
    `<span class="paren">${site.wordmark.paren}</span>${site.wordmark.name}`;
  $('pl-meta').textContent = site.preloader.meta;

  // chrome
  $('klass').innerHTML = site.klass
    .map((k, i) => `<span${i === site.activeKlass ? ' class="on"' : ''}>${k}</span>`)
    .join('');
  $('beat').textContent = site.beats.landing;
  $('foot-right').textContent = site.footRight;

  // 01 landing
  $('wm-paren').textContent = site.wordmark.paren;
  $('wm-name').textContent = site.wordmark.name;
  $('cue-s').textContent = site.cue.s;
  $('cue-v').textContent = site.cue.v;
  $('cue-arw').textContent = site.cue.arrow;

  // 02 intro
  $('intro-idx').textContent = intro.idx;
  $('intro-lede').innerHTML = intro.ledeHtml;

  // 03 art piece
  $('giant').textContent = `${art.giant.a} ${art.giant.b}`;
  $('cl-top-lab').textContent = art.clusterTop.lab;
  $('cl-top-val').textContent = art.clusterTop.val;
  $('cl-mid-txt').innerHTML = art.clusterMidHtml;
  $('cl-right-s1').textContent = art.clusterRight.s1;
  $('cl-right-s2').textContent = art.clusterRight.s2;
  $('cl-right-v').textContent = art.clusterRight.v;
  $('cl-role').innerHTML = art.clusterRoleHtml;
  $('cl-tail').innerHTML = art.clusterTailHtml;
  $('cl-vert').textContent = art.vert;
  $('plate-tag').textContent = art.plate.tag;
  $('plate-cap-l').textContent = art.plate.capLeft;
  $('plate-cap-r').textContent = art.plate.capRight;

  // 04 inversion
  $('out-g').innerHTML = inversion.giantHtml;
  $('out-sub').textContent = inversion.sub;

  // 05 projects — Phase A stubs
  $('projects').innerHTML = projects
    .map(
      (p) => `
    <article class="proj" id="proj-${p.slug}" data-reveal="fade">
      <div class="proj-idx">${p.index} / ${p.slug}</div>
      <h2 class="proj-title">${p.title}</h2>
      <div class="proj-meta">
        <span>${p.role}</span><span>${p.year}</span>
        ${p.meta.map((m) => `<span>${m}</span>`).join('')}
      </div>
      <p class="proj-blurb${p.slug === 'verminord' ? '' : ' is-todo'}">${p.blurb}</p>
      <div class="proj-frame"><span>Plate ${p.index}</span></div>
    </article>`
    )
    .join('');

  // 06 colophon — Phase A stub
  $('colophon').innerHTML = `
    <div class="colo-idx">${colophon.idx}</div>
    <p class="colo-lede">${colophon.ledeHtml}</p>
    <a class="colo-mail" href="mailto:${colophon.email}">${colophon.email}</a>
    <div class="colo-loc">${colophon.location}</div>
    <div class="colo-crop" aria-hidden="true"><span>${colophon.cropped}</span></div>`;
}

/* ---------- asset probing — graceful fallbacks until files land ----------
   CSS keeps the engraved-hatch / ruled-newsprint placeholders; when a
   real asset loads, <html> gets has-portrait / has-newsprint /
   has-collage and the scan/plate takes over. */
function probeAssets() {
  Object.entries(assets).forEach(([key, src]) => {
    const im = new Image();
    im.onload = () => {
      document.documentElement.classList.add(`has-${key}`);
      ScrollTrigger.refresh();
    };
    im.src = src;
  });
}

/* ---------- Lenis (inertia) + GSAP ticker integration ---------- */
function initLenis() {
  if (reduced) return null; // plain document scroll under reduced motion
  const lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

/* ---------- fixed chrome: beat name + progress bar ---------- */
function initChrome() {
  const beatEl = $('beat');
  document.querySelectorAll('[data-beat]').forEach((sec) => {
    const name = site.beats[sec.dataset.beat];
    if (!name) return;
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) beatEl.textContent = name;
      }
    });
  });

  const bar = $('bar');
  ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      bar.style.width = `${self.progress * 100}%`;
    }
  });
}

/* ---------- boot ---------- */
function boot() {
  populate();
  probeAssets();

  const lenis = initLenis();

  initReveals({ reduced });
  initHorizontal();
  initInversion({ reduced });
  initChrome();

  // Recalculate pin distances once web fonts have swapped in.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  // 00 · preloader — scroll locked while the curtain is up.
  window.scrollTo(0, 0);
  lenis?.stop();
  initPreloader({
    reduced,
    onDone: () => {
      lenis?.start();
      if (!reduced) {
        gsap.fromTo(
          '.wordmark',
          { y: 34, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out' }
        );
        gsap.fromTo(
          '.cue',
          { opacity: 0 },
          { opacity: 1, duration: 0.8, delay: 0.35 }
        );
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
