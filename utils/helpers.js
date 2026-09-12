/* ============================================================ UTILS / HELPERS ============================================================
   Generic, reusable helpers: id/date generation, finding-status logic, formatting, and small
   findings-list query helpers used by more than one page.
============================================================ */
import { DUE_OFFSET_DAYS } from '../config/constants.js';
import { ICONS } from '../assets/icons.js';
import { state } from '../state/store.js';

export function nextId(){return Date.now()*1000 + Math.floor(Math.random()*1000);}
export function todayISO(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function relativeTime(ts){
  const diff=Date.now()-ts;
  const mins=Math.floor(diff/60000);
  if(mins<1) return 'Just now';
  if(mins<60) return `${mins}m ago`;
  const hrs=Math.floor(mins/60);
  if(hrs<24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

export function toast(msg){
  const t=document.getElementById('toast');
  t.classList.remove('interactive');
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer=setTimeout(()=>t.classList.remove('show'),2400);
}
export function toastWithUndo(msg, onUndo, durationMs){
  const t=document.getElementById('toast');
  clearTimeout(window.__toastTimer);
  t.classList.add('interactive');
  t.innerHTML=`<span></span><button class="toast-undo-btn" id="toastUndoBtn">Undo</button>`;
  t.querySelector('span').textContent=msg;
  t.classList.add('show');
  const btn=document.getElementById('toastUndoBtn');
  let used=false;
  btn.onclick=async()=>{
    if(used) return; used=true;
    t.classList.remove('show');
    await onUndo();
  };
  window.__toastTimer=setTimeout(()=>{ t.classList.remove('show'); t.classList.remove('interactive'); },durationMs||9000);
}
export function statusIcon(status){
  if(status==='good') return `<div class="status-icon status-good">${ICONS.check}</div>`;
  if(status==='issue') return `<div class="status-icon status-issue">${ICONS.x}</div>`;
  if(status==='warning') return `<div class="status-icon status-warning">${ICONS.alert}</div>`;
  return `<div class="status-icon status-unchecked"></div>`;
}
export function itemFindings(item){
  const since=(state.areaLastSubmitted[state.siteId]||{})[state.areaId]||0;
  return state.findings.filter(f=>f.subAreaId===item.id && f.createdAt>since);
}
export function computeItemStatus(item){
  const attached=itemFindings(item);
  if(attached.length===0) return 'unchecked';
  if(attached.some(f=>f.severity==='High')) return 'issue';
  return 'warning';
}
export function subLabel(item){
  if(item.status==='good') return `<div class="ci-sub good">No issues</div>`;
  const count=itemFindings(item).length;
  const label=count>0 ? `${count} finding${count>1?'s':''} attached` : 'Issue found';
  if(item.status==='issue') return `<div class="ci-sub issue">${label}</div>`;
  if(item.status==='warning') return `<div class="ci-sub warning">${label}</div>`;
  return `<div class="ci-sub unchecked">Not checked</div>`;
}
export function sevColor(s){return s==='High'?'var(--red-500)':s==='Medium'?'var(--orange-500)':'#C79419';}
export function fmtDate(d){ const dt=new Date(d+'T00:00:00'); return dt.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}); }
export function fmtDateShort(d){ const dt=new Date(d+'T00:00:00'); return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
export function fmtDateMMDDYY(d){
  const dt=new Date(d);
  if(isNaN(dt.getTime())) return d;
  const mm=String(dt.getMonth()+1).padStart(2,'0');
  const dd=String(dt.getDate()).padStart(2,'0');
  const yy=String(dt.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}
export function resolutionPillHTML(f){
  const s=f.resolutionStatus||'open';
  const label=s==='open'?'Open':s==='pending'?'Pending Verification':'Verified';
  return `<span class="resolution-pill ${s}">${label}</span>`;
}
export function reportFindings(r){
  if(!r.findingIds) return [];
  return r.findingIds.map(id=>state.findings.find(f=>f.id===id)).filter(Boolean);
}
export function computeDueInfo(f){
  if(f.resolutionStatus==='verified') return {label:'Completed',cls:'completed'};
  const offset=DUE_OFFSET_DAYS[f.severity]!==undefined?DUE_OFFSET_DAYS[f.severity]:3;
  const due=f.createdAt+offset*86400000;
  const dueDay=new Date(due); dueDay.setHours(0,0,0,0);
  const today=new Date(); today.setHours(0,0,0,0);
  if(dueDay.getTime()<today.getTime()) return {label:'Overdue',cls:'overdue'};
  if(dueDay.getTime()===today.getTime()) return {label:'Due Today',cls:'dueToday'};
  const daysLeft=Math.round((dueDay-today)/86400000);
  return {label:`Due in ${daysLeft}d`,cls:'upcoming'};
}
export function dueBadgeHTML(f){
  const d=computeDueInfo(f);
  return `<span class="due-pill due-${d.cls}">${d.label}</span>`;
}
export function findingCardStyle(f){
  return `border-left-color:${sevColor(f.severity)};`;
}
export function findingDateLabel(ts){
  const d=new Date(ts); d.setHours(0,0,0,0);
  const today=new Date(); today.setHours(0,0,0,0);
  const diffDays=Math.round((today-d)/86400000);
  const full=new Date(ts).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  if(diffDays===0) return `Today, ${full}`;
  if(diffDays===1) return `Yesterday, ${full}`;
  return full;
}
export function findingCardHTML(f){
  return `
    <div class="card finding-card" style="${findingCardStyle(f)}" data-finding="${f.id}">
      <div class="finding-thumb" style="${f.photos.before?`background-image:url('${f.photos.before}');background-size:cover;background-position:center;`:`background:${f.color}`}"></div>
      <div class="finding-info">
        <div class="finding-title"><span class="sev-dot" style="background:${sevColor(f.severity)}"></span>${f.title}</div>
        <div class="finding-area">${f.area}${f.assignedTo?` · ${f.assignedTo}`:''}</div>
        <div class="finding-time">${f.time} ${resolutionPillHTML(f)} ${dueBadgeHTML(f)}</div>
      </div>
      <div class="sev-chip sev-${f.severity}">${f.severity}</div>
    </div>`;
}
export function groupedFindingsHTML(list, emptyMsg){
  if(list.length===0) return `<div class="card"><div class="empty-mini">${emptyMsg||'No findings yet'}</div></div>`;
  let html=''; let lastLabel=null;
  list.forEach(f=>{
    const label=findingDateLabel(f.createdAt);
    if(label!==lastLabel){ html+=`<div class="date-group-label">${label}</div>`; lastLabel=label; }
    html+=findingCardHTML(f);
  });
  return html;
}
export function findingHaystack(f){
  const dateStr=new Date(f.createdAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  return [f.findingNo,f.title,f.area,f.description,f.assignedTo,f.createdBy,f.floor,dateStr,f.severity,f.resolutionStatus]
    .filter(Boolean).join(' ').toLowerCase();
}
export function getFilteredFindings(){
  let list=state.findings;
  const q=state.dashSearch.trim().toLowerCase();
  if(q) list=list.filter(f=>findingHaystack(f).includes(q));
  if(state.filterStatus!=='all') list=list.filter(f=>f.resolutionStatus===state.filterStatus);
  if(state.filterSeverity!=='all') list=list.filter(f=>f.severity===state.filterSeverity);
  if(state.filterSite!=='all') list=list.filter(f=>f.siteId===state.filterSite);
  if(state.filterAssigned!=='all') list=list.filter(f=>(f.assignedTo||'')===state.filterAssigned);
  if(state.filterDate==='today'){
    const start=new Date(); start.setHours(0,0,0,0);
    list=list.filter(f=>f.createdAt>=start.getTime());
  } else if(state.filterDate==='week'){
    const now=new Date(); const day=now.getDay(); const diff=day===0?-6:1-day;
    const monday=new Date(now); monday.setDate(now.getDate()+diff); monday.setHours(0,0,0,0);
    list=list.filter(f=>f.createdAt>=monday.getTime());
  } else if(state.filterDate==='month'){
    const now=new Date(); const start=new Date(now.getFullYear(),now.getMonth(),1);
    list=list.filter(f=>f.createdAt>=start.getTime());
  } else if(state.filterDate==='overdue'){
    list=list.filter(f=>computeDueInfo(f).cls==='overdue');
  }
  return list;
}

