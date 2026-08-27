# Warehouse Audit Findings System

Single-file HTML application (Firebase Realtime Database + Firebase Authentication) for running
warehouse checklist audits, tracking findings through resolution, and managing multi-role access
(Admin / Auditor / Resolver) across floors — synced live across every connected device.

## Repo contents

| File | Purpose |
|---|---|
| `index.html` | The entire application — UI, styles, and logic in one file. **Currently wired to your production Firebase project.** |
| `firebase-security-rules.json` | Realtime Database Security Rules. This is what actually enforces roles server-side — publish it in Firebase Console → Realtime Database → Rules. |
| `firebase-config.example.json` | Template showing the shape of the `firebaseConfig` object `index.html` expects, for setting up a second project. |
| `docs/SETUP-real-auth.md` | Step-by-step: enable Email/Password sign-in, publish rules, create your first Admin, recreate other accounts. |

## Setting up a separate test environment (recommended before every real deploy)

Testing account creation, role changes, and deletions directly against production data is risky.
Spin up a second, throwaway Firebase project instead:

1. **Firebase Console → Add project.** Name it something obviously separate, e.g.
   `warehouse-audit-app-TEST`.
2. **Enable Realtime Database** on the new project (any region), and **Authentication →
   Sign-in method → Email/Password**.
3. **Publish `firebase-security-rules.json`** to this test project's Realtime Database Rules tab —
   same file, no changes needed.
4. **Project Settings → General → Your apps → Add app (Web)** to get a new config object. Copy it
   into `firebase-config.example.json`'s shape.
5. Make a local copy of `index.html` — e.g. `index.test.html` — and replace the `firebaseConfig`
   object (around line 645, `const firebaseConfig = {...}`) with your test project's values.
6. Open `index.test.html` locally (just double-click it, or serve it with any static file server)
   and go through the full first-time-admin bootstrap flow there. This file is safe to break —
   it's talking to a project with no real data in it.
7. Once you're confident, deploy the untouched `index.html` (pointed at production) as normal.

`index.test.html` is git-ignored by default (see `.gitignore`) so you don't accidentally commit a
second live config or mix up which file is which.

## Deploying

This app has no build step — it's a static file. Any static host works:
- **Firebase Hosting**: `firebase init hosting` (point the public directory at this repo root),
  then `firebase deploy`.
- **GitHub Pages**: enable Pages on this repo, serving from the root of the default branch.
- Or just upload `index.html` to any web server / object storage with static site hosting.

Whatever you use, also add that domain to **Firebase Console → Authentication → Settings →
Authorized domains**, or sign-in will fail with an `unauthorized-domain` error.

## First deploy / migration checklist

See `docs/SETUP-real-auth.md` for the full walkthrough. Short version:
1. Enable Email/Password sign-in.
2. Publish the Security Rules.
3. Deploy `index.html`.
4. Create the first Admin via the "First time here?" link on the login screen.
5. From Admin → User Management, create accounts for everyone else.

## A note on the API key in `index.html`

Firebase web `apiKey` values are not secrets — they identify your project, they don't grant
access on their own. Actual data protection comes entirely from the Security Rules in
`firebase-security-rules.json`. It's fine for this key to be visible in a public repo or in page
source; just make sure the rules are published before real users touch the app.
