# Multi-Site setup

The app now has a Site → Area → Checklist hierarchy, with real per-Site data isolation enforced by
Security Rules — an Auditor or Resolver assigned only to one Site cannot read or write another
Site's findings, reports, or checklists, even by tampering with the browser console.

This is a breaking data-model change (new database paths). It starts **completely empty** — no
migration of your old floor-based data, which is left untouched and orphaned in the database.

## 1. Publish the updated Security Rules
Firebase Console → Realtime Database → Rules → paste the contents of `firebase-security-rules.json`
→ Publish. This is required before Site-level isolation actually takes effect — without it, the
app's UI will still work but nothing is enforced server-side.

## 2. Deploy the updated `index.html`
Same as before, no build step.

## 3. Create your Sites
Sign in as Admin → Daily Audit tab → Admin Tools → **Manage Sites**. Add Davao Warehouse, Gensan
Warehouse, Davao Production (or whatever you want to call them).

## 4. Add Areas to each Site
From Manage Sites, tap the clipboard icon next to a Site (or Admin Tools → **Manage Areas** once
you've selected that Site) to add its Areas — these replace what used to be called "Floors."

## 5. Add checklist items to each Area
Same as before — open the Site, pick an Area, and use the **+** button on the checklist card to
add items.

## 6. Assign Auditors and Resolvers to Sites
Admin Tools → **User Management** → for each non-Admin user, check the Site(s) they should have
access to. A user can be assigned to multiple Sites. Admin automatically has access to every Site
and doesn't need explicit assignment.

## What changed for end users
- The Daily Audit screen now starts with a Site picker (skipped automatically if someone's only
  assigned to one Site), then an Area picker, then the checklist.
- The checklist itself is now a single screen: tap **OK** to clear an item, or the wrench icon to
  flag an issue and log a finding — no more drilling into a separate screen for the common case.
- If an audit is started but never submitted, it now shows up as an **in-progress audit** (visible
  to Admin on that Area's picker, and in Admin Tools → **In-Progress Audits**) instead of silently
  sitting there. Admin can **Force Submit** a stale one, and it's recorded under its real start
  date, not the day someone got around to closing it out.
- Reports, exports, and the Dashboard all gained a Site dimension — the Dashboard defaults to all
  Sites combined, with a Site filter; report exports (PDF/CSV) now show which Site each row is from.

## Known limitation
Every signed-in, active user can read the full list of Site and Area **names** (not their
findings/reports/checklists — just the metadata), since that's needed to resolve someone's own
assigned Site IDs into readable names. If Site or Area names themselves need to stay confidential
between Sites, that would need a further rules change — flag it if that matters for your setup.
