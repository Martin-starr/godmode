/* NORD — interactions & scroll reveal. Vanilla, no dependencies. */
/* Image fallback: if a generated shot is missing, show an on-brand placeholder. */
window.NORDph = function (img) {
  var f = img.parentElement;
  img.remove();
  f.classList.add('ph');
  if (f.dataset.ph) f.setAttribute('data-label', f.dataset.ph);
};

(function () {
  'use strict';

  /* ---- Sticky header state ------------------------------------------- */
  var head = document.querySelector('.site-head');
  if (head) {
    var onScroll = function () {
      head.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- Mobile nav ----------------------------------------------------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        toggle.classList.remove('is-open');
      }
    });
  }

  /* ---- Scroll reveal -------------------------------------------------- */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealables = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---- Cart counter (demo) ------------------------------------------- */
  var cartCount = document.querySelector('.nav__cart sup');
  var n = 0;
  document.querySelectorAll('[data-add]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      n += 1;
      if (cartCount) cartCount.textContent = n;
      btn.dataset.added = 'true';
      var label = btn.textContent;
      btn.textContent = 'Added';
      setTimeout(function () { btn.textContent = label; }, 1100);
    });
  });

  /* ---- Option chip groups (weight / grind) --------------------------- */
  document.querySelectorAll('[data-chips]').forEach(function (group) {
    group.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      group.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
    });
  });

  /* ---- Quantity stepper ---------------------------------------------- */
  document.querySelectorAll('[data-qty]').forEach(function (q) {
    var out = q.querySelector('span');
    var val = 1;
    q.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      val = Math.max(1, val + (b.dataset.step === 'up' ? 1 : -1));
      out.textContent = val;
    });
  });

  /* ---- Subscription toggle ------------------------------------------- */
  document.querySelectorAll('[data-toggle]').forEach(function (t) {
    t.addEventListener('click', function () { t.classList.toggle('is-on'); });
  });

  /* ---- Shop filter (demo, by category data-attr) --------------------- */
  var fr = document.querySelector('[data-filter]');
  if (fr) {
    fr.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-cat]');
      if (!b) return;
      fr.querySelectorAll('button[data-cat]').forEach(function (x) { x.classList.remove('is-active'); });
      b.classList.add('is-active');
      var cat = b.dataset.cat;
      document.querySelectorAll('.coffee-grid .card').forEach(function (card) {
        var show = cat === 'all' || (card.dataset.cat || '').split(' ').indexOf(cat) > -1;
        card.style.display = show ? '' : 'none';
      });
    });
  }

  /* ---- Forms (demo, prevent real submit) ----------------------------- */
  document.querySelectorAll('form[data-demo]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = f.querySelector('[type="submit"]');
      if (btn) { var l = btn.textContent; btn.textContent = 'Sent — thank you'; btn.disabled = true;
        setTimeout(function () { btn.textContent = l; btn.disabled = false; f.reset(); }, 2400); }
    });
  });
})();
