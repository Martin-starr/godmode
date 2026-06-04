import { createClient } from '@supabase/supabase-js'

// Kill navigator.locks BEFORE Supabase client init.
// Supabase JS v2 uses Web Locks for session serialization. Stale locks
// from crashed tabs permanently block the thread, freezing the entire
// renderer. Since we use persistSession:false (in-memory only), locks
// serve no purpose. Removing the API forces Supabase to skip locking.
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  } catch (_) {
    // Ignore if browser doesn't allow override
  }

  // Also clear any stale Supabase keys from localStorage
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sb-')) localStorage.removeItem(key)
    }
  } catch (_) {}
}

export const supabase = createClient(
  'https://ftjxpivxeavxdgcfpsba.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0anhwaXZ4ZWF2eGRnY2Zwc2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MzI0NjksImV4cCI6MjA5MjIwODQ2OX0.iOcARTHjCxIZo2xmiTJHYrwINjq3pgi2J9yNL0nvjq4',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
)
