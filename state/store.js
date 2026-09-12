/* ============================================================ STATE ============================================================
   Single in-memory store for the whole app. Mutated directly by pages/services (no reducer/action
   layer — matches the app's existing imperative "mutate state, then call render()" pattern), and
   read by every page/component via the `state` export below.
============================================================ */
export const state = {
  tab:'welcome',
  welcomeStep:'login', // 'login' | 'bootstrap' | 'forgot'
  uid:null,
  email:'',
  username:'',
  role:null, // 'auditor' | 'resolver' | 'admin' — sourced live from userRoles/{uid}, not chosen by the user
  authChecking:true,
  needsBootstrap:false,
  userRoles:{},
  notifOpen:false,
  siteDropdownOpen:false,
  areaDropdownOpen:false,
  sites:{},                // { [siteId]: {name,createdAt,createdBy,active} } — broadly readable, admin-writable
  areasBySite:{},           // { [siteId]: { [areaId]: {name,order,createdAt} } } — broadly readable, admin-writable
  siteId:null,              // the Site currently being worked in (audit / reports / dashboard context when scoped)
  areaId:null,              // the Area currently being audited
  auditStarted:false,       // has the auditor tapped "Start Audit" for the current Area
  pickedItemId:null,        // the sub-area currently being audited within this Area
  itemDraftFindingIds:[],   // findings logged so far for the sub-area currently being audited, before Review & Submit
  accessibleSiteIds:[],     // computed: sites this signed-in user may read/write (all sites if admin)
  notifications:[],
  subAreasByArea:{},        // { [siteId]: { [areaId]: [subAreas] } }
  findingsBySite:{},        // { [siteId]: { [findingId]: finding } } — raw, per-site
  findings:[],              // flattened across accessible sites, kept for compatibility with existing render/filter code
  reportsBySite:{},
  reports:[],
  areaLastSubmitted:{},     // { [siteId]: { [areaId]: timestamp } } — kept for legacy compatibility, unused by the per-item flow
  reportsFilter:'This Week',
  reportsTab:'reports',
  dashSearch:'',
  dashSiteFilter:'all',
  rememberMe:true,
  exportDateFilter:'all',
  exportSiteFilter:'all',
  exportAreaFilter:'all',
  exportStatusFilter:'all',
  exportAuditorFilter:'all',
  firebaseConnected:false,
  users:{},
  activityLogBySite:{},
  activityLog:[],           // flattened across accessible sites
  adminActivityLog:[],      // admin-only global log (user mgmt, site/area mgmt)
  archivedFindingsBySite:{},
  archivedReportsBySite:{},
  archivedFindings:[],
  archivedReports:[],
  checklistsBySite:{},      // { [siteId]: [checklist item strings] } — the picklist for a finding's title
  staffByAreaBySite:{},     // { [siteId]: { [areaId]: [names] } }
  pendingStaffBySite:{},    // { [siteId]: { [id]: {name,areaId,requestedBy,requestedAt} } }
  filterStatus:'all',
  filterSeverity:'all',
  filterDate:'all',
  filterSite:'all',
  filterArea:'all',
  filterAssigned:'all',
  modalStack:[],
};

export function currentSite(){ return state.sites[state.siteId]; }
export function currentSiteName(){ const s=currentSite(); return s?s.name:''; }
export function currentAreas(){ return state.areasBySite[state.siteId]||{}; }
export function currentAreaList(){ return Object.entries(currentAreas()).map(([id,a])=>({id,...a})).sort((a,b)=>(a.order||0)-(b.order||0)); }
export function currentAreaName(){ const a=(state.areasBySite[state.siteId]||{})[state.areaId]; return a?a.name:''; }
export function mySiteIds(){ // sites an Auditor/Resolver is explicitly assigned to (Admin ignores this — sees everything)
  const rec=state.userRoles[state.uid];
  return rec && rec.sites ? Object.keys(rec.sites).filter(id=>rec.sites[id]) : [];
}
export function computeAccessibleSiteIds(){
  if(state.role==='admin') return Object.keys(state.sites);
  return mySiteIds().filter(id=>state.sites[id]);
}
export function getSubAreas(){ return (state.subAreasByArea[state.siteId]||{})[state.areaId]||[]; }
export function setSubAreas(arr){
  if(!state.subAreasByArea[state.siteId]) state.subAreasByArea[state.siteId]={};
  state.subAreasByArea[state.siteId][state.areaId]=arr;
}
