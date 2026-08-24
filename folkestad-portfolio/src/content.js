/* ============================================================
   content.js — SINGLE SOURCE OF TRUTH for all copy.
   Everything the visitor reads lives here. index.html holds
   structure only; main.js injects this content into the DOM.
   ============================================================ */

export const site = {
  title: 'Martin Folkestad — Founder & builder · Jæren (NO)',
  description:
    'Martin Folkestad is a JÆREN (NO) based founder & builder crafting digital products & ventures from the ground up.',

  wordmark: { paren: '(martin)', name: 'folkestad' },

  cue: { s: '/Scroll', v: '/videre', arrow: '→' },

  // Fixed chrome — classification strip (top) + foot (bottom)
  klass: ['Klassifikasjon', 'Arbeid', 'Utstilling ×', 'Dokument', 'Objekt', '26 · 07 · 2026'],
  activeKlass: 2, // "Utstilling ×" gets the red .on treatment
  footRight: 'Martin Folkestad · Jæren (NO)',

  // Beat names shown in the chrome foot as you scroll
  beats: {
    landing: '01 — Landing',
    intro: '02 — Introduksjon',
    art: '03 — Selected Works',
    inversion: '04 — Inversjon',
    projects: '05 — Prosjekter',
    colophon: '06 — Kolofon'
  },

  preloader: {
    word: '(martin)folkestad',
    meta: 'Portefølje — Jæren (NO) — 2026'
  }
};

export const intro = {
  idx: '01 — Verzeichnungsnummer',
  // Rendered as-is (trusted, authored here). <b>, .it (Newsreader italic)
  // and .sm (mono superscript) match the design system.
  ledeHtml:
    '<b>Martin Folkestad</b> <span class="it">is a</span> <b>JÆREN</b><span class="sm">(NO)</span> ' +
    '<span class="it">based</span> founder <span class="it">&amp;</span> builder ' +
    '<span class="it">crafting</span> <b>digital products &amp; ventures</b> ' +
    '<span class="it">from the ground up.</span>'
};

/* Beat 03 — the horizontal art piece. Text clusters per Martin's hi-res
   render ("tre" changed to "fire" — four projects confirmed). */
export const art = {
  giant: { a: 'SELECTED', b: 'WORKS' },

  clusterTop: { lab: 'Utvalgt.ARBEID', val: '2024—2026' },

  clusterMidHtml:
    '<b>fire prosjekter</b> <span class="it">/ presentert i</span> <b>detaljer</b><br>' +
    '<span class="it">/via/</span>dette scrolleventyret',

  clusterRight: { s1: '(martin)folkestad', s2: '/SCROLL', v: '/videre →' },

  clusterRoleHtml: '/Founder <em>&amp;</em> builder<em>/</em>JÆREN (no)',

  clusterTailHtml:
    '<b>His work ranges</b> from web experiences, brand identities and growing ' +
    'companies, <em>(all of which)</em> demonstrate simplicity in form, subtle ' +
    'detailing and an obsession with craft.',

  plate: { tag: 'Plate 01', capLeft: 'Portrett — M. Folkestad', capRight: 'Gravyr' },

  vert: 'Verminord · Fjære · Lagd · The Last Round'
};

export const inversion = {
  giantHtml: 'fire <em>prosjekter</em>',
  sub: 'Fortsett å scrolle'
};

/* ============================================================
   The four projects. Phase B gives each a full editorial
   section; Phase A renders lightweight stubs from this data.
   ============================================================ */
export const projects = [
  {
    slug: 'verminord',
    index: '01',
    title: 'Verminord',
    role: 'Founder & builder — hele merkevaren, bygd fra bunnen',
    year: '2024—2026',
    meta: ['Merkevare', 'Nettbutikk', 'Produksjonssystem', 'D2C / B2B'],
    blurb:
      'Premium norsk vermikompost, produsert på Jæren i klimakontrollerte ' +
      'CFT-bed og foret med lokale råvarer — lamamøkk, øl-mask fra ' +
      'rogalandsbryggerier, brukt soppsubstrat. Lab-dokumentert ved ALS Norge, ' +
      'Debio-registrert, rottegrad V. Et familieselskap på tre. Identitet, ' +
      'nettbutikk og internt produksjonssystem: alt bygd fra bunnen.'
  },
  {
    slug: 'fjaere',
    index: '02',
    title: 'Fjære',
    role: 'Founder & builder', // TODO(Martin): confirm role line
    year: '2025—2026', // TODO(Martin): confirm year
    meta: ['Digitalt produkt'], // TODO(Martin): confirm meta tags
    // TODO(Martin): replace placeholder blurb with real copy
    blurb:
      'Beskrivelse kommer — kort, konkret tekst om hva Fjære er, hvem det er ' +
      'for, og hva som ble bygd.'
  },
  {
    slug: 'lagd',
    index: '03',
    title: 'Lagd',
    role: 'Founder & builder', // TODO(Martin): confirm role line
    year: '2025—2026', // TODO(Martin): confirm year
    meta: ['Digitalt produkt'], // TODO(Martin): confirm meta tags
    // TODO(Martin): replace placeholder blurb with real copy
    blurb:
      'Beskrivelse kommer — kort, konkret tekst om hva Lagd er, hvem det er ' +
      'for, og hva som ble bygd.'
  },
  {
    slug: 'the-last-round',
    index: '04',
    title: 'The Last Round',
    role: 'Founder & builder', // TODO(Martin): confirm role line
    year: '2026', // TODO(Martin): confirm year
    meta: ['Digitalt produkt'], // TODO(Martin): confirm meta tags
    // TODO(Martin): replace placeholder blurb with real copy
    blurb:
      'Beskrivelse kommer — kort, konkret tekst om hva The Last Round er, ' +
      'hvem det er for, og hva som ble bygd.'
  }
];

export const colophon = {
  idx: '06 — Kolofon',
  ledeHtml:
    'Bygger <span class="it">digitale produkter &amp; selskaper</span> fra Jæren.',
  email: 'martin@folkestad.design', // TODO(Martin): confirm contact email
  location: 'Jæren (NO)',
  // TODO(Martin): confirm social links for Phase B
  socials: [],
  cropped: 'folkestad'
};

/* Asset manifest — generated in parallel; each has a CSS fallback
   (engraved hatch / ruled newsprint lines) until the file lands. */
export const assets = {
  portrait: '/assets/portrait.webp',
  newsprint: '/assets/newsprint-page.webp',
  collage: '/assets/newsprint-collage.webp'
};
