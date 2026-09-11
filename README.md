# Warehouse Audit Findings System

A Firebase (Realtime Database + Authentication) web app for running warehouse checklist audits,
tracking findings through resolution, and managing multi-role access (Admin / Auditor / Resolver)
across floors — synced live across every connected device.

**No build step, no framework, no bundler.** This is plain HTML/CSS/JavaScript using native ES
modules — open `index.html` in a browser (or serve it statically) and it runs as-is.

## Why this structure

The app used to be a single 3,271-line `index.html` file with all markup, styles, and logic
inlined. It's now split by responsibility into real ES modules with explicit `import`/`export`
boundaries — not just files chopped along old comment headers. `index.html` loads exactly one
script (`main.js`); everything else is pulled in through the import graph below.

```
index.html                 Page shell (markup only) + <script type="module" src="main.js">
main.js                    App entry point — bootstraps Firebase, kicks off the first render

config/
  firebase.config.js       The firebaseConfig object (per-project, swap for a test project here)
  constants.js             Shared app-wide constants (DB_PATH, due-date offsets, default titles)

state/
  store.js                 The single in-memory `state` object + derived-data accessor functions
                            (currentSite, currentAreaList, computeAccessibleSiteIds, etc.)

services/
  firebase.service.js      All Firebase Realtime Database + Auth logic: init, listeners,
                            read/write helpers, presence heartbeat, image compression for uploads

utils/
  helpers.js                Generic helpers shared across pages: id/date generation, finding
                            status/formatting logic, filtered-findings queries

assets/
  icons.js                  Inline SVG icon strings used throughout the UI

components/
  Modal.js                  Modal dialog system (openModal/closeModal/openConfirmModal/openImageViewer)
  TopBar.js                 Top bar (title, sync indicator, notifications bell + panel)
  Home.js                   Small internal-navigation helper (kept for compatibility)

pages/
  WelcomePage.js             Login / first-time-admin bootstrap / role gate screen
  AuditPage.js                Daily Audit tab — by far the largest page (checklist, findings,
                              admin tools: site/area/user/staff management, archive, activity log)
  ReportsPage.js              Reports & Summary tab (CSV/PDF export, report preview)
  DashboardPage.js            Dashboard tab (KPIs, trend charts, filtered findings list)

layouts/
  router.js                   The nav/render loop: owns the app shell (topbar/content/bottom nav/
                               FAB) and decides which page to render based on `state.tab`

css/
  styles.css                  All styling (unchanged from the original, just extracted)

docs/                          Setup guides (real auth, Firebase Hosting, multi-site)
firebase-config.example.json   Template for config/firebase.config.js's shape
firebase-security-rules.json   Realtime Database Security Rules — publish this in Firebase Console
firebase.json                  Firebase Hosting config
netlify.toml                   Netlify hosting config (legacy)
```

**Load order still matters, but it's now explicit.** These are real ES modules (`type="module"`),
so instead of relying on `<script>` tag order like before, each file's dependencies are declared
at the top via `import`. The browser resolves the whole graph starting from `main.js` automatically
— you never need to think about ordering by hand again, even if you add new files.

**Third-party libraries** (Chart.js, jsPDF, the Firebase compat SDK) are still loaded the original
way, as classic `<script>` tags in `index.html` that attach to `window` — that part didn't change,
since they aren't ES modules themselves.

## What changed vs. what didn't

This was a structural refactor only — verified line-by-line against the original file:
- Every function, every UI string, every style rule is byte-for-byte the same code, just relocated.
- No feature, screen, calculation, validation, or user flow was altered.
- The only "new" code is `import`/`export` statements and file-header comments explaining each
  module's job.

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
5. Swap the values in `config/firebase.config.js` for your test project's values (or duplicate the
   whole repo folder for a throwaway copy).
6. Open `index.html` locally (just double-click it, or serve it with any static file server — note
   some browsers restrict ES module imports over the `file://` protocol, so a simple local server
   like `npx serve` or the VS Code "Live Server" extension is the most reliable way to test) and go
   through the full first-time-admin bootstrap flow. This is safe to break — no real data involved.
7. Once confident, restore the production values in `config/firebase.config.js` before deploying.

## Deploying

Still a static site — any static host works, as long as it serves all the folders above with their
relative paths intact (this matters more now that the app is split into multiple files):
- **Firebase Hosting**: `firebase init hosting` (point the public directory at this repo root),
  then `firebase deploy`. See `docs/SETUP-firebase-hosting.md`, including a no-local-install option
  via GitHub Actions.
- **GitHub Pages**: enable Pages on this repo, serving from the root of the default branch.
- Or upload the whole folder to any web server / object storage with static site hosting.

Whatever you use, also add that domain to **Firebase Console → Authentication → Settings →
Authorized domains**, or sign-in will fail with an `unauthorized-domain` error.

## First deploy / migration checklist

See `docs/SETUP-real-auth.md` for the full walkthrough. Short version:
1. Enable Email/Password sign-in.
2. Publish the Security Rules.
3. Deploy the whole folder.
4. Create the first Admin via the "First time here?" link on the login screen.
5. From Admin → User Management, create accounts for everyone else.

## A note on the API key in `config/firebase.config.js`

Firebase web `apiKey` values are not secrets — they identify your project, they don't grant
access on their own. Actual data protection comes entirely from the Security Rules in
`firebase-security-rules.json`. It's fine for this key to be visible in a public repo or in page
source; just make sure the rules are published before real users touch the app.
