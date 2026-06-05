# Verminord — Operativ (real build)

A proper Vite + React + Supabase build of the Verminord app. Replaces the old
single-file version that loaded React/Babel/Supabase from CDNs at runtime (the
cause of the blank-page-on-mobile failures).

## What changed

- **No CDN.** React, ReactDOM and Supabase are bundled into one local file.
  Nothing is fetched from `unpkg`/`jsdelivr` when the app opens, so a slow or
  blocked CDN can no longer leave you stuck on a blank loading screen.
- **In-app login code.** Martin's login now uses a **6-digit code** you type
  inside the app (`verifyOtp`). No more leaving the app to dig through your
  inbox. The magic link is still emailed as a fallback, so nothing breaks.
- **One deploy serves both apps:** `/` (Mathias) and `/martin/` (Martin).

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # -> dist/
```

## Deploy

```bash
npm run build
cd dist && vercel deploy --prod   # project prj_wKqDkaiYoJTKVRSQ1g56qmyUhJEL
```

### Push-to-deploy (do this once, ~2 min)

So you never touch the CLI again:

1. Vercel dashboard → project **verminord-combined-dist** → Settings → Git.
2. Connect it to the GitHub repo `martin-starr/godmode`.
3. Set **Root Directory** = `verminord-app`, **Build Command** = `npm run build`,
   **Output Directory** = `dist`.

After that, every push to the repo auto-builds and deploys. No more manual steps.

## ⚠️ One Supabase setting to make the code visible

The 6-digit code only appears in the email if the email template renders it.

Supabase dashboard → **Authentication → Email Templates → Magic Link** →
make sure the body contains the token, e.g.:

```html
<h2>Din påloggingskode</h2>
<p>Skriv inn denne koden i appen:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>Eller klikk lenken: <a href="{{ .ConfirmationURL }}">Logg inn</a></p>
```

The `{{ .Token }}` line is what shows the 6-digit code. The link still works too.
