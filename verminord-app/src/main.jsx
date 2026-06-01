import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { vnBoot } from './boot.js';
import { VerminordApp, LoginScreen, ErrorBoundary } from './app.jsx';

const root = createRoot(document.getElementById('root'));

(async () => {
  try { await vnBoot(); } catch (e) { console.error('[Verminord] boot error:', e); }

  if (window.__vnNeedsLogin) {
    root.render(<ErrorBoundary><LoginScreen /></ErrorBoundary>);
    // If a magic-link redirect lands, Supabase stores the session — reload to mount the app.
    if (window.__vnSb && window.__vnSb.auth) {
      window.__vnSb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') location.reload();
      });
    }
  } else {
    root.render(<ErrorBoundary><VerminordApp /></ErrorBoundary>);
  }
})();
