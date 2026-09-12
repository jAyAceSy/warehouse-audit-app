/* ============================================================ FIREBASE REAL-TIME SERVICE ============================================================
   Data model — Site is the top-level isolation boundary. Everything under findings/reports/checklists/
   etc. is nested one level deeper by siteId, and Security Rules gate each site's subtree individually,
   so an Auditor/Resolver assigned only to Site A is physically blocked from reading or writing Site B's
   data — not just hidden from it in the UI.

     warehouseAuditData/
       sites/                        { [siteId]: {name,createdAt,createdBy,active} }               — broadly readable, admin-writable
       areasBySite/                  { [siteId]: { [areaId]: {name,order,createdAt} } }             — broadly readable, admin-writable
       subAreasByArea/{siteId}/      { [areaId]: [subAreas] }                                       — per-site gated
       findings/{siteId}/            { [findingId]: finding }                                       — per-site gated
       reports/{siteId}/             { [reportId]: report }                                         — per-site gated
       areaLastSubmitted/{siteId}/   { [areaId]: timestamp }                                        — per-site gated
       checklistsBySite/{siteId}     [checklist item strings]                                       — per-site gated
       staffByArea/{siteId}/         { [areaId]: [names] }                                          — per-site gated
       pendingStaff/{siteId}/        { [id]: {...} }                                                — per-site gated
       activityLog/{siteId}/         { [id]: {...} }                                                — per-site gated (site-scoped notifications)
       adminActivityLog/             { [id]: {...} }                                                — admin-only (user mgmt, site/area mgmt)
       archive/findings/{siteId}/, archive/reports/{siteId}/                                        — per-site gated, admin-only write
       userRoles/{uid}                {name,email,role,active,lastSeen,createdAt,createdBy,sites:{[siteId]:true}}
       meta/bootstrapped              true once the first Admin account exists
   See the accompanying Security Rules doc for how writes are actually enforced server-side.

   NOTE: Firebase itself (firebase.*) comes from the classic <script> tags loaded in index.html
   before this module runs (firebase-app/database/auth-compat.js), so it's available here as a
   global — no import needed for it, same as in the original single-file app.
============================================================ */
import { firebaseConfig } from '../config/firebase.config.js';
import { DB_PATH, DEFAULT_CHECKLIST } from '../config/constants.js';
import { ICONS } from '../assets/icons.js';
import { state, computeAccessibleSiteIds } from '../state/store.js';
import { toast } from '../utils/helpers.js';
import { render } from '../layouts/router.js';
import { renderTopbar } from '../components/TopBar.js';

export let storageAvailable=false;
export let db=null;
export let auth=null;
export let secondaryApp=null;      // isolated Firebase app instance so Admin can create accounts without being signed out of their own session
export let refs={};                // top-level refs that don't depend on which sites are accessible (sites, areasBySite, userRoles, meta, users, adminActivityLog, archive roots)
export let siteListeners={};       // { [siteId]: { findings, reports, subAreas, areaLastSubmitted, checklist, staffByArea, pendingStaff, activityLog, archiveFindings, archiveReports } } — dynamically attached/detached per accessible site
export let listenersAttached=false;
export let appDataLoaded=false;
export let myRoleRef=null;

export function initFirebase(){
  const configured = firebaseConfig.apiKey && firebaseConfig.apiKey!=='YOUR_API_KEY_HERE'
    && firebaseConfig.databaseURL && !firebaseConfig.databaseURL.includes('YOUR_PROJECT_ID');
  if(!configured){ storageAvailable=false; return; }
  try{
    firebase.initializeApp(firebaseConfig);
    db=firebase.database();
    auth=firebase.auth();
    refs.root=db.ref(DB_PATH);
    refs.sites=db.ref(`${DB_PATH}/sites`);
    refs.areasBySite=db.ref(`${DB_PATH}/areasBySite`);
    refs.users=db.ref(`${DB_PATH}/users`);
    refs.userRoles=db.ref(`${DB_PATH}/userRoles`);
    refs.meta=db.ref(`${DB_PATH}/meta`);
    refs.adminActivityLog=db.ref(`${DB_PATH}/adminActivityLog`);
    storageAvailable=true;
    // Firebase's own connection-state node — lets us show real offline/online status.
    db.ref('.info/connected').on('value',snap=>{
      state.firebaseConnected=!!snap.val();
      if(state.tab!=='welcome') renderTopbar();
    });
    // Publicly-readable flag so the login screen knows whether an admin account exists yet.
    refs.meta.child('bootstrapped').on('value',snap=>{
      state.needsBootstrap = snap.val()!==true;
      if(state.tab==='welcome' && !state.uid) render();
    });
  }catch(e){ console.error('Firebase failed to initialize',e); storageAvailable=false; }
}

