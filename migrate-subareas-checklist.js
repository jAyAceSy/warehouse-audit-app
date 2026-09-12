/* ============================================================ ONE-TIME DATA MIGRATION ============================================================
   Purpose: copy live data from the old path/field names to the new ones, as part of renaming
   "checklist item" -> "sub-area" and "title template" -> "checklist".

   checklistsByArea/{siteId}      -->  subAreasByArea/{siteId}       (per-Area list of sub-areas)
   titleTemplatesBySite/{siteId}  -->  checklistsBySite/{siteId}     (per-Site checklist)
   finding.checklistItemId        -->  finding.subAreaId             (on every finding)
   report entry.checklistItemId   -->  report entry.subAreaId        (on every report's entries)

   SAFETY:
   - This ONLY copies data forward. It never deletes or overwrites the old paths/fields.
     Your original data stays exactly where it was, untouched, as a fallback.
   - It's idempotent — safe to run more than once. Already-migrated sites/findings are skipped.
   - It reads and writes YOUR live database, so back up first (Firebase Console -> Realtime
     Database -> the "..." menu -> Export JSON) before running this, just in case.

   HOW TO RUN:
   1. Make sure the NEW security rules (firebase-security-rules.json) are published first —
      see the instructions that came with this file. This script needs both old and new paths
      to be readable/writable, which the updated rules allow.
   2. Open your live site in a browser and log in as an Admin.
   3. Open DevTools (F12) -> Console tab.
   4. Paste this entire script in and press Enter.
   5. Watch the console output. It logs progress per site and a final summary.
   6. Only after this finishes successfully should you deploy the renamed app code.
============================================================ */
(async function migrateChecklistToSubAreas(){
  if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
    console.error('Firebase is not initialized on this page yet. Make sure the app finished loading (you should be logged in) before running this script.');
    return;
  }
  const db = firebase.database();
  const summary = { sitesSubAreasCopied:0, sitesSubAreasSkipped:0, sitesChecklistCopied:0, sitesChecklistSkipped:0, findingsFixed:0, findingsSkipped:0, reportEntriesFixed:0, reportEntriesSkipped:0 };

  console.log('Starting migration...');

  const sitesSnap = await db.ref('warehouseAuditData/sites').once('value');
  const siteIds = Object.keys(sitesSnap.val() || {});
  console.log(`Found ${siteIds.length} site(s):`, siteIds);

  for (const siteId of siteIds) {
    console.log(`\n--- Site ${siteId} ---`);

    // 1) checklistsByArea -> subAreasByArea
    const newSubAreasSnap = await db.ref(`warehouseAuditData/subAreasByArea/${siteId}`).once('value');
    if (newSubAreasSnap.exists()) {
      console.log('  subAreasByArea already exists for this site — skipping copy.');
      summary.sitesSubAreasSkipped++;
    } else {
      const oldChecklistSnap = await db.ref(`warehouseAuditData/checklistsByArea/${siteId}`).once('value');
      if (oldChecklistSnap.exists()) {
        await db.ref(`warehouseAuditData/subAreasByArea/${siteId}`).set(oldChecklistSnap.val());
        console.log('  Copied checklistsByArea -> subAreasByArea.');
        summary.sitesSubAreasCopied++;
      } else {
        console.log('  No old checklistsByArea data for this site — nothing to copy.');
      }
    }

    // 2) titleTemplatesBySite -> checklistsBySite
    const newChecklistSnap = await db.ref(`warehouseAuditData/checklistsBySite/${siteId}`).once('value');
    if (newChecklistSnap.exists()) {
      console.log('  checklistsBySite already exists for this site — skipping copy.');
      summary.sitesChecklistSkipped++;
    } else {
      const oldTitlesSnap = await db.ref(`warehouseAuditData/titleTemplatesBySite/${siteId}`).once('value');
      if (oldTitlesSnap.exists()) {
        await db.ref(`warehouseAuditData/checklistsBySite/${siteId}`).set(oldTitlesSnap.val());
        console.log('  Copied titleTemplatesBySite -> checklistsBySite.');
        summary.sitesChecklistCopied++;
      } else {
        console.log('  No old titleTemplatesBySite data for this site — nothing to copy.');
      }
    }

    // 3) findings: add subAreaId alongside existing checklistItemId
    const findingsSnap = await db.ref(`warehouseAuditData/findings/${siteId}`).once('value');
    const findings = findingsSnap.val() || {};
    const findingUpdates = {};
    Object.entries(findings).forEach(([id, f]) => {
      if (f && f.checklistItemId !== undefined && f.subAreaId === undefined) {
        findingUpdates[`${id}/subAreaId`] = f.checklistItemId;
      }
    });
    const findingUpdateCount = Object.keys(findingUpdates).length;
    if (findingUpdateCount) {
      await db.ref(`warehouseAuditData/findings/${siteId}`).update(findingUpdates);
      console.log(`  Added subAreaId to ${findingUpdateCount} finding(s).`);
      summary.findingsFixed += findingUpdateCount;
    } else {
      console.log('  No findings needed a subAreaId update.');
    }

    // 4) report entries: add subAreaId alongside existing checklistItemId
    const reportsSnap = await db.ref(`warehouseAuditData/reports/${siteId}`).once('value');
    const reports = reportsSnap.val() || {};
    for (const [reportId, report] of Object.entries(reports)) {
      if (!report || !report.entries) continue;
      const entryUpdates = {};
      Object.entries(report.entries).forEach(([entryId, e]) => {
        if (e && e.checklistItemId !== undefined && e.subAreaId === undefined) {
          entryUpdates[`${entryId}/subAreaId`] = e.checklistItemId;
        }
      });
      const entryUpdateCount = Object.keys(entryUpdates).length;
      if (entryUpdateCount) {
        await db.ref(`warehouseAuditData/reports/${siteId}/${reportId}/entries`).update(entryUpdates);
        summary.reportEntriesFixed += entryUpdateCount;
      }
    }
    console.log(`  Report entries fixed so far (running total): ${summary.reportEntriesFixed}`);
  }

  console.log('\n=== Migration complete ===');
  console.log(summary);
  console.log('Nothing was deleted. Old paths/fields are still intact as a fallback.');
})();
