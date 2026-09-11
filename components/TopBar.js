/* ============================================================ TOP BAR ============================================================ */
import { ICONS } from '../assets/icons.js';
import { state } from '../state/store.js';
import { storageAvailable } from '../services/firebase.service.js';
import { switchUser } from '../pages/WelcomePage.js';
import { toast, relativeTime } from '../utils/helpers.js';
import { render } from '../layouts/router.js';

export function renderTopbar(){
  const el=document.getElementById('topbar');
  const titles={audit:'Daily Audit',reports:'Reports &amp; Summary',dashboard:'Dashboard',home:'Warehouse Audit'};
  const rightExtra = state.tab==='reports'
    ? `<button class="icon-btn">${ICONS.filter}</button>`
    : state.tab==='dashboard'
      ? `<button class="icon-btn" id="refreshBtn">${ICONS.refresh}</button>`
      : '';
  const roleLabel = state.role==='auditor'?'Auditor':state.role==='resolver'?'Resolver':state.role==='admin'?'Admin':'';
  const syncDot = storageAvailable
    ? `<span title="${state.firebaseConnected?'Live — synced':'Reconnecting...'}" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${state.firebaseConnected?'#3ED598':'#EFB223'};margin-left:6px;"></span>`
    : '';
  const titleBlock = `<div><h1 style="margin:0;">${titles[state.tab]||'Warehouse Audit'}</h1><div class="role-badge">${ICONS.user}${state.username} <span class="role-chip">${roleLabel}</span>${syncDot}</div></div>`;

  el.innerHTML = `
    <div class="left">
      <button class="icon-btn" id="homeBtnTop">${ICONS.home}</button>
      ${titleBlock}
    </div>
    <div style="display:flex;align-items:center;gap:10px;">
      <button class="signout-btn" id="signOutBtn">${ICONS.logout}Sign Out</button>
      ${rightExtra}
      <button class="icon-btn" id="bellBtn">${ICONS.bell}<span class="badge-dot"></span></button>
    </div>`;

  document.getElementById('homeBtnTop').onclick=(e)=>{e.stopPropagation();state.tab=state.role==='resolver'?'dashboard':'audit';render();};
  document.getElementById('signOutBtn').onclick=(e)=>{e.stopPropagation();switchUser();};
  document.getElementById('bellBtn').onclick=(e)=>{e.stopPropagation();toggleNotifPanel();};
  const rb=document.getElementById('refreshBtn');
  if(rb) rb.onclick=()=>toast('Dashboard refreshed');
  renderNotifList();
}
export function toggleNotifPanel(force){
  state.notifOpen = force!==undefined ? force : !state.notifOpen;
  document.getElementById('notifPanel').classList.toggle('open',state.notifOpen);
}
export const NOTIF_ACTIONS=['Finding created','Resolution submitted','Resolution verified'];
export function renderNotifList(){
  const list=document.getElementById('notifList');
  if(!list) return;
  const notifs=state.activityLog.filter(n=>NOTIF_ACTIONS.includes(n.action)).slice(0,12);
  list.innerHTML = notifs.length===0
    ? `<div class="empty-mini" style="padding:16px;">No updates yet</div>`
    : notifs.map(n=>`<div class="notif-item"><div class="notif-dot"></div><div><div class="notif-text"><strong>${n.user}</strong> — ${n.action.toLowerCase()}${n.detail?`: ${n.detail}`:''}</div><div class="notif-time">${relativeTime(n.ts)}</div></div></div>`).join('');
  const badge=document.querySelector('#bellBtn .badge-dot');
  if(badge) badge.style.display = notifs.length>0 ? 'block' : 'none';
}
document.addEventListener('click',(e)=>{
  if(state.notifOpen && !e.target.closest('.notif-panel') && !e.target.closest('#bellBtn')) toggleNotifPanel(false);
  if(state.areaDropdownOpen && !e.target.closest('#areaField')){
    state.areaDropdownOpen=false;
    const dd=document.getElementById('areaDropdown'); if(dd) dd.style.display='none';
  }
});