/* ---------- Authentication: real per-person accounts, role sourced from the database, not chosen by the user ---------- */
export function initAuthListener(){
  auth.onAuthStateChanged(user=>{
    if(user){
      state.uid=user.uid;
      state.email=user.email;
      subscribeToMyRole(user.uid);
    }else{
      stopPresenceHeartbeat();
      detachAllDataListeners();
      state.uid=null; state.email=''; state.role=null; state.username='';
      state.authChecking=false;
      state.tab='welcome'; state.welcomeStep='login';
      render();
    }
  });
}
export let bootstrappingInProgress=false;
export function subscribeToMyRole(uid){
  if(myRoleRef) myRoleRef.off();
  myRoleRef=refs.userRoles.child(uid);
  myRoleRef.on('value', async snap=>{
    const rec=snap.val();
    if(!rec || rec.active===false){
      if(bootstrappingInProgress) return; // the role record is mid-write for a brand-new account; ignore this transient empty read
      const wasIn=!!state.role;
      state.role=null;
      state.authChecking=false;
      if(wasIn) toast(rec ? 'Your account has been deactivated. Contact your Admin.' : 'No role assigned to your account yet. Contact your Admin.');
      auth.signOut();
      return;
    }
    state.username=rec.name||state.email;
    state.role=rec.role;
    state.authChecking=false;
    startPresenceHeartbeat(uid);
    if(!appDataLoaded){
      appDataLoaded=true;
      logActivity(null, 'Login', `Signed in as ${rec.role}`);
      await loadPersistedData();
      state.tab = state.role==='resolver' ? 'dashboard' : 'audit';
    }
    reconcileSiteSubscriptions(); // re-evaluates every time role/site-access changes, not just on first login
    render();
  }, err=>{
    console.error('role listener failed',err);
    state.authChecking=false;
  });
}
export function detachAllDataListeners(){
  if(myRoleRef){ myRoleRef.off(); myRoleRef=null; }
  Object.keys(siteListeners).forEach(siteId=>detachSiteListeners(siteId));
  if(!listenersAttached) return;
  ['sites','areasBySite','users','userRoles','adminActivityLog'].forEach(k=>{
    if(refs[k]) refs[k].off();
  });
  listenersAttached=false;
  appDataLoaded=false;
}
async function signInWithEmail(email,password,rememberMe){
  await auth.setPersistence(rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
  return auth.signInWithEmailAndPassword(email,password);
}
async function bootstrapFirstAdmin(name,email,password){
  // Security Rules only allow this write while the userRoles tree is completely empty — see the shared rules doc.
  bootstrappingInProgress=true;
  try{
    const cred=await auth.createUserWithEmailAndPassword(email,password);
    await refs.userRoles.child(cred.user.uid).set({name,email,role:'admin',active:true,createdAt:Date.now(),createdBy:'bootstrap'});
    await refs.meta.child('bootstrapped').set(true);
    return cred;
  } finally {
    bootstrappingInProgress=false;
  }
}
export function getSecondaryAuth(){
  if(!secondaryApp){
    try{ secondaryApp=firebase.app('secondary'); }
    catch(e){ secondaryApp=firebase.initializeApp(firebaseConfig,'secondary'); }
  }
  return secondaryApp.auth();
}
async function createUserByAdmin(name,email,password,role){
  const sAuth=getSecondaryAuth();
  try{
    const cred=await sAuth.createUserWithEmailAndPassword(email,password);
    await refs.userRoles.child(cred.user.uid).set({name,email,role,active:true,createdAt:Date.now(),createdBy:state.email});
    await sAuth.signOut();
    logActivity(null, 'User created', `${name} (${role})`);
    return true;
  }catch(e){
    toast(friendlyFirebaseError(e)); return false;
  }
}
async function setUserRole(uid,role){
  try{ await refs.userRoles.child(uid).update({role}); logActivity(null, 'User role changed', role); }
  catch(e){ toast(friendlyFirebaseError(e)); }
}
async function setUserActive(uid,active){
  try{ await refs.userRoles.child(uid).update({active}); logActivity(null, active?'User activated':'User deactivated'); }
  catch(e){ toast(friendlyFirebaseError(e)); }
}
async function setUserSites(uid,sitesMap){
  try{ await refs.userRoles.child(uid).update({sites:sitesMap}); logActivity(null, 'User site access changed'); }
  catch(e){ toast(friendlyFirebaseError(e)); }
}
async function removeUserRecord(uid){
  try{ await refs.userRoles.child(uid).remove(); logActivity(null, 'User deleted'); }
  catch(e){ toast(friendlyFirebaseError(e)); }
}
async function sendPasswordReset(email){
  try{ await auth.sendPasswordResetEmail(email); toast('Password reset email sent to '+email); }
  catch(e){ toast(friendlyFirebaseError(e)); }
}

export function friendlyFirebaseError(e){
  console.error('Firebase error:', e);
  const code=(e && (e.code||e.message)||'').toLowerCase();
  if(code.includes('operation-not-allowed')) return 'Email/Password sign-in isn\'t turned on yet — enable it in Firebase Console → Authentication → Sign-in method.';
  if(code.includes('permission-denied')||code.includes('permission_denied')) return 'Permission denied — either your account doesn\'t have access, or the Security Rules haven\'t been published yet.';
  if(code.includes('email-already-in-use')) return 'That email already has an account.';
  if(code.includes('weak-password')) return 'Password is too weak — use at least 6 characters.';
  if(code.includes('invalid-email')) return 'That doesn\'t look like a valid email address.';
  if(code.includes('user-disabled')) return 'This account has been disabled in Firebase Authentication.';
  if(code.includes('user-not-found')||code.includes('wrong-password')||code.includes('invalid-credential')||code.includes('invalid-login-credentials')) return 'Incorrect email or password.';
  if(code.includes('too-many-requests')) return 'Too many attempts — please wait a moment and try again.';
  if(code.includes('unauthorized-domain')) return 'This web address isn\'t in Firebase\'s authorized domains list yet — add it under Authentication → Settings → Authorized domains.';
  if(code.includes('configuration-not-found')) return 'Email/Password sign-in isn\'t turned on yet — enable it in Firebase Console → Authentication → Sign-in method.';
  if(code.includes('network')||!navigator.onLine) return 'You appear to be offline — changes will sync once you\'re back online.';
  return `Something went wrong${e&&e.code?` (${e.code})`:''} — open the browser console for details.`;
}

/* ---------- One-time migration from the old single-blob schema ---------- */
/* ---------- Live subscriptions ---------- */
export function objMapToArray(obj){ return obj ? Object.values(obj) : []; }
export function objMapToEntriesArray(obj){ return obj ? Object.entries(obj).map(([id,v])=>({id,...v})) : []; }

export function rerenderIfIdle(){
  const modalOpen=document.getElementById('modalOverlay').classList.contains('open');
  if(!modalOpen && state.tab!=='welcome') render();
}

export function recomputeFlatFindings(){
  const out=[];
  Object.values(state.findingsBySite).forEach(bucket=>Object.values(bucket||{}).forEach(f=>out.push(f)));
  state.findings=out.sort((a,b)=>b.createdAt-a.createdAt);
}
export function recomputeFlatReports(){
  const out=[];
  Object.values(state.reportsBySite).forEach(bucket=>Object.values(bucket||{}).forEach(r=>out.push(r)));
  state.reports=out.sort((a,b)=>b.id-a.id);
}
export function recomputeFlatActivityLog(){
  const out=[];
  Object.values(state.activityLogBySite).forEach(bucket=>objMapToEntriesArray(bucket).forEach(e=>out.push(e)));
  state.activityLog=[...out,...state.adminActivityLog].sort((a,b)=>(b.ts||0)-(a.ts||0));
}
export function recomputeFlatArchive(){
  const fout=[],rout=[];
  Object.values(state.archivedFindingsBySite).forEach(bucket=>Object.values(bucket||{}).forEach(f=>fout.push(f)));
  Object.values(state.archivedReportsBySite).forEach(bucket=>Object.values(bucket||{}).forEach(r=>rout.push(r)));
  state.archivedFindings=fout.sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
  state.archivedReports=rout.sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
}

/* ---------- Per-Site subscriptions: attached only for Sites the signed-in user can actually access.
   Admin's accessible set is every Site that exists; an Auditor/Resolver's is only their assigned Sites
   (userRoles/{uid}/sites). This list is re-evaluated whenever the Sites list changes or an Admin edits
   someone's access, and listeners are attached/detached to match — never leaving a stale subscription
   open to a Site someone just lost access to. ---------- */
export function attachSiteListeners(siteId){
  const base=DB_PATH;
  const l={
    findings:db.ref(`${base}/findings/${siteId}`),
    reports:db.ref(`${base}/reports/${siteId}`),
    subAreas:db.ref(`${base}/subAreasByArea/${siteId}`),
    areaLastSubmitted:db.ref(`${base}/areaLastSubmitted/${siteId}`),
    checklist:db.ref(`${base}/checklistsBySite/${siteId}`),
    staffByArea:db.ref(`${base}/staffByArea/${siteId}`),
    pendingStaff:db.ref(`${base}/pendingStaff/${siteId}`),
    activityLog:db.ref(`${base}/activityLog/${siteId}`),
    archiveFindings:db.ref(`${base}/archive/findings/${siteId}`),
    archiveReports:db.ref(`${base}/archive/reports/${siteId}`),
  };
  l.findings.on('value',snap=>{ state.findingsBySite[siteId]=snap.val()||{}; recomputeFlatFindings(); rerenderIfIdle(); });
  l.reports.on('value',snap=>{ state.reportsBySite[siteId]=snap.val()||{}; recomputeFlatReports(); rerenderIfIdle(); });
  l.subAreas.on('value',snap=>{ state.subAreasByArea[siteId]=snap.val()||{}; rerenderIfIdle(); });
  l.areaLastSubmitted.on('value',snap=>{ state.areaLastSubmitted[siteId]=snap.val()||{}; rerenderIfIdle(); });
  l.checklist.on('value',snap=>{ const d=snap.val(); state.checklistsBySite[siteId]=(Array.isArray(d)&&d.length)?d:DEFAULT_CHECKLIST.slice(); rerenderIfIdle(); });
  l.staffByArea.on('value',snap=>{ state.staffByAreaBySite[siteId]=snap.val()||{}; rerenderIfIdle(); });
  l.pendingStaff.on('value',snap=>{ state.pendingStaffBySite[siteId]=snap.val()||{}; rerenderIfIdle(); });
  l.activityLog.on('value',snap=>{ state.activityLogBySite[siteId]=snap.val()||{}; recomputeFlatActivityLog(); rerenderIfIdle(); });
  l.archiveFindings.on('value',snap=>{ state.archivedFindingsBySite[siteId]=snap.val()||{}; recomputeFlatArchive(); rerenderIfIdle(); });
  l.archiveReports.on('value',snap=>{ state.archivedReportsBySite[siteId]=snap.val()||{}; recomputeFlatArchive(); rerenderIfIdle(); });
  siteListeners[siteId]=l;
}
export function detachSiteListeners(siteId){
  const l=siteListeners[siteId];
  if(!l) return;
  Object.values(l).forEach(ref=>ref.off());
  delete siteListeners[siteId];
  ['findingsBySite','reportsBySite','subAreasByArea','areaLastSubmitted','checklistsBySite','staffByAreaBySite','pendingStaffBySite','activityLogBySite','archivedFindingsBySite','archivedReportsBySite'].forEach(k=>delete state[k][siteId]);
  recomputeFlatFindings(); recomputeFlatReports(); recomputeFlatActivityLog(); recomputeFlatArchive();
}
export function reconcileSiteSubscriptions(){
  if(!storageAvailable || !state.role) return;
  const accessible=computeAccessibleSiteIds();
  state.accessibleSiteIds=accessible;
  const accessibleSet=new Set(accessible);
  Object.keys(siteListeners).forEach(siteId=>{ if(!accessibleSet.has(siteId)) detachSiteListeners(siteId); });
  accessible.forEach(siteId=>{ if(!siteListeners[siteId]) attachSiteListeners(siteId); });
  if(state.siteId && !accessibleSet.has(state.siteId)){ state.siteId=null; state.areaId=null; }
  rerenderIfIdle();
}

/* ---------- Global (not per-Site) subscriptions — Site/Area names are broadly readable so any signed-in
   user can resolve their own assigned Site IDs into names; only Admin can write them. ---------- */
export function subscribeToGlobalData(){
  refs.sites.on('value',snap=>{ state.sites=snap.val()||{}; reconcileSiteSubscriptions(); rerenderIfIdle(); });
  refs.areasBySite.on('value',snap=>{ state.areasBySite=snap.val()||{}; rerenderIfIdle(); });
  subscribeToUsers();
  subscribeToUserRoles();
  if(state.role==='admin') subscribeToAdminActivityLog();
}
export function loadPersistedData(){
  if(!storageAvailable) return Promise.resolve();
  if(!listenersAttached){
    subscribeToGlobalData();
    listenersAttached=true;
  }
  return Promise.resolve();
}

/* ---------- Centralized write functions — every mutation touches only its own Site's node ---------- */
async function saveFinding(finding){
  if(!storageAvailable) return;
  try{ await db.ref(`${DB_PATH}/findings/${finding.siteId}/${finding.id}`).set(finding); }
  catch(e){ console.error('saveFinding failed',e); toast(friendlyFirebaseError(e)); throw e; }
}
async function updateFinding(siteId, id, patch){
  if(!storageAvailable) return;
  try{ await db.ref(`${DB_PATH}/findings/${siteId}/${id}`).update(patch); }
  catch(e){ console.error('updateFinding failed',e); toast(friendlyFirebaseError(e)); }
}
async function saveReport(report){
  if(!storageAvailable) return;
  try{ await db.ref(`${DB_PATH}/reports/${report.siteId}/${report.id}`).set(report); }
  catch(e){ console.error('saveReport failed',e); toast(friendlyFirebaseError(e)); }
}
async function saveSubAreasForArea(siteId, areaId, items){
  if(!storageAvailable) return;
  try{ await db.ref(`${DB_PATH}/subAreasByArea/${siteId}/${areaId}`).set(items); }
  catch(e){ console.error('saveSubAreasForArea failed',e); toast(friendlyFirebaseError(e)); }
}
async function setAreaLastSubmitted(siteId, areaId, ts){
  if(!storageAvailable) return;
  try{ await db.ref(`${DB_PATH}/areaLastSubmitted/${siteId}/${areaId}`).set(ts); }
  catch(e){ console.error('setAreaLastSubmitted failed',e); toast(friendlyFirebaseError(e)); }
}
async function clearSiteData(siteId){
  if(!storageAvailable) return;
  try{
    const resetSubAreas={};
    const areas=state.subAreasByArea[siteId]||{};
    Object.keys(areas).forEach(areaId=>{ resetSubAreas[areaId]=(areas[areaId]||[]).map(item=>({...item,status:'unchecked'})); });
    await Promise.all([
      db.ref(`${DB_PATH}/findings/${siteId}`).set(null),
      db.ref(`${DB_PATH}/reports/${siteId}`).set(null),
      db.ref(`${DB_PATH}/subAreasByArea/${siteId}`).set(resetSubAreas),
      db.ref(`${DB_PATH}/areaLastSubmitted/${siteId}`).set(null),
    ]);
  }catch(e){ console.error('clearSiteData failed',e); toast(friendlyFirebaseError(e)); }
}

/* ---------- Archive (soft delete) + restore, per-Site ---------- */
async function archiveFinding(finding, deletedBy){
  if(!storageAvailable) return;
  try{
    const record={...finding, deletedAt:Date.now(), deletedBy:deletedBy||'Unknown'};
    const updates={};
    updates[`${DB_PATH}/archive/findings/${finding.siteId}/${finding.id}`]=record;
    updates[`${DB_PATH}/findings/${finding.siteId}/${finding.id}`]=null;
    await db.ref().update(updates);
  }catch(e){ console.error('archiveFinding failed',e); toast(friendlyFirebaseError(e)); }
}
async function restoreFinding(siteId, id){
  if(!storageAvailable) return;
  try{
    const snap=await db.ref(`${DB_PATH}/archive/findings/${siteId}/${id}`).once('value');
    const record=snap.val();
    if(!record) return;
    delete record.deletedAt; delete record.deletedBy;
    const updates={};
    updates[`${DB_PATH}/findings/${siteId}/${id}`]=record;
    updates[`${DB_PATH}/archive/findings/${siteId}/${id}`]=null;
    await db.ref().update(updates);
  }catch(e){ console.error('restoreFinding failed',e); toast(friendlyFirebaseError(e)); }
}
async function archiveReport(report, deletedBy){
  if(!storageAvailable) return;
  try{
    const record={...report, deletedAt:Date.now(), deletedBy:deletedBy||'Unknown'};
    const updates={};
    updates[`${DB_PATH}/archive/reports/${report.siteId}/${report.id}`]=record;
    updates[`${DB_PATH}/reports/${report.siteId}/${report.id}`]=null;
    await db.ref().update(updates);
  }catch(e){ console.error('archiveReport failed',e); toast(friendlyFirebaseError(e)); }
}
async function restoreReport(siteId, id){
  if(!storageAvailable) return;
  try{
    const snap=await db.ref(`${DB_PATH}/archive/reports/${siteId}/${id}`).once('value');
    const record=snap.val();
    if(!record) return;
    delete record.deletedAt; delete record.deletedBy;
    const updates={};
    updates[`${DB_PATH}/reports/${siteId}/${id}`]=record;
    updates[`${DB_PATH}/archive/reports/${siteId}/${id}`]=null;
    await db.ref().update(updates);
  }catch(e){ console.error('restoreReport failed',e); toast(friendlyFirebaseError(e)); }
}


/* ---------- Presence: each signed-in user may write only their own lastSeen field (see Security Rules) ---------- */
export let presenceInterval=null;
export let presenceUid=null;                 // guards against re-arming when our own heartbeat write re-triggers the role listener
export let presenceVisibilityHandlerAttached=false; // the visibilitychange listener is registered exactly once, ever
export function startPresenceHeartbeat(uid){
  if(presenceUid===uid && presenceInterval) return; // already running for this session — do nothing
  presenceUid=uid;
  const beat=()=>{ if(presenceUid) refs.userRoles.child(presenceUid).child('lastSeen').set(Date.now()).catch(()=>{}); };
  beat();
  if(presenceInterval) clearInterval(presenceInterval);
  presenceInterval=setInterval(beat,120000);
  if(!presenceVisibilityHandlerAttached){
    presenceVisibilityHandlerAttached=true;
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') beat(); });
  }
}
export function stopPresenceHeartbeat(){
  if(presenceInterval){ clearInterval(presenceInterval); presenceInterval=null; }
  presenceUid=null;
}
export function subscribeToUsers(){
  refs.users.on('value',snap=>{ state.users=snap.val()||{}; rerenderIfIdle(); });
}
export function subscribeToUserRoles(){
  refs.userRoles.on('value',snap=>{ state.userRoles=snap.val()||{}; rerenderIfIdle(); });
}

/* ---------- Activity log ---------- */
async function logActivity(siteId, action, detail){
  if(!storageAvailable) return;
  const entry={ user:state.username||'Unknown', role:state.role||'', ts:Date.now(), action, detail:detail||'' };
  try{
    if(siteId){
      entry.siteName=(state.sites[siteId]||{}).name||'';
      await db.ref(`${DB_PATH}/activityLog/${siteId}`).push(entry);
    }else{
      await db.ref(`${DB_PATH}/adminActivityLog`).push(entry);
    }
  }catch(e){ console.error('logActivity failed',e); }
}
export function subscribeToAdminActivityLog(){
  refs.adminActivityLog.limitToLast(150).on('value',snap=>{
    state.adminActivityLog=objMapToEntriesArray(snap.val()).sort((a,b)=>b.ts-a.ts);
    recomputeFlatActivityLog();
    rerenderIfIdle();
  });
}

/* ---------- Checklist & per-Area staff (Admin-managed, per-Site) ---------- */
async function saveChecklistForSite(siteId, list){
  if(!storageAvailable) return;
  try{ await db.ref(`${DB_PATH}/checklistsBySite/${siteId}`).set(list); }
  catch(e){ console.error('saveChecklistForSite failed',e); toast(friendlyFirebaseError(e)); }
}
async function saveStaffForArea(siteId, areaId, list){
  if(!storageAvailable) return;
  try{ await db.ref(`${DB_PATH}/staffByArea/${siteId}/${areaId}`).set(list); }
  catch(e){ console.error('saveStaffForArea failed',e); toast(friendlyFirebaseError(e)); }
}
async function addPendingStaff(siteId, name, areaId, requestedBy){
  if(!storageAvailable) return;
  try{ await db.ref(`${DB_PATH}/pendingStaff/${siteId}`).push({name, areaId, requestedBy:requestedBy||'Unknown', requestedAt:Date.now()}); }
  catch(e){ console.error('addPendingStaff failed',e); }
}
async function approvePendingStaff(siteId, id){
  if(!storageAvailable) return;
  try{
    const snap=await db.ref(`${DB_PATH}/pendingStaff/${siteId}/${id}`).once('value');
    const rec=snap.val();
    if(!rec) return;
    const current=((state.staffByAreaBySite[siteId]||{})[rec.areaId]||[]).slice();
    if(!current.includes(rec.name)) current.push(rec.name);
    const updates={};
    updates[`${DB_PATH}/staffByArea/${siteId}/${rec.areaId}`]=current;
    updates[`${DB_PATH}/pendingStaff/${siteId}/${id}`]=null;
    await db.ref().update(updates);
  }catch(e){ console.error('approvePendingStaff failed',e); toast(friendlyFirebaseError(e)); }
}
async function rejectPendingStaff(siteId, id){
  if(!storageAvailable) return;
  try{ await db.ref(`${DB_PATH}/pendingStaff/${siteId}/${id}`).remove(); }
  catch(e){ console.error('rejectPendingStaff failed',e); toast(friendlyFirebaseError(e)); }
}

/* ---------- Prevent duplicate submissions ---------- */
async function runGuarded(btn, label, fn){
  if(!btn || btn.disabled) return;
  const original=btn.innerHTML;
  btn.disabled=true;
  btn.innerHTML=`${ICONS.refresh} ${label||'Saving...'}`;
  try{ await fn(); }
  finally{
    btn.disabled=false;
    btn.innerHTML=original;
  }
}
export function compressImage(dataUrl, maxDim, quality){
  maxDim=maxDim||900; quality=quality||0.65;
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width, h=img.height;
      if(w>=h && w>maxDim){ h=Math.round(h*maxDim/w); w=maxDim; }
      else if(h>w && h>maxDim){ w=Math.round(w*maxDim/h); h=maxDim; }
      const canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      try{ resolve(canvas.toDataURL('image/jpeg',quality)); }
      catch(e){ resolve(dataUrl); }
    };
    img.onerror=()=>resolve(dataUrl);
    img.src=dataUrl;
  });
}

