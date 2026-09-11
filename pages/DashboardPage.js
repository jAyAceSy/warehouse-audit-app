/* ============================================================ DASHBOARD TAB ============================================================ */
import { ICONS } from '../assets/icons.js';
import { state } from '../state/store.js';
import { computeDueInfo, getFilteredFindings, groupedFindingsHTML } from '../utils/helpers.js';
import { openFindingDetail } from './AuditPage.js';

export let trendChartInstance=null;
export function computeWeekdayTrend(list){
  list=list||state.findings;
  const dayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const now=new Date();
  const dow=now.getDay();
  const mondayOffset= dow===0 ? -6 : 1-dow;
  const monday=new Date(now); monday.setDate(now.getDate()+mondayOffset); monday.setHours(0,0,0,0);
  const labels=[]; const counts=[];
  for(let i=0;i<7;i++){
    const d=new Date(monday); d.setDate(d.getDate()+i);
    const dEnd=new Date(d); dEnd.setDate(dEnd.getDate()+1);
    labels.push(dayLabels[d.getDay()]);
    counts.push(list.filter(f=>f.createdAt>=d.getTime() && f.createdAt<dEnd.getTime()).length);
  }
  if(counts.every(c=>c===0) && list.length>0){
    const labels2=[]; const counts2=[];
    const todayStart=new Date(); todayStart.setHours(0,0,0,0);
    for(let i=6;i>=0;i--){
      const d=new Date(todayStart); d.setDate(d.getDate()-i);
      const dEnd=new Date(d); dEnd.setDate(dEnd.getDate()+1);
      labels2.push(d.toLocaleDateString('en-US',{month:'short',day:'numeric'}));
      counts2.push(list.filter(f=>f.createdAt>=d.getTime() && f.createdAt<dEnd.getTime()).length);
    }
    return {labels:labels2,counts:counts2,fallback:true};
  }
  return {labels,counts,fallback:false};
}
export function computeSiteTrend(list){
  list=list||state.findings;
  const counts={};
  Object.keys(state.sites).forEach(id=>counts[id]=0);
  list.forEach(f=>{ if(counts[f.siteId]!==undefined) counts[f.siteId]++; });
  return counts;
}
export function computeKPIs(list){
  list=list||state.findings;
  const now=new Date();
  const todayStart=new Date(now); todayStart.setHours(0,0,0,0);
  const yestStart=new Date(todayStart); yestStart.setDate(yestStart.getDate()-1);
  const dow=now.getDay(); const mondayOffset=dow===0?-6:1-dow;
  const weekStart=new Date(now); weekStart.setDate(now.getDate()+mondayOffset); weekStart.setHours(0,0,0,0);
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);

  const inRange=(f,start,end)=>f.createdAt>=start.getTime() && (!end || f.createdAt<end.getTime());
  const todayCount=list.filter(f=>inRange(f,todayStart)).length;
  const yesterdayCount=list.filter(f=>inRange(f,yestStart,todayStart)).length;
  const weekCount=list.filter(f=>inRange(f,weekStart)).length;
  const monthCount=list.filter(f=>inRange(f,monthStart)).length;
  const overdueCount=list.filter(f=>computeDueInfo(f).cls==='overdue').length;

  const resolved=list.filter(f=>f.resolvedAt);
  let avgResLabel='—';
  if(resolved.length){
    const avgMs=resolved.reduce((sum,f)=>sum+(f.resolvedAt-f.createdAt),0)/resolved.length;
    const hrs=avgMs/3600000;
    avgResLabel = hrs<24 ? `${hrs.toFixed(1)}h` : `${(hrs/24).toFixed(1)}d`;
  }

  const areaCounts={};
  list.forEach(f=>{areaCounts[f.area]=(areaCounts[f.area]||0)+1;});
  const areaEntries=Object.entries(areaCounts).sort((a,b)=>b[1]-a[1]);
  const worstArea=areaEntries.length?areaEntries[0][0]:'—';
  const mostCommon=worstArea;

  let bestArea='—';
  const allItems=[];
  Object.keys(state.checklistsByArea).forEach(siteId=>{
    Object.values(state.checklistsByArea[siteId]||{}).forEach(items=>(items||[]).forEach(item=>allItems.push(item.name)));
  });
  const zeroFindingItems=allItems.filter(name=>!areaCounts[name]);
  if(zeroFindingItems.length) bestArea=zeroFindingItems[0];
  else if(areaEntries.length) bestArea=areaEntries[areaEntries.length-1][0];

  return {todayCount,yesterdayCount,weekCount,monthCount,overdueCount,avgResLabel,mostCommon,worstArea,bestArea};
}
export function renderDashboard(){
  const dashFindings = state.filterSite==='all' ? state.findings : state.findings.filter(f=>f.siteId===state.filterSite);
  const total=dashFindings.length;
  const open=dashFindings.filter(f=>f.resolutionStatus!=='verified').length;
  const closed=dashFindings.filter(f=>f.resolutionStatus==='verified').length;
  const highSeverity=dashFindings.filter(f=>f.severity==='High').length;
  const medSeverity=dashFindings.filter(f=>f.severity==='Medium').length;
  const lowSeverity=dashFindings.filter(f=>f.severity==='Low').length;
  const pendingVerification=dashFindings.filter(f=>f.resolutionStatus==='pending').length;
  const kpi=computeKPIs(dashFindings);
  const trend=computeWeekdayTrend(dashFindings);
  const ONLINE_WINDOW_MS=5*60*1000;
  const onlineCount=Object.values(state.userRoles||{}).filter(u=>u.lastSeen && (Date.now()-u.lastSeen)<ONLINE_WINDOW_MS).length;

  const areaCounts={};
  dashFindings.forEach(f=>{areaCounts[f.area]=(areaCounts[f.area]||0)+1;});
  const areaEntries=Object.entries(areaCounts).sort((a,b)=>b[1]-a[1]);
  const maxAreaCount=areaEntries.length?areaEntries[0][1]:1;

  const assignedNames=[...new Set(dashFindings.map(f=>f.assignedTo).filter(Boolean))].sort();
  const filtered=getFilteredFindings();
  const siteEntries=Object.entries(state.sites);

  document.getElementById('content').innerHTML=`
  <div class="filter-row" style="cursor:default;"><span>${state.filterSite==='all'?'All Sites':(state.sites[state.filterSite]||{}).name||'Unknown Site'}</span></div>
  <div class="card"><div class="card-title">Overview</div>
    <div class="overview-grid">
      <div class="ov-cell"><div class="ov-icon" style="background:var(--blue-050);color:var(--blue-600);">${ICONS.clipboard}</div><div><div class="ov-num">${total}</div><div class="ov-lbl">Total Findings</div></div></div>
      <div class="ov-cell"><div class="ov-icon" style="background:var(--red-050);color:var(--red-500);">${ICONS.alert}</div><div><div class="ov-num">${open}<span style="font-size:11px;font-weight:700;color:var(--text-400);margin-left:4px;">${total?Math.round(open/total*100):0}%</span></div><div class="ov-lbl">Open Findings</div></div></div>
      <div class="ov-cell"><div class="ov-icon" style="background:var(--green-050);color:var(--green-600);">${ICONS.check}</div><div><div class="ov-num">${closed}<span style="font-size:11px;font-weight:700;color:var(--text-400);margin-left:4px;">${total?Math.round(closed/total*100):0}%</span></div><div class="ov-lbl">Closed Findings</div></div></div>
      <div class="ov-cell"><div class="ov-icon" style="background:var(--amber-050);color:#C79419;">${ICONS.alert}</div><div><div class="ov-num">${highSeverity}<span style="font-size:11px;font-weight:700;color:var(--text-400);margin-left:4px;">${total?Math.round(highSeverity/total*100):0}%</span></div><div class="ov-lbl">High Severity</div></div></div>
    </div>
  </div>

  <div class="card"><div class="card-title">Findings Over Time</div>
    <div class="stat-grid-4">
      <div><div class="num">${kpi.todayCount}</div><div class="lbl">Today</div></div>
      <div><div class="num">${kpi.yesterdayCount}</div><div class="lbl">Yesterday</div></div>
      <div><div class="num">${kpi.weekCount}</div><div class="lbl">This Week</div></div>
      <div><div class="num">${kpi.monthCount}</div><div class="lbl">This Month</div></div>
    </div>
  </div>

  <div class="card"><div class="card-title">Performance</div>
    <div class="kv-row"><span class="k">${ICONS.clock} Average Resolution Time</span><span class="v">${kpi.avgResLabel}</span></div>
    <div class="kv-row"><span class="k">${ICONS.alert} Overdue Findings</span><span class="v" style="color:${kpi.overdueCount>0?'var(--red-500)':'var(--green-600)'};">${kpi.overdueCount}</span></div>
    <div class="kv-row"><span class="k">Pending Verification</span><span class="v">${pendingVerification}</span></div>
    <div class="kv-row"><span class="k">Most Common Issue Area</span><span class="v">${kpi.mostCommon}</span></div>
    <div class="kv-row"><span class="k">Worst Area</span><span class="v">${kpi.worstArea}</span></div>
    <div class="kv-row"><span class="k">Best Area</span><span class="v">${kpi.bestArea}</span></div>
    ${state.role==='admin' ? `<div class="kv-row"><span class="k">${ICONS.check} Users Online (5 min)</span><span class="v" style="color:var(--green-600);">${onlineCount}</span></div>` : ''}
  </div>

  ${state.role==='admin' ? `
  <div class="card"><div class="card-title">Findings by Severity</div>
    <div class="area-bar-row"><div class="area-bar-label"><span>High</span><span>${highSeverity}</span></div><div class="area-bar-track"><div class="area-bar-fill" style="width:${total?Math.round(highSeverity/total*100):0}%;background:var(--red-500);"></div></div></div>
    <div class="area-bar-row"><div class="area-bar-label"><span>Medium</span><span>${medSeverity}</span></div><div class="area-bar-track"><div class="area-bar-fill" style="width:${total?Math.round(medSeverity/total*100):0}%;background:var(--orange-500);"></div></div></div>
    <div class="area-bar-row"><div class="area-bar-label"><span>Low</span><span>${lowSeverity}</span></div><div class="area-bar-track"><div class="area-bar-fill" style="width:${total?Math.round(lowSeverity/total*100):0}%;background:var(--amber-400);"></div></div></div>
  </div>` : ''}

  <div class="card"><div class="card-title">${trend.fallback?'Findings Trend (Last 7 Days)':'Findings Trend (This Week)'}</div><div style="height:150px;"><canvas id="trendChart"></canvas></div></div>

  ${state.filterSite==='all' && siteEntries.length>0 ? `
  <div class="card"><div class="card-title">Findings by Site</div>
    ${(()=>{ const sc=computeSiteTrend(dashFindings); const maxSc=Math.max(1,...Object.values(sc));
      return siteEntries.map(([id,s])=>`<div class="area-bar-row"><div class="area-bar-label"><span>${s.name}</span><span>${sc[id]||0}</span></div><div class="area-bar-track"><div class="area-bar-fill" style="width:${Math.round((sc[id]||0)/maxSc*100)}%"></div></div></div>`).join('');
    })()}
  </div>` : ''}

  ${(()=>{
    const rows=[];
    const siteIdsToShow = state.filterSite==='all' ? state.accessibleSiteIds : [state.filterSite];
    siteIdsToShow.forEach(sid=>{
      const areas=Object.entries(state.areasBySite[sid]||{});
      areas.forEach(([aid,a])=>{
        const list=(state.checklistsByArea[sid]||{})[aid]||[];
        const t=list.length; const c=list.filter(x=>x.status!=='unchecked').length;
        rows.push({label: siteIdsToShow.length>1 ? `${(state.sites[sid]||{}).name} — ${a.name}` : a.name, pct: t?Math.round(c/t*100):0});
      });
    });
    if(rows.length===0) return '';
    return `<div class="card"><div class="card-title">Checklist Completion by Area</div>
      ${rows.map(r=>`<div class="area-bar-row"><div class="area-bar-label"><span>${r.label}</span><span>${r.pct}%</span></div><div class="area-bar-track"><div class="area-bar-fill" style="width:${r.pct}%"></div></div></div>`).join('')}
    </div>`;
  })()}

  <div class="card"><div class="card-title">Findings by Area</div>
    ${areaEntries.length===0 ? `<div class="empty-mini" style="padding:6px 0;">No findings yet</div>` : areaEntries.map(([area,count])=>`
      <div class="area-bar-row"><div class="area-bar-label"><span>${area}</span><span>${count}</span></div><div class="area-bar-track"><div class="area-bar-fill" style="width:${Math.round((count/maxAreaCount)*100)}%"></div></div></div>`).join('')}
  </div>

  <div class="section-head"><h2>Recent Findings</h2></div>
  <div class="search-bar">${ICONS.search}<input id="dashSearchInput" placeholder="Search title, area, name, date..." value="${state.dashSearch}"></div>
  <div class="filter-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
    <select class="select-input" id="filterStatusSel">
      <option value="all" ${state.filterStatus==='all'?'selected':''}>Status: All</option>
      <option value="open" ${state.filterStatus==='open'?'selected':''}>Open</option>
      <option value="pending" ${state.filterStatus==='pending'?'selected':''}>Pending Verification</option>
      <option value="verified" ${state.filterStatus==='verified'?'selected':''}>Verified</option>
    </select>
    <select class="select-input" id="filterSeveritySel">
      <option value="all" ${state.filterSeverity==='all'?'selected':''}>Severity: All</option>
      <option value="High" ${state.filterSeverity==='High'?'selected':''}>High</option>
      <option value="Medium" ${state.filterSeverity==='Medium'?'selected':''}>Medium</option>
      <option value="Low" ${state.filterSeverity==='Low'?'selected':''}>Low</option>
    </select>
    <select class="select-input" id="filterDateSel">
      <option value="all" ${state.filterDate==='all'?'selected':''}>Date: All</option>
      <option value="today" ${state.filterDate==='today'?'selected':''}>Today</option>
      <option value="week" ${state.filterDate==='week'?'selected':''}>This Week</option>
      <option value="month" ${state.filterDate==='month'?'selected':''}>This Month</option>
      <option value="overdue" ${state.filterDate==='overdue'?'selected':''}>Overdue</option>
    </select>
    <select class="select-input" id="filterSiteSel">
      <option value="all" ${state.filterSite==='all'?'selected':''}>Site: All</option>
      ${siteEntries.map(([id,s])=>`<option value="${id}" ${state.filterSite===id?'selected':''}>${s.name}</option>`).join('')}
    </select>
    <select class="select-input" id="filterAssignedSel" style="grid-column:1 / -1;">
      <option value="all" ${state.filterAssigned==='all'?'selected':''}>Assigned To: All</option>
      ${assignedNames.map(n=>`<option value="${n}" ${state.filterAssigned===n?'selected':''}>${n}</option>`).join('')}
    </select>
  </div>

  ${groupedFindingsHTML(filtered, 'No findings match your search/filter')}
  `;

  document.querySelectorAll('.finding-card').forEach(c=>c.onclick=()=>openFindingDetail(parseInt(c.dataset.finding)));
  const searchInput=document.getElementById('dashSearchInput');
  searchInput.oninput=(e)=>{ state.dashSearch=e.target.value; renderDashboardFindingsOnly(); };
  document.getElementById('filterStatusSel').onchange=(e)=>{ state.filterStatus=e.target.value; renderDashboard(); };
  document.getElementById('filterSeveritySel').onchange=(e)=>{ state.filterSeverity=e.target.value; renderDashboard(); };
  document.getElementById('filterDateSel').onchange=(e)=>{ state.filterDate=e.target.value; renderDashboard(); };
  document.getElementById('filterSiteSel').onchange=(e)=>{ state.filterSite=e.target.value; renderDashboard(); };
  document.getElementById('filterAssignedSel').onchange=(e)=>{ state.filterAssigned=e.target.value; renderDashboard(); };

  const ctx=document.getElementById('trendChart');
  if(trendChartInstance) trendChartInstance.destroy();
  trendChartInstance=new Chart(ctx,{
    type:'line',
    data:{ labels:trend.labels, datasets:[{ data:trend.counts, borderColor:'#2F5FE0', backgroundColor:'rgba(47,95,224,.08)', fill:true, tension:.35, pointRadius:3, pointBackgroundColor:'#2F5FE0', borderWidth:2.5 }] },
    options:{ plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,grid:{color:'#EEF1F7'},ticks:{font:{size:10.5},color:'#98A0B3'}}, x:{grid:{display:false},ticks:{font:{size:10},color:'#98A0B3'}} }, responsive:true, maintainAspectRatio:false }
  });
}
export function renderDashboardFindingsOnly(){
  // Simplest reliable approach: just re-render whole dashboard (search is infrequent typing, acceptable cost)
  renderDashboard();
  const input=document.getElementById('dashSearchInput');
  if(input){ input.value=state.dashSearch; input.focus(); input.setSelectionRange(input.value.length,input.value.length); }
}

