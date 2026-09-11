/* ============================================================ NAV / RENDER LOOP ============================================================
   This is the app's "layout" — it owns the top-level shell (topbar / content / bottom nav / FAB)
   defined in index.html, and decides which page module to render into #content based on
   state.tab. There's no history/URL-based routing (matches the original app, which never used
   one) — render() is just called again any time state changes, à la a very small imperative
   single-page-app scheduler.
============================================================ */
import { state, currentAreaList } from '../state/store.js';
import { toast } from '../utils/helpers.js';
import { renderWelcome } from '../pages/WelcomePage.js';
import { renderTopbar } from '../components/TopBar.js';
import { renderAudit, openAddFinding } from '../pages/AuditPage.js';
import { renderReports } from '../pages/ReportsPage.js';
import { renderDashboard } from '../pages/DashboardPage.js';

document.querySelectorAll('.navitem').forEach(btn=>{ btn.addEventListener('click',()=>{ state.tab=btn.dataset.tab; render(); }); });

export function render(){
  document.querySelectorAll('.navitem').forEach(n=>n.classList.toggle('active',n.dataset.tab===state.tab));
  const resolverFab=document.getElementById('resolverFab');
  if(state.tab==='welcome'){ renderWelcome(); resolverFab.style.display='none'; return; }
  document.getElementById('topbar').style.display='flex';
  document.getElementById('bottomNav').style.display='flex';
  document.getElementById('content').style.padding='16px 16px 96px';
  renderTopbar();
  if(state.tab==='audit') renderAudit();
  else if(state.tab==='reports') renderReports();
  else renderDashboard();
  resolverFab.style.display = state.role==='resolver' ? 'flex' : 'none';
  resolverFab.onclick=()=>{
    // Resolvers can quick-add a finding from any tab — make sure there's a valid Site/Area context to attach it to.
    if(!state.siteId || !state.accessibleSiteIds.includes(state.siteId)) state.siteId=state.accessibleSiteIds[0]||null;
    if(state.siteId){
      const areas=currentAreaList();
      if(!state.areaId || !areas.some(a=>a.id===state.areaId)) state.areaId=areas[0]?areas[0].id:null;
    }
    if(!state.siteId || !state.areaId){ toast('No Site/Area available to attach a finding to yet'); return; }
    openAddFinding();
  };
}
