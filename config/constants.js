/* ============================================================
   APP-WIDE CONSTANTS
   Small fixed values used by more than one module. Kept separate from firebase.config.js because
   these aren't credentials/environment-specific — they're just shared application constants.
============================================================ */

// Realtime Database root path everything is nested under.
export const DB_PATH = 'warehouseAuditData';

// How many days after a finding is logged it becomes "due", per severity.
export const DUE_OFFSET_DAYS = { High: 0, Medium: 3, Low: 7 };

// Default checklist-item issue titles offered when none have been customized yet for a site.
export const DEFAULT_TITLE_TEMPLATES = [
  'Damaged Stocks', 'Missing Tags', 'FEFO Concerns', 'Expired Items', 'Blocked Fire Exit',
  'Poor Housekeeping', 'Wrong Location', 'Broken Rack', 'Leaking Container', 'Pest Sighting'
];
