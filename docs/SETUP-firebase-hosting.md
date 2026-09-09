# Moving hosting from Netlify to Firebase Hosting

Since your company network blocks Netlify (and Vercel/Supabase), but allows Firebase, hosting the
app on Firebase itself sidesteps the block entirely — same Google account you already use for
Authentication and the Database, no new service needs approval.

This needs to be run from your own computer once, since it requires an interactive Google login
that can't be done from a sandboxed environment.

## One-time setup

1. Install Node.js if you don't already have it: [nodejs.org](https://nodejs.org) (LTS version).
2. Install the Firebase CLI:
   ```
   npm install -g firebase-tools
   ```
3. Log in (opens a browser window for your Google account):
   ```
   firebase login
   ```
4. Download this repository to your computer (or `git clone` it), then open a terminal inside the
   repo folder.
5. Connect the CLI to your project:
   ```
   firebase use --add
   ```
   Pick **warehouse-audit-app-v2** from the list, and give it an alias like `default` when asked.

## Deploying

From inside the repo folder:
```
firebase deploy --only hosting
```

That's it. It will print a live URL that looks like:
```
https://warehouse-audit-app-v2.web.app
```
or
```
https://warehouse-audit-app-v2.firebaseapp.com
```

Both of those domains are on Google's own infrastructure — the same domains Firebase
Authentication already uses — so if Firebase itself isn't blocked, these won't be either.

## Every time you want to redeploy after a future update

Just run the same command again from inside the repo folder:
```
firebase deploy --only hosting
```
It publishes whatever `index.html` is currently in the folder — no build step, nothing else to
configure.

## Authorized domains

Once you have your new `.web.app` or `.firebaseapp.com` URL, go to Firebase Console →
**Authentication → Settings → Authorized domains** and confirm that domain is listed (Firebase
Hosting domains are usually added automatically the first time you deploy, but it's worth
checking) — otherwise sign-in will fail with an `unauthorized-domain` error.

## What to do with the old Netlify site

You can leave it as-is (harmless, just unreachable from your office network) or delete it from
your Netlify dashboard once the Firebase Hosting URL is confirmed working. Share the new URL with
your team either way — the old Netlify link will still resolve, it'll just be unusable behind your
company firewall.
