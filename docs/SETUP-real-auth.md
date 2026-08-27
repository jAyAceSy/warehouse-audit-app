# Switching to real per-person logins — setup steps

This replaces the three shared passwords (`admin123` / `audit123` / `resolve123`, visible to
anyone who opens dev tools) with real Firebase accounts. Each person now has their own email +
password, and the **database itself** checks their role before allowing a write — not just the
app's UI. This is a one-time, breaking change: old logins stop working the moment you deploy this.

## 1. Turn on Email/Password sign-in
Firebase Console → your project → **Authentication** → **Sign-in method** → enable **Email/Password**.

## 2. Publish the Security Rules
Firebase Console → **Realtime Database** → **Rules** tab → paste the contents of
`firebase-security-rules.json` → **Publish**.

This is the part that actually enforces roles server-side. Until you publish these rules, the new
login screen will work but writes still won't be locked down the way the app intends.

## 3. Deploy the updated `index.html`
Same as before — this is a self-contained file, no build step.

## 4. Create the first Admin account
Open the app. Since no admin exists yet, you'll see **"First time here? Create the admin
account"** on the login screen. Fill in a name, a real email, and a password (6+ characters) —
this becomes the first Admin, and this option disappears for everyone else once it's used.

## 5. Recreate your other accounts
From **Admin Panel → User Management**, use **Create New User** to add each Auditor, Resolver,
and any other Admin with their own email + a temporary password. Share those credentials with
them directly (Slack/email/etc.) — they can change their password later via **Forgot password?**
on the login screen, or you can trigger a reset email for them from the same User Management
screen (**Reset PW** button).

## What this buys you
- Passwords are no longer sitting in plain text in the page source.
- Firebase Security Rules check the signed-in user's `role` and `active` status on every read and
  write — someone opening dev tools and calling the database API directly is still bound by the
  same role restrictions the UI shows them.
- Deactivating a user (or changing their role) now takes effect immediately, even mid-session —
  they'll be signed out automatically the next time the rule is evaluated.

## Known limitation
A client-side app (this one) can create Firebase Auth accounts and disable a user's *access* to
the data (via the `active` flag), but it **cannot fully delete another person's sign-in
credentials** — that requires the Firebase Admin SDK (a server, e.g. a small Cloud Function),
which is outside what a single static HTML file can do. "Remove" in User Management revokes their
role/data access completely; if you also want their login itself gone, delete it from Firebase
Console → Authentication → Users.
