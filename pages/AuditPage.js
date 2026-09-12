/* ============================================================ DAILY AUDIT TAB ============================================================ */
import { DB_PATH, DEFAULT_CHECKLIST } from '../config/constants.js';
import { ICONS } from '../assets/icons.js';
import { state, currentAreaList, currentAreaName, currentSiteName, getSubAreas, setSubAreas } from '../state/store.js';
import { db, refs, storageAvailable, compressImage, friendlyFirebaseError, recomputeFlatFindings } from '../services/firebase.service.js';
import { toast, toastWithUndo, nextId, todayISO, relativeTime, statusIcon, dueBadgeHTML, findingCardStyle, fmtDateShort, resolutionPillHTML, groupedFindingsHTML } from '../utils/helpers.js';
import { openModal, closeModal, openImageViewer, openConfirmModal } from '../components/Modal.js';
import { render } from '../layouts/router.js';

export function todaysReportId(areaId){ return `${areaId}_${todayISO()}`; }
export function todaysReport(siteId, areaId){
  return (state.reportsBySite[siteId]||{})[todaysReportId(areaId)] || null;
}
export function itemDoneCountToday(item){
  const rep=todaysReport(state.siteId, state.areaId);
  if(!rep || !rep.entries) return 0;
  return Object.values(rep.entries).filter(e=>e.subAreaId===item.id).length;
}

export function renderAudit(){
  const isAuditor = state.role==='auditor' || state.role==='admin';
  const isAdmin = state.role==='admin';
  const accessible=state.accessibleSiteIds;

  if(accessible.length===0){
    document.getElementById('content').innerHTML = `
      <div class="empty-checklist-note" style="margin-top:40px;">${ICONS.clipboard}<div>${isAdmin?'No Sites yet. Create one to get started.':'No Sites are assigned to your account yet. Contact your Admin.'}</div></div>
      ${isAdmin?`<button class="btn-primary" id="goManageSitesBtn" style="margin-top:16px;">${ICONS.plus} Manage Sites</button>`:''}
    `;
    const b=document.getElementById('goManageSitesBtn');
    if(b) b.onclick=()=>openSiteManagement();
    return;
  }
  if(!state.siteId || !accessible.includes(state.siteId)){
    state.siteId = accessible.length===1 ? accessible[0] : null;
  }
  const showSitePicker = accessible.length>1;

  if(!state.siteId){
    document.getElementById('content').innerHTML = `
      <div class="section-head"><h2>Choose a Site</h2></div>
      ${accessible.map(id=>`<div class="checklist-item" data-pick-site="${id}"><div class="status-icon status-unchecked"></div><div style="flex:1;min-width:0;"><div class="ci-name">${(state.sites[id]||{}).name||'Untitled Site'}</div></div><div class="chevron">${ICONS.chevronR}</div></div>`).join('')}
    `;
    document.querySelectorAll('[data-pick-site]').forEach(el=>{
      el.onclick=()=>{ state.siteId=el.dataset.pickSite; state.areaId=null; state.auditStarted=false; state.pickedItemId=null; state.itemDraftFindingIds=[]; render(); };
    });
    return;
  }

  const areaList=currentAreaList();
  if(!state.areaId || !areaList.some(a=>a.id===state.areaId)){
    state.areaId = areaList.length===1 ? areaList[0].id : null;
    state.auditStarted=false; state.pickedItemId=null; state.itemDraftFindingIds=[];
  }

  if(!state.areaId){
    document.getElementById('content').innerHTML = `
      <div class="section-head"><h2>Choose Area Here!</h2></div>
      ${areaList.length===0
        ? `<div class="empty-checklist-note">${ICONS.clipboard}<div>${isAdmin?'No Areas set up for this Site yet.':'No Areas have been set up for this Site yet. Contact your Admin.'}</div></div>${isAdmin?`<button class="btn-primary" id="goManageAreasBtn" style="margin-top:12px;">${ICONS.plus} Manage Areas</button>`:''}`
        : areaList.map(a=>`<div class="checklist-item" data-pick-area="${a.id}"><div class="status-icon status-unchecked"></div><div style="flex:1;min-width:0;"><div class="ci-name">${a.name}</div></div><div class="chevron">${ICONS.chevronR}</div></div>`).join('')}
      ${showSitePicker?`<button class="btn-secondary" style="width:100%;margin-top:14px;" id="changeSiteBtn">${ICONS.chevronD} Change Site</button>`:''}
    `;
    const csb=document.getElementById('changeSiteBtn'); if(csb) csb.onclick=()=>{state.siteId=null;render();};
    document.querySelectorAll('[data-pick-area]').forEach(el=>{
      el.onclick=()=>{ state.areaId=el.dataset.pickArea; state.auditStarted=false; state.pickedItemId=null; state.itemDraftFindingIds=[]; render(); };
    });
    const gmb=document.getElementById('goManageAreasBtn'); if(gmb) gmb.onclick=()=>openAreaManagement(state.siteId);
    return;
  }

  const subAreas=getSubAreas();
  const rep=todaysReport(state.siteId, state.areaId);
  const coveredToday = rep ? rep.completedItems : 0;

  // ---- Area selected but audit not started yet: show a coverage summary + Start Audit ----
  if(!state.auditStarted){
    document.getElementById('content').innerHTML = `
      <div class="tile-row">
        <div class="tile-field" id="areaField">
          ${ICONS.chevronD}
          <div class="tile-label">${showSitePicker?currentSiteName()+' — ':''}Area</div>
          <div class="tile-value">${currentAreaName()}</div>
          <div class="floor-dropdown" id="areaDropdown" style="display:none;">
            ${areaList.map(a=>`<div class="floor-dropdown-item" data-area="${a.id}">${a.id===state.areaId?ICONS.check:'<span style="width:15px;display:inline-block;"></span>'}<span>${a.name}</span></div>`).join('')}
          </div>
        </div>
      </div>
      ${isAdmin ? `<div class="lock-note">${ICONS.shield} You're logged in as Admin. Use Manage Areas below to edit ${currentAreaName()}'s sub-areas.</div>` : ''}
      <div class="card" style="text-align:center;padding:36px 20px;">
        ${ICONS.clipboard}
        <div style="font-weight:700;font-size:17px;margin:14px 0 6px;">${currentAreaName()}</div>
        <div style="font-size:13px;color:var(--text-600);font-weight:600;margin-bottom:22px;">${subAreas.length===0?'No sub-areas yet':`${coveredToday} of ${subAreas.length} sub-areas covered today`}</div>
        ${isAuditor && subAreas.length>0 ? `<button class="btn-primary" id="startAuditBtn" style="background:var(--orange-500);">${ICONS.check} Start Audit</button>` : ''}
        ${subAreas.length===0 && isAdmin ? `<div style="font-size:12.5px;color:var(--text-600);">Add sub-areas from Manage Areas below to begin.</div>` : ''}
        ${subAreas.length===0 && !isAdmin ? `<div style="font-size:12.5px;color:var(--text-600);">Your Admin hasn't added sub-areas for this Area yet.</div>` : ''}
      </div>
      <div class="section-head"><h2>Recent Findings — ${currentAreaName()}</h2><button class="link-btn" id="viewAllFindings">View All</button></div>
      ${groupedFindingsHTML(state.findings.filter(f=>f.siteId===state.siteId && f.areaId===state.areaId).slice(0,15))}
      ${isAdmin ? adminToolsHTML() : ''}
      ${isAdmin ? dangerZoneHTML() : ''}
    `;
    wireAreaFieldDropdown();
    wireCommonFooterHandlers(isAdmin);
    const startBtn=document.getElementById('startAuditBtn');
    if(startBtn) startBtn.onclick=()=>{ state.auditStarted=true; state.pickedItemId=null; state.itemDraftFindingIds=[]; render(); };
    return;
  }

  // ---- Audit started, no sub-area picked yet: visible list of sub-areas to tap (not a dropdown) ----
  if(!state.pickedItemId){
    const rep2=todaysReport(state.siteId,state.areaId);
    document.getElementById('content').innerHTML = `
      <div class="section-head" style="margin-top:0;"><h2>${currentAreaName()} — pick a sub-area</h2></div>
      <div class="lock-note">${ICONS.info} Not obligated to cover every sub-area today — pick as many or as few as you need. A sub-area can be audited more than once.</div>
      ${subAreas.length===0 ? `<div class="empty-checklist-note">${ICONS.clipboard}<div>No sub-areas set up for this Area yet.</div></div>` : subAreas.map(item=>{
        const n = rep2 && rep2.entries ? Object.values(rep2.entries).filter(e=>e.subAreaId===item.id).length : 0;
        return `<div class="checklist-item" data-pick-subarea="${item.id}"><div class="status-icon status-unchecked"></div><div style="flex:1;min-width:0;"><div class="ci-name">${item.name}</div>${n>0?`<div class="ci-sub unchecked">Done ${n}x today</div>`:''}</div><div class="chevron">${ICONS.chevronR}</div></div>`;
      }).join('')}
      <button class="btn-secondary" style="width:100%;margin-top:10px;" id="backToStartBtn">${ICONS.chevronL} Back</button>
      <div class="section-head"><h2>Today's entries — ${currentAreaName()}</h2></div>
      ${todaysEntriesHTML()}
    `;
    document.querySelectorAll('[data-pick-subarea]').forEach(el=>{
      el.onclick=()=>{ state.pickedItemId=parseInt(el.dataset.pickSubarea); state.itemDraftFindingIds=[]; render(); };
    });
    document.getElementById('backToStartBtn').onclick=()=>{ state.auditStarted=false; render(); };
    return;
  }

  // ---- A sub-area is picked: choose OK vs Flag, or review findings logged so far ----
  const item=subAreas.find(c=>c.id===state.pickedItemId);
  if(!item){ state.pickedItemId=null; render(); return; }
  const draftFindings=state.itemDraftFindingIds.map(id=>state.findings.find(f=>f.id===id)).filter(Boolean);

  document.getElementById('content').innerHTML = `
    <div class="section-head" style="margin-top:0;"><h2>${item.name}</h2></div>
    ${draftFindings.length===0 ? `
      <div class="lock-note">${ICONS.info} Mark this sub-area OK, or flag one or more findings before reviewing.</div>
      <button class="btn-primary" id="markOkBtn" style="background:var(--green-600);margin-bottom:12px;">${ICONS.check} Mark OK — No Issues</button>
      <button class="btn-primary" id="flagBtn" style="background:var(--orange-500);">${ICONS.wrench} Flag a Finding</button>
    ` : `
      <div class="card"><div class="card-title">Findings logged so far (${draftFindings.length})</div>
        ${draftFindings.map(f=>`
          <div class="mini-finding" style="${findingCardStyle(f)}">
            <div class="mini-thumb" style="${f.photos.before?`background-image:url('${f.photos.before}');background-size:cover;background-position:center;`:`background:${f.color}`}"></div>
            <div style="flex:1;min-width:0;"><div class="mini-finding-title">${f.title}</div><div class="mini-finding-sub">${f.severity} severity</div></div>
          </div>`).join('')}
      </div>
      <button class="btn-secondary" style="width:100%;margin-bottom:10px;" id="addAnotherBtn">${ICONS.plus} Add Another Finding</button>
      <button class="btn-primary" id="reviewSubmitBtn" style="background:var(--green-600);">${ICONS.check} Done — Review &amp; Submit</button>
    `}
    <button class="btn-secondary" style="width:100%;margin-top:10px;" id="cancelItemBtn">${ICONS.x} Cancel — Pick a Different Sub-Area</button>
  `;
  const markOkBtn=document.getElementById('markOkBtn');
  if(markOkBtn) markOkBtn.onclick=()=>openItemReview(item,[]);
  const flagBtn=document.getElementById('flagBtn');
  if(flagBtn) flagBtn.onclick=()=>openAddFinding(item);
  const addAnotherBtn=document.getElementById('addAnotherBtn');
  if(addAnotherBtn) addAnotherBtn.onclick=()=>openAddFinding(item);
  const reviewSubmitBtn=document.getElementById('reviewSubmitBtn');
  if(reviewSubmitBtn) reviewSubmitBtn.onclick=()=>openItemReview(item,state.itemDraftFindingIds.slice());
  document.getElementById('cancelItemBtn').onclick=()=>{ state.pickedItemId=null; state.itemDraftFindingIds=[]; render(); };
}

export function todaysEntriesHTML(){
  const rep=todaysReport(state.siteId,state.areaId);
  if(!rep || !rep.entries || Object.keys(rep.entries).length===0) return `<div class="empty-mini" style="padding:12px 0;">No sub-areas audited yet today</div>`;
  const entries=Object.values(rep.entries).sort((a,b)=>b.submittedAt-a.submittedAt);
  return entries.map(e=>`
    <div class="checklist-item" style="cursor:default;">
      ${e.outcome==='ok'?statusIcon('good'):statusIcon('issue')}
      <div style="flex:1;min-width:0;"><div class="ci-name">${e.itemName}</div><div class="ci-sub unchecked">${e.outcome==='ok'?'No issues':`${(e.findingIds||[]).length} finding${(e.findingIds||[]).length===1?'':'s'}`} — by ${e.submittedBy}, ${relativeTime(e.submittedAt)}</div></div>
    </div>`).join('');
}

export function adminToolsHTML(){
  return `
  <div class="card">
    <div class="card-title">Admin Tools</div>
    <div class="action-tile-row" style="margin-bottom:10px;">
      <button class="action-tile tile-checklist" id="manageSitesBtn">${ICONS.box}Manage Sites</button>
      <button class="action-tile tile-finding" id="manageAreasBtn">${ICONS.clipboard}Manage Areas</button>
    </div>
    <div class="action-tile-row" style="margin-bottom:10px;">
      <button class="action-tile tile-checklist" id="manageTitlesBtn">${ICONS.pencil}Manage Checklist</button>
      <button class="action-tile tile-finding" id="manageStaffBtn">${ICONS.user}Manage Staff</button>
    </div>
    <div class="action-tile-row" style="margin-bottom:10px;">
      <button class="action-tile" style="background:#8B5CF6;" id="pendingStaffBtn">${ICONS.clock}Pending Approvals${Object.keys(state.pendingStaffBySite[state.siteId]||{}).length?` (${Object.keys(state.pendingStaffBySite[state.siteId]||{}).length})`:''}</button>
      <button class="action-tile" style="background:var(--navy-700);" id="userMgmtBtn">${ICONS.shield}User Management</button>
    </div>
    <div class="action-tile-row">
      <button class="action-tile" style="background:#0E7C74;" id="activityLogBtn">${ICONS.clock}Activity Log</button>
      <button class="action-tile" style="background:#5B6478;" id="archiveBtn">${ICONS.trash}Archive</button>
    </div>
  </div>`;
}
export function dangerZoneHTML(){
  return `
  <div class="danger-zone">
    <div class="card-title">Danger Zone</div>
    <div style="font-size:12.5px;color:var(--text-600);font-weight:600;margin-bottom:12px;line-height:1.4;">Permanently erases every finding and report for ${currentSiteName()}, and resets its sub-area statuses back to unchecked. This cannot be undone.</div>
    <button class="btn-danger" id="clearAllDataBtn">${ICONS.trash} Clear ${currentSiteName()} Data</button>
  </div>`;
}
export function wireAreaFieldDropdown(){
  const areaField=document.getElementById('areaField');
  if(!areaField) return;
  const areaDropdown=document.getElementById('areaDropdown');
  areaField.onclick=(e)=>{e.stopPropagation();state.areaDropdownOpen=!state.areaDropdownOpen;areaDropdown.style.display=state.areaDropdownOpen?'block':'none';};
  document.querySelectorAll('.floor-dropdown-item[data-area]').forEach(el=>{
    el.onclick=(e)=>{e.stopPropagation();state.areaId=el.dataset.area;state.areaDropdownOpen=false;state.auditStarted=false;state.pickedItemId=null;state.itemDraftFindingIds=[];render();};
  });
}
export function wireCommonFooterHandlers(isAdmin){
  const viewAllFindings=document.getElementById('viewAllFindings');
  if(viewAllFindings) viewAllFindings.onclick=()=>{state.tab='dashboard';render();};
  document.querySelectorAll('.finding-card').forEach(c=>c.onclick=()=>openFindingDetail(parseInt(c.dataset.finding)));
  if(!isAdmin) return;
  const clearBtn=document.getElementById('clearAllDataBtn');
  if(clearBtn) clearBtn.onclick=()=>{
    openConfirmModal(`This will permanently delete every finding and report for ${currentSiteName()}, and reset all its sub-area statuses to unchecked. This cannot be undone. Continue?`,async()=>{
      const confirmBtn=document.getElementById('confirmOkBtn');
      await runGuarded(confirmBtn,'Clearing...',()=>clearSiteData(state.siteId));
      closeModal(); render();
      logActivity(null, 'Data cleared', `Admin cleared all data for ${currentSiteName()}`);
      toast('Site data cleared');
    },'Clear Everything',true);
  };
  document.getElementById('manageSitesBtn').onclick=()=>openSiteManagement();
  document.getElementById('manageAreasBtn').onclick=()=>openAreaManagement(state.siteId);
  document.getElementById('manageTitlesBtn').onclick=()=>openManageChecklist();
  document.getElementById('manageStaffBtn').onclick=()=>openManageStaff();
  document.getElementById('pendingStaffBtn').onclick=()=>openPendingStaff();
  document.getElementById('userMgmtBtn').onclick=()=>openUserManagement();
  document.getElementById('activityLogBtn').onclick=()=>openActivityLog();
  document.getElementById('archiveBtn').onclick=()=>openArchive();
}

/* ---------- Per-item Review & Submit — the only "submit" action in this flow. Each submission is
   folded into ONE evolving Report per (Site, Area, calendar day) via a Firebase transaction, so
   concurrent submissions from different auditors on the same Area/day never clobber each other. ---------- */
export function openItemReview(item, findingIds){
  const findings=findingIds.map(id=>state.findings.find(f=>f.id===id)).filter(Boolean);
  const outcome = findings.length>0 ? 'flagged' : 'ok';
  openModal(`
    <div class="modal-head"><h3>Review — ${item.name}</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    ${outcome==='ok'
      ? `<div class="lock-note" style="background:var(--green-050,#E4F6ED);color:var(--green-600);">${ICONS.check} No issues found in ${item.name}.</div>`
      : `<div class="lock-note" style="background:var(--orange-050);color:#8A5210;">${ICONS.info} ${findings.length} finding${findings.length===1?'':'s'} will be submitted for ${item.name}.</div>
         ${findings.map(f=>`<div class="checklist-item" style="cursor:default;">${statusIcon('issue')}<div style="flex:1;min-width:0;"><div class="ci-name">${f.title}</div><div class="ci-sub unchecked">${f.severity} severity</div></div></div>`).join('')}`}
    <div style="font-size:12.5px;color:var(--text-600);font-weight:600;margin:16px 0;">This adds to today's report for ${currentSiteName()} / ${currentAreaName()}. You can audit this same sub-area again later today if needed.</div>
    <div style="display:flex;gap:10px;">
      <button class="btn-secondary" id="reviewBackBtn">Back</button>
      <button class="btn-primary" id="reviewConfirmBtn" style="flex:1;background:var(--green-600);">${ICONS.check} Submit</button>
    </div>
  `);
  document.getElementById('reviewBackBtn').onclick=()=>{ closeModal(); render(); };
  document.getElementById('reviewConfirmBtn').onclick=async()=>{
    const btn=document.getElementById('reviewConfirmBtn');
    const siteId=state.siteId, areaId=state.areaId;
    let result;
    try{
      await runGuarded(btn,'Submitting...',async()=>{ result=await submitItemEntry(siteId,areaId,item,outcome,findingIds); });
    }catch(e){
      return; // submitItemEntry already showed the specific error toast — stay on this screen so they can retry
    }
    closeModal();
    state.pickedItemId=null; state.itemDraftFindingIds=[];
    render();
    const label=`Submitted — ${item.name}${outcome==='ok'?' (OK)':` (${findingIds.length} finding${findingIds.length===1?'':'s'})`}`;
    toastWithUndo(label, async()=>{
      await undoItemEntry(siteId,areaId,result.reportId,result.entryId,outcome==='flagged'?findingIds:[]);
      toast('Undone');
      render();
    });
  };
}
async function submitItemEntry(siteId, areaId, item, outcome, findingIds){
  if(!storageAvailable) throw new Error('Storage not available');
  const dateISO=todayISO();
  const dateLabel=fmtDateShort(dateISO);
  const reportId=todaysReportId(areaId);
  const entryId=db.ref().push().key;
  const areaName=((state.areasBySite[siteId]||{})[areaId]||{}).name||'Unknown Area';
  const totalItemsNow=((state.subAreasByArea[siteId]||{})[areaId]||[]).length;
  const entry={ subAreaId:item.id, itemName:item.name, outcome, findingIds:findingIds||[], submittedBy:state.username||'Unknown', submittedAt:Date.now() };
  const reportRef=db.ref(`${DB_PATH}/reports/${siteId}/${reportId}`);
  try{
    const result=await reportRef.transaction(current=>{
      const rep=current || { id:reportId, siteId, areaId, date:dateLabel, floor:areaName, entries:{} };
      rep.entries=rep.entries||{};
      rep.entries[entryId]=entry;
      const allFindingIds=[]; const doneItemIds=new Set();
      Object.values(rep.entries).forEach(e=>{ (e.findingIds||[]).forEach(id=>allFindingIds.push(id)); doneItemIds.add(e.subAreaId); });
      rep.findingIds=allFindingIds; rep.findingsCount=allFindingIds.length; rep.completedItems=doneItemIds.size;
      rep.totalItems=totalItemsNow; rep.submittedBy=entry.submittedBy; rep.date=dateLabel; rep.floor=areaName;
      rep.siteId=siteId; rep.areaId=areaId; rep.id=reportId;
      return rep;
    });
    if(!result.committed){ throw new Error('Report update was not committed — please try again.'); }
  }catch(e){ console.error('submitItemEntry failed',e); toast(friendlyFirebaseError(e)); throw e; }
  logActivity(siteId, outcome==='ok'?'Sub-area OK':'Report submitted', `${item.name} — ${outcome==='ok'?'no issues':`${(findingIds||[]).length} finding(s)`}`);
  return {reportId,entryId};
}
async function undoItemEntry(siteId, areaId, reportId, entryId, findingIdsToDelete){
  if(!storageAvailable || !reportId) return;
  const reportRef=db.ref(`${DB_PATH}/reports/${siteId}/${reportId}`);
  try{
    await reportRef.transaction(current=>{
      if(!current || !current.entries || !current.entries[entryId]) return current;
      delete current.entries[entryId];
      const remaining=current.entries;
      if(Object.keys(remaining).length===0) return null;
      const allFindingIds=[]; const doneItemIds=new Set();
      Object.values(remaining).forEach(e=>{ (e.findingIds||[]).forEach(id=>allFindingIds.push(id)); doneItemIds.add(e.subAreaId); });
      current.findingIds=allFindingIds; current.findingsCount=allFindingIds.length; current.completedItems=doneItemIds.size;
      return current;
    });
    if(findingIdsToDelete && findingIdsToDelete.length){
      const updates={};
      findingIdsToDelete.forEach(fid=>{ updates[`${DB_PATH}/findings/${siteId}/${fid}`]=null; });
      await db.ref().update(updates);
    }
  }catch(e){ console.error('undoItemEntry failed',e); toast(friendlyFirebaseError(e)); }
}

export function openEditSubArea(id){
  const isNew = id===null;
  const list=getSubAreas();
  const item = isNew ? {name:''} : list.find(c=>c.id===id);
  openModal(`
    <div class="modal-head"><h3>${isNew?'Add Sub-Area':'Edit Sub-Area'} — ${currentAreaName()}</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="field-block"><label class="field-label">Sub-Area Name</label><input class="text-input" id="itemNameInput" value="${item.name}" placeholder="e.g. Loading Dock"></div>
    <button class="btn-primary" id="itemSaveBtn" style="margin-bottom:10px;">Save Sub-Area</button>
    ${!isNew?`<button class="btn-secondary" style="width:100%;color:var(--red-500);border-color:var(--red-050);" id="itemDeleteBtn">${ICONS.trash} Remove Sub-Area</button>`:''}
  `);
  document.getElementById('itemSaveBtn').onclick=async()=>{
    const name=document.getElementById('itemNameInput').value.trim();
    if(!name){toast('Please enter a name');return;}
    if(isNew){ list.push({id:nextId(),name,status:'unchecked'}); toast('Sub-area added to '+currentAreaName()); }
    else { item.name=name; toast('Sub-area updated'); }
    const btn=document.getElementById('itemSaveBtn');
    await runGuarded(btn,'Saving...',()=>saveSubAreasForArea(state.siteId,state.areaId,list));
    logActivity(state.siteId, 'Sub-areas modified', `${isNew?'Added':'Renamed'} "${name}" on ${currentSiteName()} / ${currentAreaName()}`);
    closeModal();render();
  };
  if(!isNew){
    document.getElementById('itemDeleteBtn').onclick=async()=>{
      const newList=list.filter(c=>c.id!==id);
      setSubAreas(newList);
      const btn=document.getElementById('itemDeleteBtn');
      await runGuarded(btn,'Removing...',()=>saveSubAreasForArea(state.siteId,state.areaId,newList));
      logActivity(state.siteId, 'Sub-areas modified', `Removed "${item.name}" from ${currentSiteName()} / ${currentAreaName()}`);
      closeModal();render();toast('Sub-area removed');
    };
  }
}

/* ---------- Admin Tools: Manage Checklist ---------- */
export function openManageChecklist(){
  const siteId=state.siteId;
  const items=state.checklistsBySite[siteId]||DEFAULT_CHECKLIST.slice();
  openModal(`
    <div class="modal-head"><h3>Manage Checklist — ${currentSiteName()}</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="lock-note">${ICONS.info} This checklist populates the finding-title dropdown when logging a finding for ${currentSiteName()}. Each Site has its own checklist.</div>
    <div class="field-block"><div style="display:flex;gap:8px;"><input class="text-input" id="newTitleInput" placeholder="Add a checklist item..."><button class="btn-primary" id="addTitleBtn" style="width:auto;padding:12px 16px;">${ICONS.plus}</button></div></div>
    <div id="titleListWrap">
      ${items.map((t,i)=>`
        <div class="checklist-item" style="cursor:default;">
          <div style="flex:1;min-width:0;"><div class="ci-name">${t}</div></div>
          <button class="admin-edit-btn" data-remove-title="${i}" style="background:var(--red-050);color:var(--red-500);">${ICONS.trash}</button>
        </div>`).join('')}
    </div>
    <button class="btn-secondary" style="width:100%;margin-top:10px;" onclick="closeModal()">Close</button>
  `);
  document.getElementById('addTitleBtn').onclick=async()=>{
    const val=document.getElementById('newTitleInput').value.trim();
    if(!val){toast('Enter a checklist item first');return;}
    if(items.includes(val)){toast('That checklist item already exists');return;}
    const updated=[...items,val];
    await saveChecklistForSite(siteId,updated);
    logActivity(siteId, 'Checklist modified', `Added checklist item "${val}"`);
    openManageChecklist();
  };
  document.querySelectorAll('[data-remove-title]').forEach(btn=>{
    btn.onclick=async()=>{
      const idx=parseInt(btn.dataset.removeTitle);
      const removed=items[idx];
      const updated=items.filter((_,i)=>i!==idx);
      await saveChecklistForSite(siteId,updated);
      logActivity(siteId, 'Checklist modified', `Removed checklist item "${removed}"`);
      openManageChecklist();
    };
  });
}

/* ---------- Admin Tools: Manage Staff (per Site + Area) ---------- */
export function openManageStaff(){
  const siteId=state.siteId, areaId=state.areaId;
  const list=(state.staffByAreaBySite[siteId]||{})[areaId]||[];
  openModal(`
    <div class="modal-head"><h3>Manage Staff — ${currentAreaName()}</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="lock-note">${ICONS.info} Staff assignable to findings on ${currentSiteName()} / ${currentAreaName()} only. Switch Area on Daily Audit to manage another roster.</div>
    <div class="field-block"><div style="display:flex;gap:8px;"><input class="text-input" id="newStaffInput" placeholder="Add staff name..."><button class="btn-primary" id="addStaffBtn" style="width:auto;padding:12px 16px;">${ICONS.plus}</button></div></div>
    ${list.length===0 ? `<div class="empty-mini">No staff added for ${currentAreaName()} yet</div>` : list.map((n,i)=>`
      <div class="checklist-item" style="cursor:default;">
        <div style="flex:1;min-width:0;"><div class="ci-name">${n}</div></div>
        <button class="admin-edit-btn" data-remove-staff="${i}" style="background:var(--red-050);color:var(--red-500);">${ICONS.trash}</button>
      </div>`).join('')}
    <button class="btn-secondary" style="width:100%;margin-top:10px;" onclick="closeModal()">Close</button>
  `);
  document.getElementById('addStaffBtn').onclick=async()=>{
    const val=document.getElementById('newStaffInput').value.trim();
    if(!val){toast('Enter a name first');return;}
    const current=list.slice();
    if(current.includes(val)){toast('Already on the list');return;}
    current.push(val);
    await saveStaffForArea(siteId,areaId,current);
    logActivity(siteId, 'Checklist modified', `Added staff "${val}" to ${currentAreaName()}`);
    openManageStaff();
  };
  document.querySelectorAll('[data-remove-staff]').forEach(btn=>{
    btn.onclick=async()=>{
      const idx=parseInt(btn.dataset.removeStaff);
      const current=list.slice();
      const removed=current[idx];
      current.splice(idx,1);
      await saveStaffForArea(siteId,areaId,current);
      logActivity(siteId, 'Checklist modified', `Removed staff "${removed}" from ${currentAreaName()}`);
      openManageStaff();
    };
  });
}

/* ---------- Admin Tools: Pending Staff Approvals (per Site) ---------- */
export function openPendingStaff(){
  const siteId=state.siteId;
  const entries=Object.entries(state.pendingStaffBySite[siteId]||{});
  const areas=state.areasBySite[siteId]||{};
  openModal(`
    <div class="modal-head"><h3>Pending Staff Approvals — ${currentSiteName()}</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    ${entries.length===0 ? `<div class="empty-mini" style="padding:16px 0;">No pending requests</div>` : entries.map(([id,rec])=>`
      <div class="card" style="cursor:default;">
        <div style="font-weight:700;font-size:14.5px;">${rec.name}</div>
        <div style="font-size:12.5px;color:var(--text-600);margin:2px 0 10px;">Area: ${(areas[rec.areaId]||{}).name||'Unknown'} · Requested by ${rec.requestedBy}</div>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" data-reject="${id}" style="color:var(--red-500);">${ICONS.x} Reject</button>
          <button class="btn-primary" data-approve="${id}" style="flex:1;background:var(--green-600);">${ICONS.check} Approve</button>
        </div>
      </div>`).join('')}
    <button class="btn-secondary" style="width:100%;margin-top:6px;" onclick="closeModal()">Close</button>
  `);
  document.querySelectorAll('[data-approve]').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.approve;
      const rec=(state.pendingStaffBySite[siteId]||{})[id];
      const areaName=(areas[rec.areaId]||{}).name||'Unknown';
      await approvePendingStaff(siteId,id);
      logActivity(siteId, 'User role changed', `Approved staff "${rec.name}" for ${areaName}`);
      toast(`${rec.name} added to ${areaName} roster`);
      openPendingStaff();
    };
  });
  document.querySelectorAll('[data-reject]').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.reject;
      const rec=(state.pendingStaffBySite[siteId]||{})[id];
      const areaName=(areas[rec.areaId]||{}).name||'Unknown';
      await rejectPendingStaff(siteId,id);
      logActivity(siteId, 'User role changed', `Rejected staff request "${rec.name}" (${areaName})`);
      openPendingStaff();
    };
  });
}

/* ---------- Admin Tools: Site Management ---------- */
export function openSiteManagement(){
  const entries=Object.entries(state.sites).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0));
  openModal(`
    <div class="modal-head"><h3>Manage Sites</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="lock-note">${ICONS.info} Each Site is a fully separate data space — Auditors and Resolvers only see Sites they're assigned to in User Management.</div>
    <div class="field-block"><div style="display:flex;gap:8px;"><input class="text-input" id="newSiteInput" placeholder="e.g. Davao Warehouse"><button class="btn-primary" id="addSiteBtn" style="width:auto;padding:12px 16px;">${ICONS.plus}</button></div></div>
    ${entries.length===0 ? `<div class="empty-mini">No Sites yet</div>` : entries.map(([id,s])=>`
      <div class="checklist-item" style="cursor:default;">
        <div style="flex:1;min-width:0;"><div class="ci-name">${s.name}</div><div class="ci-sub unchecked">${Object.keys(state.areasBySite[id]||{}).length} Area(s)</div></div>
        <button class="admin-edit-btn" data-manage-areas="${id}" title="Manage Areas">${ICONS.clipboard}</button>
        <button class="admin-edit-btn" data-rename-site="${id}" title="Rename">${ICONS.pencil}</button>
        <button class="admin-edit-btn" data-delete-site="${id}" style="background:var(--red-050);color:var(--red-500);" title="Delete">${ICONS.trash}</button>
      </div>`).join('')}
    <button class="btn-secondary" style="width:100%;margin-top:10px;" onclick="closeModal()">Close</button>
  `);
  document.getElementById('addSiteBtn').onclick=async()=>{
    const name=document.getElementById('newSiteInput').value.trim();
    if(!name){toast('Enter a Site name');return;}
    const id=refs.sites.push().key;
    try{
      await refs.sites.child(id).set({name,createdAt:Date.now(),createdBy:state.username||'Unknown',active:true});
      logActivity(null, 'Site created', name);
      toast('Site created');
      openSiteManagement();
    }catch(e){ toast(friendlyFirebaseError(e)); }
  };
  document.querySelectorAll('[data-manage-areas]').forEach(btn=>{
    btn.onclick=()=>openAreaManagement(btn.dataset.manageAreas);
  });
  document.querySelectorAll('[data-rename-site]').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.renameSite;
      const current=state.sites[id];
      const name=prompt('Rename Site',current.name);
      if(!name||!name.trim()) return;
      try{ await refs.sites.child(id).update({name:name.trim()}); logActivity(null,'Site renamed',`${current.name} → ${name.trim()}`); openSiteManagement(); }
      catch(e){ toast(friendlyFirebaseError(e)); }
    };
  });
  document.querySelectorAll('[data-delete-site]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.dataset.deleteSite;
      const s=state.sites[id];
      openConfirmModal(`Delete "${s.name}"? This permanently removes the Site, its Areas, and every finding/report/checklist under it. This cannot be undone.`,async()=>{
        const confirmBtn=document.getElementById('confirmOkBtn');
        await runGuarded(confirmBtn,'Deleting...',async()=>{
          const updates={};
          ['findings','reports','subAreasByArea','areaLastSubmitted','checklistsBySite','staffByArea','pendingStaff','activityLog'].forEach(k=>{
            updates[`${DB_PATH}/${k}/${id}`]=null;
          });
          updates[`${DB_PATH}/archive/findings/${id}`]=null;
          updates[`${DB_PATH}/archive/reports/${id}`]=null;
          updates[`${DB_PATH}/areasBySite/${id}`]=null;
          updates[`${DB_PATH}/sites/${id}`]=null;
          await db.ref().update(updates);
        });
        logActivity(null,'Site deleted',s.name);
        if(state.siteId===id){ state.siteId=null; state.areaId=null; }
        closeModal();
        toast('Site deleted');
        openSiteManagement();
      },'Delete Site',true);
    };
  });
}

/* ---------- Admin Tools: Area Management (per Site) ---------- */
export function openAreaManagement(siteId){
  const site=state.sites[siteId];
  const list=Object.entries(state.areasBySite[siteId]||{}).map(([id,a])=>({id,...a})).sort((a,b)=>(a.order||0)-(b.order||0));
  openModal(`
    <div class="modal-head"><h3>Manage Areas — ${site?site.name:''}</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="field-block"><div style="display:flex;gap:8px;"><input class="text-input" id="newAreaInput" placeholder="e.g. Loading Bay"><button class="btn-primary" id="addAreaBtn" style="width:auto;padding:12px 16px;">${ICONS.plus}</button></div></div>
    ${list.length===0 ? `<div class="empty-mini">No Areas yet for this Site</div>` : list.map(a=>`
      <div class="checklist-item" style="cursor:default;">
        <div style="flex:1;min-width:0;"><div class="ci-name">${a.name}</div></div>
        <button class="admin-edit-btn" data-rename-area="${a.id}" title="Rename">${ICONS.pencil}</button>
        <button class="admin-edit-btn" data-delete-area="${a.id}" style="background:var(--red-050);color:var(--red-500);" title="Delete">${ICONS.trash}</button>
      </div>`).join('')}
    <button class="btn-secondary" style="width:100%;margin-top:10px;" onclick="closeModal()">Close</button>
  `);
  document.getElementById('addAreaBtn').onclick=async()=>{
    const name=document.getElementById('newAreaInput').value.trim();
    if(!name){toast('Enter an Area name');return;}
    const id=refs.areasBySite.child(siteId).push().key;
    try{
      await refs.areasBySite.child(siteId).child(id).set({name,order:list.length,createdAt:Date.now()});
      await db.ref(`${DB_PATH}/subAreasByArea/${siteId}/${id}`).set([]);
      logActivity(siteId,'Checklist modified',`Added Area "${name}"`);
      toast('Area added');
      openAreaManagement(siteId);
    }catch(e){ toast(friendlyFirebaseError(e)); }
  };
  document.querySelectorAll('[data-rename-area]').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.renameArea;
      const current=(state.areasBySite[siteId]||{})[id];
      const name=prompt('Rename Area',current.name);
      if(!name||!name.trim()) return;
      try{ await refs.areasBySite.child(siteId).child(id).update({name:name.trim()}); logActivity(siteId,'Checklist modified',`${current.name} → ${name.trim()}`); openAreaManagement(siteId); }
      catch(e){ toast(friendlyFirebaseError(e)); }
    };
  });
  document.querySelectorAll('[data-delete-area]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.dataset.deleteArea;
      const a=(state.areasBySite[siteId]||{})[id];
      openConfirmModal(`Delete "${a.name}"? Its sub-areas will be removed. Past findings and reports stay in your records. This cannot be undone.`,async()=>{
        const confirmBtn=document.getElementById('confirmOkBtn');
        await runGuarded(confirmBtn,'Deleting...',async()=>{
          const updates={};
          updates[`${DB_PATH}/areasBySite/${siteId}/${id}`]=null;
          updates[`${DB_PATH}/subAreasByArea/${siteId}/${id}`]=null;
          updates[`${DB_PATH}/areaLastSubmitted/${siteId}/${id}`]=null;
          updates[`${DB_PATH}/staffByArea/${siteId}/${id}`]=null;
          await db.ref().update(updates);
        });
        logActivity(siteId,'Checklist modified',`Removed Area "${a.name}"`);
        if(state.areaId===id) state.areaId=null;
        closeModal();
        toast('Area removed');
        openAreaManagement(siteId);
      },'Delete Area',true);
    };
  });
}

/* ---------- Admin Tools: User Management ---------- */
export function openUserManagement(){
  const q=(document.getElementById('userSearchInput')?document.getElementById('userSearchInput').value:'').toLowerCase();
  const entries=Object.entries(state.userRoles||{}).filter(([uid,u])=>!q||(u.name||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q))
    .sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  const ONLINE_WINDOW_MS=5*60*1000;
  const allSites=Object.entries(state.sites);
  openModal(`
    <div class="modal-head"><h3>User Management</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="lock-note">${ICONS.info} Each person signs in with their own email + password. Role, Site access, and permissions are all enforced by the database itself, not just the app. Admin always has access to every Site.</div>
    <div class="search-bar" style="margin-bottom:14px;">${ICONS.search}<input id="userSearchInput" placeholder="Search users..." value="${q}"></div>
    ${entries.length===0 ? `<div class="empty-mini">No users found</div>` : entries.map(([uid,u])=>{
      const online = u.lastSeen && (Date.now()-u.lastSeen)<ONLINE_WINDOW_MS;
      const isSelf = uid===state.uid;
      const mySites=u.sites||{};
      return `
      <div class="card" style="cursor:default;">
        <div class="row-between">
          <div><div style="font-weight:700;font-size:14.5px;">${u.name}${isSelf?' (you)':''}</div><div style="font-size:11.5px;color:var(--text-600);font-weight:600;">${u.email||''}</div></div>
          <span class="status-pill ${u.active===false?'pill-issue':'pill-good'}">${u.active===false?'Deactivated':online?'Online':'Active'}</span>
        </div>
        <div style="font-size:11px;color:var(--text-400);margin:8px 0 10px;">Last seen ${u.lastSeen?relativeTime(u.lastSeen):'Never'}</div>
        <select class="select-input" style="margin-bottom:8px;" data-role-select="${uid}" ${isSelf?'disabled':''}>
          <option value="auditor" ${u.role==='auditor'?'selected':''}>Auditor</option>
          <option value="resolver" ${u.role==='resolver'?'selected':''}>Resolver</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
        </select>
        ${u.role!=='admin' ? `
        <div style="margin-bottom:8px;">
          <label class="field-label" style="margin-bottom:4px;">Site Access</label>
          ${allSites.length===0 ? `<div class="empty-mini" style="padding:4px 0;">No Sites exist yet</div>` : allSites.map(([sid,s])=>`
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;padding:4px 0;">
              <input type="checkbox" data-site-check="${uid}|${sid}" ${mySites[sid]?'checked':''}> ${s.name}
            </label>`).join('')}
        </div>` : `<div class="lock-note" style="margin-bottom:8px;">${ICONS.shield} Admins automatically have access to every Site.</div>`}
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" style="flex:1;${u.active===false?'color:var(--green-600);':'color:var(--red-500);'}" data-toggle-user="${uid}" ${isSelf?'disabled':''}>${u.active===false?ICONS.check+' Reactivate':ICONS.x+' Deactivate'}</button>
          <button class="btn-secondary" style="flex:1;" data-reset-user="${uid}">${ICONS.lock} Reset PW</button>
          <button class="btn-secondary" style="flex:1;color:var(--red-500);" data-delete-user="${uid}" ${isSelf?'disabled':''}>${ICONS.trash}</button>
        </div>
      </div>`;}).join('')}
    <div class="field-block" style="margin-top:14px;"><label class="field-label">Create new user</label>
      <input class="text-input" id="newUserNameInput" placeholder="Full name" style="margin-bottom:8px;">
      <input class="text-input" id="newUserEmailInput" placeholder="Email address" type="email" style="margin-bottom:8px;">
      <input class="text-input" id="newUserPwInput" placeholder="Temporary password (min 6 chars)" type="text" style="margin-bottom:8px;">
      <select class="select-input" id="newUserRoleSel" style="margin-bottom:8px;">
        <option value="auditor">Auditor</option>
        <option value="resolver">Resolver</option>
        <option value="admin">Admin</option>
      </select>
      <button class="btn-secondary" style="width:100%;" id="addUserBtn">${ICONS.check} Create User</button>
    </div>
    <button class="btn-secondary" style="width:100%;margin-top:10px;" onclick="closeModal()">Close</button>
  `);
  const search=document.getElementById('userSearchInput');
  search.focus();
  search.setSelectionRange(search.value.length,search.value.length);
  search.oninput=()=>openUserManagement();
  document.querySelectorAll('[data-role-select]').forEach(sel=>{
    sel.onchange=async()=>{ await setUserRole(sel.dataset.roleSelect, sel.value); openUserManagement(); };
  });
  document.querySelectorAll('[data-site-check]').forEach(cb=>{
    cb.onchange=async()=>{
      const [uid,sid]=cb.dataset.siteCheck.split('|');
      const current={...(state.userRoles[uid].sites||{})};
      if(cb.checked) current[sid]=true; else delete current[sid];
      await setUserSites(uid,current);
    };
  });
  document.querySelectorAll('[data-toggle-user]').forEach(btn=>{
    btn.onclick=async()=>{
      const uid=btn.dataset.toggleUser;
      const u=state.userRoles[uid];
      await setUserActive(uid, u.active===false);
      openUserManagement();
    };
  });
  document.querySelectorAll('[data-reset-user]').forEach(btn=>{
    btn.onclick=async()=>{
      const uid=btn.dataset.resetUser;
      const u=state.userRoles[uid];
      if(u && u.email) await sendPasswordReset(u.email);
    };
  });
  document.querySelectorAll('[data-delete-user]').forEach(btn=>{
    btn.onclick=async()=>{
      const uid=btn.dataset.deleteUser;
      const u=state.userRoles[uid];
      if(!confirm(`Remove ${u.name}'s access? This removes their role record so they can no longer sign in. Their sign-in account itself must still be deleted from the Firebase Console (client apps can't delete other users' accounts).`)) return;
      await removeUserRecord(uid);
      openUserManagement();
    };
  });
  const addBtn=document.getElementById('addUserBtn');
  if(addBtn) addBtn.onclick=async()=>{
    const name=(document.getElementById('newUserNameInput').value||'').trim();
    const email=(document.getElementById('newUserEmailInput').value||'').trim();
    const pw=document.getElementById('newUserPwInput').value||'';
    const role=document.getElementById('newUserRoleSel').value;
    if(!name||!email||pw.length<6){ toast('Enter a name, email, and a password of at least 6 characters'); return; }
    addBtn.disabled=true; addBtn.textContent='Creating...';
    const ok=await createUserByAdmin(name,email,pw,role);
    addBtn.disabled=false; addBtn.textContent=ICONS.check+' Create User';
    if(ok){ toast('User created — share their email and temporary password with them. Set their Site access next.'); openUserManagement(); }
  };
}

/* ---------- Admin Tools: Activity Log ---------- */
export function openActivityLog(){
  openModal(`
    <div class="modal-head"><h3>Activity Log</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    ${state.activityLog.length===0 ? `<div class="empty-mini" style="padding:16px 0;">No activity yet</div>` : state.activityLog.slice(0,100).map(n=>`
      <div class="kv-row" style="display:block;padding:10px 0;">
        <div style="font-weight:700;font-size:13px;">${n.action}${n.siteName?` <span style="font-weight:600;color:var(--blue-600);font-size:11px;">— ${n.siteName}</span>`:''} <span style="font-weight:600;color:var(--text-400);font-size:11px;">— ${n.role||''}</span></div>
        <div style="font-size:12px;color:var(--text-600);margin-top:2px;">${n.user} ${n.detail?`— ${n.detail}`:''}</div>
        <div style="font-size:10.5px;color:var(--text-400);margin-top:2px;">${new Date(n.ts).toLocaleString()}</div>
      </div>`).join('')}
    <button class="btn-secondary" style="width:100%;margin-top:6px;" onclick="closeModal()">Close</button>
  `);
}

/* ---------- Admin Tools: Archive (soft-deleted findings & reports, across all Sites) ---------- */
export function openArchive(){
  openModal(`
    <div class="modal-head"><h3>Archive</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="card-title">Archived Findings (${state.archivedFindings.length})</div>
    ${state.archivedFindings.length===0 ? `<div class="empty-mini" style="padding:8px 0;">None</div>` : state.archivedFindings.map(f=>`
      <div class="card" style="cursor:default;padding:12px;">
        <div class="row-between"><div style="font-weight:700;font-size:13.5px;">${f.title}</div><div class="sev-chip sev-${f.severity}">${f.severity}</div></div>
        <div style="font-size:11.5px;color:var(--text-600);margin:4px 0 8px;">${(state.sites[f.siteId]||{}).name||''} · ${f.area} · Deleted by ${f.deletedBy} · ${relativeTime(f.deletedAt)}</div>
        <button class="btn-secondary" style="width:100%;color:var(--green-600);" data-restore-finding="${f.siteId}|${f.id}">${ICONS.check} Restore</button>
      </div>`).join('')}
    <div class="card-title" style="margin-top:16px;">Archived Reports (${state.archivedReports.length})</div>
    ${state.archivedReports.length===0 ? `<div class="empty-mini" style="padding:8px 0;">None</div>` : state.archivedReports.map(r=>`
      <div class="card" style="cursor:default;padding:12px;">
        <div style="font-weight:700;font-size:13.5px;">${r.date} — ${(state.sites[r.siteId]||{}).name||''} / ${r.floor}</div>
        <div style="font-size:11.5px;color:var(--text-600);margin:4px 0 8px;">Deleted by ${r.deletedBy} · ${relativeTime(r.deletedAt)}</div>
        <button class="btn-secondary" style="width:100%;color:var(--green-600);" data-restore-report="${r.siteId}|${r.id}">${ICONS.check} Restore</button>
      </div>`).join('')}
    <button class="btn-secondary" style="width:100%;margin-top:6px;" onclick="closeModal()">Close</button>
  `);
  document.querySelectorAll('[data-restore-finding]').forEach(btn=>{
    btn.onclick=async()=>{
      const [siteId,idStr]=btn.dataset.restoreFinding.split('|');
      const id=parseInt(idStr);
      await restoreFinding(siteId,id);
      logActivity(siteId, 'Finding edited', `Restored finding from archive (#${id})`);
      toast('Finding restored');
      openArchive();
    };
  });
  document.querySelectorAll('[data-restore-report]').forEach(btn=>{
    btn.onclick=async()=>{
      const [siteId,idStr]=btn.dataset.restoreReport.split('|');
      const id=parseInt(idStr);
      await restoreReport(siteId,id);
      logActivity(siteId, 'Report submitted', `Restored report from archive (#${id})`);
      toast('Report restored');
      openArchive();
    };
  });
}

/* ---------- Add / Edit Finding ---------- */
export let fPhotoData=null;
export let sevSelected='High';
export let fLockedItem=null;
export let editingFindingId=null;
export let fTitleSelected=null;
export let fAssignedMode='select';
export let fAssignedSelected='';
export function openAddFinding(lockedItem, editFinding){
  fLockedItem=lockedItem||null;
  fAssignedMode='select';
  if(editFinding){
    editingFindingId=editFinding.id;
    sevSelected=editFinding.severity;
    fPhotoData=editFinding.photos.before||null;
    fTitleSelected=editFinding.title;
    fAssignedSelected=editFinding.assignedTo||'';
  } else {
    editingFindingId=null; sevSelected='High'; fPhotoData=null;
    fTitleSelected=null; fAssignedSelected='';
  }
  renderAddFindingModal();
}
export function renderAddFindingModal(){
  const editingFinding=editingFindingId?state.findings.find(f=>f.id===editingFindingId):null;
  const descVal=document.getElementById('fDesc')?document.getElementById('fDesc').value:(editingFinding?editingFinding.description:'');
  const subAreas=getSubAreas();
  const checklistItems=state.checklistsBySite[state.siteId]||DEFAULT_CHECKLIST;
  const titleVal=fTitleSelected || (editingFinding?editingFinding.title:'') || checklistItems[0] || '';
  fTitleSelected=titleVal;
  const staffList=(state.staffByAreaBySite[state.siteId]||{})[state.areaId]||[];
  const showCustomAssigned = fAssignedMode==='custom';
  openModal(`
    <div class="modal-head"><h3>${editingFinding?'Edit Finding':'Add Finding'}</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="field-block">
      <label class="field-label">Checklist Item</label>
      <select class="select-input" id="fTitle">
        ${checklistItems.map(t=>`<option value="${t}" ${t===titleVal?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="field-block">
      <label class="field-label">Sub-Area</label>
      ${fLockedItem
        ? `<div class="date-field" style="cursor:default;"><div>${fLockedItem.name}</div></div>`
        : subAreas.length
          ? `<select class="select-input" id="fArea">${subAreas.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>`
          : `<div class="lock-note">${ICONS.info} No sub-areas exist for ${currentAreaName()} yet.</div>`}
    </div>
    <div class="field-block">
      <label class="field-label">Severity</label>
      <div class="sev-picker" id="fSevPicker">
        <div class="sev-opt sel-High ${sevSelected==='High'?'selected':''}" data-s="High">High</div>
        <div class="sev-opt sel-Medium ${sevSelected==='Medium'?'selected':''}" data-s="Medium">Medium</div>
        <div class="sev-opt sel-Low ${sevSelected==='Low'?'selected':''}" data-s="Low">Low</div>
      </div>
    </div>
    <div class="field-block"><label class="field-label">Description</label><textarea class="text-input" id="fDesc" rows="3" placeholder="Describe the finding...">${descVal}</textarea></div>
    <div class="field-block">
      <label class="field-label">Assigned To (Optional) — ${currentAreaName()}</label>
      ${!showCustomAssigned ? `
        <select class="select-input" id="fAssignedSelect">
          <option value="">Not assigned</option>
          ${staffList.map(n=>`<option value="${n}" ${n===fAssignedSelected?'selected':''}>${n}</option>`).join('')}
          <option value="__custom__">+ Type a new name...</option>
        </select>
      ` : `
        <input class="text-input" id="fAssignedCustom" placeholder="Type staff name" value="${fAssignedSelected||''}">
        <button class="link-btn" id="fAssignedBack" style="margin-top:6px;">${ICONS.chevronL} Back to list</button>
      `}
    </div>
    <div class="field-block">
      <label class="field-label">Photo (Optional)</label>
      <div class="upload-choice-row">
        <div class="upload-choice" id="takePhotoBtn">${ICONS.camera}Take Photo</div>
        <div class="upload-choice" id="choosePhotoBtn">${ICONS.image}Choose from Gallery</div>
      </div>
      <input type="file" id="fileInputCamera" accept="image/*" capture="environment" style="display:none;">
      <input type="file" id="fileInputGallery" accept="image/*" style="display:none;">
      <div class="preview-box">${fPhotoData?`<img src="${fPhotoData}"><button class="preview-remove" id="removePreview">${ICONS.x}</button>`:`<div class="empty-preview">${ICONS.image}<span>No photo selected</span></div>`}</div>
    </div>
    <button class="btn-primary" id="fReviewBtn">${ICONS.plus} Review Finding</button>
  `);
  document.getElementById('fTitle').onchange=(e)=>{ fTitleSelected=e.target.value; };
  document.querySelectorAll('#fSevPicker [data-s]').forEach(el=>{
    el.onclick=()=>{ sevSelected=el.dataset.s; document.querySelectorAll('#fSevPicker [data-s]').forEach(o=>o.classList.remove('selected')); el.classList.add('selected'); };
  });
  const assignedSelect=document.getElementById('fAssignedSelect');
  if(assignedSelect) assignedSelect.onchange=(e)=>{
    if(e.target.value==='__custom__'){ fAssignedMode='custom'; fAssignedSelected=''; renderAddFindingModal(); }
    else { fAssignedSelected=e.target.value; }
  };
  const assignedCustom=document.getElementById('fAssignedCustom');
  if(assignedCustom) assignedCustom.oninput=(e)=>{ fAssignedSelected=e.target.value; };
  const assignedBack=document.getElementById('fAssignedBack');
  if(assignedBack) assignedBack.onclick=()=>{ fAssignedMode='select'; fAssignedSelected=''; renderAddFindingModal(); };

  const fileInputCamera=document.getElementById('fileInputCamera');
  const fileInputGallery=document.getElementById('fileInputGallery');
  document.getElementById('takePhotoBtn').onclick=()=>fileInputCamera.click();
  document.getElementById('choosePhotoBtn').onclick=()=>fileInputGallery.click();
  const handlePhotoFile=(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async(ev)=>{fPhotoData=await compressImage(ev.target.result);renderAddFindingModal();};
    reader.readAsDataURL(file);
  };
  fileInputCamera.onchange=handlePhotoFile;
  fileInputGallery.onchange=handlePhotoFile;
  const rm=document.getElementById('removePreview');
  if(rm) rm.onclick=(e)=>{e.stopPropagation();fPhotoData=null;renderAddFindingModal();};

  document.getElementById('fReviewBtn').onclick=()=>{
    const title=document.getElementById('fTitle').value.trim();
    if(!title){toast('Please enter a title');return;}
    let targetItem=fLockedItem;
    if(!targetItem){
      const areaSelect=document.getElementById('fArea');
      if(!areaSelect){toast('Add a sub-area first');return;}
      targetItem=subAreas.find(c=>c.id===parseInt(areaSelect.value));
    }
    const assignedTo=(fAssignedSelected||'').trim();
    const isNewStaffName = assignedTo && fAssignedMode==='custom' && !staffList.includes(assignedTo);
    const draft={
      title, area:targetItem.name, subAreaId:targetItem.id,
      severity:sevSelected, description:document.getElementById('fDesc').value,
      assignedTo, isNewStaffName,
      photo:fPhotoData, editingFindingId,
    };
    openReviewFindingModal(draft);
  };
}

export function openReviewFindingModal(draft){
  openModal(`
    <div class="modal-head"><h3>Review Finding</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="preview-box" style="${draft.photo?`background-image:url('${draft.photo}');background-size:cover;background-position:center;cursor:zoom-in;`:`background:#6b7688;`}margin-bottom:16px;" onclick="openImageViewer('${draft.photo?draft.photo.replace(/'/g,"\\'"):''}')"></div>
    <div class="row-between" style="margin-bottom:10px;"><span style="font-weight:600;color:var(--text-600);font-size:13.5px;">${draft.area}</span><div class="sev-chip sev-${draft.severity}">${draft.severity}</div></div>
    <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${draft.title}</div>
    ${draft.description ? `<div style="font-size:13px;color:var(--text-900);margin-bottom:10px;line-height:1.45;">${draft.description}</div>` : ''}
    ${draft.assignedTo ? `<div style="font-size:12.5px;color:var(--text-600);font-weight:600;margin-bottom:14px;">Assigned to: ${draft.assignedTo}${draft.isNewStaffName?' (new — pending Admin approval to join the roster)':''}</div>` : ''}
    <div style="display:flex;gap:10px;">
      <button class="btn-secondary" id="reviewBackBtn">Edit</button>
      <button class="btn-primary" id="reviewConfirmAddBtn" style="flex:1;">${ICONS.check} Confirm &amp; Add</button>
    </div>
  `);
  document.getElementById('reviewBackBtn').onclick=()=>renderAddFindingModal();
  document.getElementById('reviewConfirmAddBtn').onclick=async()=>{
    const siteId=state.siteId, areaId=state.areaId;
    let theFinding, isNew=false;
    if(draft.editingFindingId){
      theFinding=state.findings.find(x=>x.id===draft.editingFindingId);
      theFinding.title=draft.title; theFinding.area=draft.area; theFinding.subAreaId=draft.subAreaId;
      theFinding.severity=draft.severity; theFinding.description=draft.description; theFinding.assignedTo=draft.assignedTo;
      theFinding.photos.before=draft.photo; theFinding.updatedAt=Date.now();
    } else {
      isNew=true;
      const newId=nextId();
      const today=new Date();
      const findingNo=`FA-${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}-${String(newId).slice(-4)}`;
      theFinding={
        id:newId, findingNo, title:draft.title, description:draft.description,
        category:'', severity:draft.severity, siteId, areaId, floor:currentAreaName(), area:draft.area,
        subAreaId:draft.subAreaId, assignedTo:draft.assignedTo,
        time:'Just now', color:'#6b7688',
        photos:{before:draft.photo, after:null},
        createdBy:state.username, createdAt:Date.now(), updatedAt:Date.now(),
        resolvedBy:'', resolvedAt:null, verifiedBy:'', verifiedAt:null,
        resolutionStatus:'open', actionPlan:'',
      };
      // Optimistic local update so the UI feels instant — rolled back below if the actual save fails.
      if(!state.findingsBySite[siteId]) state.findingsBySite[siteId]={};
      state.findingsBySite[siteId][theFinding.id]=theFinding;
      recomputeFlatFindings();
    }
    const btn=document.getElementById('reviewConfirmAddBtn');
    try{
      await runGuarded(btn,'Saving...',()=>saveFinding(theFinding));
    }catch(e){
      // Save genuinely failed — undo the optimistic add so state.findings matches reality, and let the person retry.
      if(isNew){ delete state.findingsBySite[siteId][theFinding.id]; recomputeFlatFindings(); }
      return;
    }
    if(draft.isNewStaffName){
      addPendingStaff(siteId, draft.assignedTo, areaId, state.username);
      logActivity(siteId, 'Staff pending approval', `${draft.assignedTo} — ${currentAreaName()}`);
    }
    fPhotoData=null;
    const returnItem=fLockedItem;
    editingFindingId=null; fLockedItem=null; fTitleSelected=null; fAssignedSelected=''; fAssignedMode='select';
    logActivity(siteId, draft.editingFindingId?'Finding edited':'Finding created', `${theFinding.findingNo||''} — ${theFinding.title} (${theFinding.area})`);
    if(returnItem){
      // Part of the per-sub-area audit flow: add to the in-progress draft list and return to that screen (not yet submitted to the report).
      if(!draft.editingFindingId) state.itemDraftFindingIds.push(theFinding.id);
      closeModal();
      render();
    }else{
      // Stand-alone finding (e.g. Resolver's quick-add button) — no audit draft/review step involved.
      closeModal();
      render();
      toast(draft.editingFindingId?'Finding updated':'Finding added');
    }
  };
}

/* ---------- Finding detail + 3-state resolution ---------- */
export function openFindingDetail(id, cameFrom){
  const f=state.findings.find(x=>x.id===id);
  const status=f.resolutionStatus||'open';
  const isAdmin=state.role==='admin';
  let body='';

  if(status==='open'){
    body = (state.role==='resolver'||isAdmin)
      ? `<button class="btn-primary" id="startResolveBtn" style="background:var(--orange-500);">${ICONS.wrench} Submit Resolution</button>`
      : `<div class="lock-note">${ICONS.info} Only resolvers can submit a resolution for this finding.</div>`;
  } else if(status==='pending'){
    body=`
      <div class="res-banner pending"><strong>Action Plan (by ${f.resolvedBy||'Unknown'}):</strong><br>${f.actionPlan||'—'}</div>
      ${(state.role==='auditor'||isAdmin)
        ? `<button class="btn-primary" id="verifyBtn" style="background:var(--green-600);">${ICONS.check} Verify &amp; Close</button>`
        : `<div class="lock-note">${ICONS.info} Awaiting auditor verification.</div>`}
    `;
  } else {
    body=`
      <div class="res-banner verified">${ICONS.check} Verified &amp; Closed by ${f.verifiedBy||'Unknown'}</div>
      ${f.actionPlan?`<div class="res-banner pending" style="margin-top:-4px;"><strong>Action Plan (by ${f.resolvedBy||'Unknown'}):</strong><br>${f.actionPlan}</div>`:''}
      ${(state.role==='auditor'||isAdmin) ? `<button class="btn-secondary" style="width:100%;margin-top:8px;" id="reopenBtn">Reopen Finding</button>` : ''}
    `;
  }

  const createdDate=new Date(f.createdAt).toLocaleDateString();
  const createdTime=new Date(f.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

  openModal(`
    <div class="modal-head">
      <div><div style="font-size:11px;color:var(--text-400);font-weight:700;margin-bottom:2px;">${f.findingNo||''}</div><h3 style="margin:0;">${f.title}</h3></div>
      <button class="modal-close" onclick="closeModal()">${ICONS.x}</button>
    </div>

    <div class="before-after-row">
      <div class="ba-col">
        <div class="ba-label">Before</div>
        <div class="ba-box" style="${f.photos.before?'cursor:zoom-in;':''}" onclick="openImageViewer('${f.photos.before?f.photos.before.replace(/'/g,"\\'"):''}')">${f.photos.before?`<img src="${f.photos.before}">`:`<div class="ba-empty">No photo</div>`}</div>
      </div>
      <div class="ba-col">
        <div class="ba-label">After Repair</div>
        <div class="ba-box" style="${f.photos.after?'cursor:zoom-in;':''}" onclick="openImageViewer('${f.photos.after?f.photos.after.replace(/'/g,"\\'"):''}')">
          ${f.photos.after?`<img src="${f.photos.after}">`:`<div class="ba-empty">${f.resolutionStatus==='open'?'Not yet resolved':'No photo'}</div>`}
          ${f.resolutionStatus==='verified'?`<div class="verified-ribbon">${ICONS.check} Verified</div>`:''}
        </div>
      </div>
    </div>

    <div class="row-between" style="margin-bottom:10px;">
      <span style="font-weight:600;color:var(--text-600);font-size:13.5px;">${f.area}</span>
      <div style="display:flex;gap:6px;align-items:center;">${resolutionPillHTML(f)}${dueBadgeHTML(f)}<div class="sev-chip sev-${f.severity}">${f.severity}</div></div>
    </div>
    ${f.description ? `<div style="font-size:13px;color:var(--text-900);margin-bottom:10px;line-height:1.45;">${f.description}</div>` : ''}
    ${f.assignedTo ? `<div style="font-size:12.5px;color:var(--text-600);font-weight:600;margin-bottom:10px;">Assigned to: <strong>${f.assignedTo}</strong></div>` : ''}

    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:16px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:#111827;">Audit History</div>
      <div style="font-size:12px;line-height:1.7;">
        <div><b>Created By:</b> ${f.createdBy||'Unknown'}</div>
        <div><b>Created:</b> ${createdDate} ${createdTime}</div>
        ${f.resolvedBy?`<hr style="margin:8px 0;border:none;border-top:1px solid #e5e7eb;"><div><b>Resolved By:</b> ${f.resolvedBy}</div><div><b>Resolved:</b> ${f.resolvedAt?new Date(f.resolvedAt).toLocaleString():'—'}</div>`:''}
        ${f.verifiedBy?`<hr style="margin:8px 0;border:none;border-top:1px solid #e5e7eb;"><div><b>Verified By:</b> ${f.verifiedBy}</div><div><b>Verified:</b> ${f.verifiedAt?new Date(f.verifiedAt).toLocaleString():'—'}</div>`:''}
      </div>
    </div>

    ${body}
    ${isAdmin ? `
      <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--border);">
        <div style="font-size:11px;font-weight:800;color:var(--red-500);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Admin Override</div>
        <label class="field-label">Force Resolution Status</label>
        <div class="sev-picker" id="adminForceStatus" style="margin-bottom:10px;">
          <div class="sev-opt ${status==='open'?'selected':''}" data-fs="open" style="${status==='open'?'border-color:var(--red-500);background:var(--red-050);color:var(--red-500);':''}">Open</div>
          <div class="sev-opt ${status==='pending'?'selected':''}" data-fs="pending" style="${status==='pending'?'border-color:var(--orange-500);background:var(--orange-050);color:var(--orange-500);':''}">Pending</div>
          <div class="sev-opt ${status==='verified'?'selected':''}" data-fs="verified" style="${status==='verified'?'border-color:var(--green-600);background:var(--green-050);color:var(--green-600);':''}">Verified</div>
        </div>
        <button class="btn-danger" id="deleteFindingBtn">${ICONS.trash} Archive Finding</button>
      </div>
    ` : ''}
    <button class="btn-secondary" style="width:100%;margin-top:10px;" id="findingDetailCloseBtn">${cameFrom?ICONS.chevronL+' Back':'Close'}</button>
  `);

  const startBtn=document.getElementById('startResolveBtn');
  if(startBtn) startBtn.onclick=()=>openResolveForm(f.id);
  const verifyBtn=document.getElementById('verifyBtn');
  if(verifyBtn) verifyBtn.onclick=async()=>{
    const patch={resolutionStatus:'verified', verifiedBy:state.username||'Unknown', verifiedAt:Date.now()};
    Object.assign(f,patch);
    await runGuarded(verifyBtn,'Verifying...',()=>updateFinding(f.siteId,f.id,patch));
    logActivity(f.siteId, 'Resolution verified', `${f.findingNo||''} — ${f.title}`);
    closeModal();render();toast('Finding verified & closed');
  };
  const reopenBtn=document.getElementById('reopenBtn');
  if(reopenBtn) reopenBtn.onclick=async()=>{
    const patch={resolutionStatus:'open', actionPlan:'', 'photos/after':null, resolvedBy:'', resolvedAt:null, verifiedBy:'', verifiedAt:null};
    f.resolutionStatus='open'; f.actionPlan=''; f.photos.after=null;
    f.resolvedBy=''; f.resolvedAt=null; f.verifiedBy=''; f.verifiedAt=null;
    await runGuarded(reopenBtn,'Reopening...',()=>updateFinding(f.siteId,f.id,patch));
    logActivity(f.siteId, 'Finding reopened', `${f.findingNo||''} — ${f.title}`);
    closeModal();render();toast('Finding reopened');
  };
  if(isAdmin){
    document.querySelectorAll('#adminForceStatus [data-fs]').forEach(el=>{
      el.onclick=async()=>{
        const newStatus=el.dataset.fs;
        if(newStatus===f.resolutionStatus) return;
        const patch={resolutionStatus:newStatus};
        if(newStatus==='verified'){ patch.verifiedBy=state.username||'Unknown'; patch.verifiedAt=Date.now(); }
        if(newStatus==='open'){ patch.actionPlan=''; patch['photos/after']=null; patch.resolvedBy=''; patch.resolvedAt=null; patch.verifiedBy=''; patch.verifiedAt=null; }
        Object.assign(f,patch);
        if(patch['photos/after']!==undefined) f.photos.after=null;
        await updateFinding(f.siteId,f.id,patch);
        logActivity(f.siteId, 'Admin override', `Forced ${f.findingNo||''} — ${f.title} to ${newStatus}`);
        closeModal();render();toast(`Status forced to ${newStatus}`);
      };
    });
    const deleteBtn=document.getElementById('deleteFindingBtn');
    if(deleteBtn) deleteBtn.onclick=()=>{
      openConfirmModal(`Archive "${f.title}"? It will be removed from active lists but can be restored later from the Archive.`,async()=>{
        const confirmBtn=document.getElementById('confirmOkBtn');
        await runGuarded(confirmBtn,'Archiving...',()=>archiveFinding(f,state.username));
        logActivity(f.siteId, 'Finding deleted', `${f.findingNo||''} — ${f.title} (archived)`);
        state.findings=state.findings.filter(x=>x.id!==f.id);
        closeModal();render();toast('Finding archived — restorable from Archive');
      },'Archive Finding',true);
    };
  }
  const closeBtn=document.getElementById('findingDetailCloseBtn');
  if(closeBtn) closeBtn.onclick=()=>{ if(cameFrom) cameFrom(); else closeModal(); };
}

export let resolvePhotoData=null;
export function openResolveForm(findingId){ resolvePhotoData=null; renderResolveForm(findingId); }
export function renderResolveForm(findingId){
  const f=state.findings.find(x=>x.id===findingId);
  const planVal=document.getElementById('actionPlanInput')?document.getElementById('actionPlanInput').value:'';
  openModal(`
    <div class="modal-head"><div style="display:flex;align-items:center;gap:8px;"><button class="modal-close" id="resolveBackBtn">${ICONS.chevronL}</button><h3 style="margin:0;">Submit Resolution</h3></div><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div class="field-block"><label class="field-label">Action Plan</label><textarea class="text-input" id="actionPlanInput" rows="3" placeholder="What was done to fix this?">${planVal}</textarea></div>
    <div class="field-block">
      <label class="field-label">Proof Photo (After Repair)</label>
      <div class="upload-choice-row">
        <div class="upload-choice" id="takeResPhotoBtn">${ICONS.camera}Take Photo</div>
        <div class="upload-choice" id="chooseResPhotoBtn">${ICONS.image}Choose from Gallery</div>
      </div>
      <input type="file" id="resFileInputCamera" accept="image/*" capture="environment" style="display:none;">
      <input type="file" id="resFileInputGallery" accept="image/*" style="display:none;">
      <div class="preview-box">${resolvePhotoData?`<img src="${resolvePhotoData}"><button class="preview-remove" id="removeResPreview">${ICONS.x}</button>`:`<div class="empty-preview">${ICONS.image}<span>No photo selected</span></div>`}</div>
    </div>
    <button class="btn-primary" id="submitResolveBtn" style="background:var(--orange-500);">${ICONS.wrench} Submit for Verification</button>
  `);
  const resFileInputCamera=document.getElementById('resFileInputCamera');
  const resFileInputGallery=document.getElementById('resFileInputGallery');
  document.getElementById('takeResPhotoBtn').onclick=()=>resFileInputCamera.click();
  document.getElementById('chooseResPhotoBtn').onclick=()=>resFileInputGallery.click();
  const handleResPhotoFile=(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async(ev)=>{resolvePhotoData=await compressImage(ev.target.result);renderResolveForm(findingId);};
    reader.readAsDataURL(file);
  };
  resFileInputCamera.onchange=handleResPhotoFile;
  resFileInputGallery.onchange=handleResPhotoFile;
  const rm=document.getElementById('removeResPreview');
  if(rm) rm.onclick=(e)=>{e.stopPropagation();resolvePhotoData=null;renderResolveForm(findingId);};

  document.getElementById('submitResolveBtn').onclick=async()=>{
    const plan=document.getElementById('actionPlanInput').value.trim();
    if(!plan){toast('Please describe the action plan');return;}
    if(!resolvePhotoData){toast('Please attach a proof photo');return;}
    const patch={actionPlan:plan, 'photos/after':resolvePhotoData, resolvedBy:state.username||'Unknown', resolvedAt:Date.now(), resolutionStatus:'pending'};
    f.actionPlan=plan; f.photos.after=resolvePhotoData;
    f.resolvedBy=state.username||'Unknown'; f.resolvedAt=Date.now();
    f.resolutionStatus='pending';
    resolvePhotoData=null;
    const btn=document.getElementById('submitResolveBtn');
    await runGuarded(btn,'Submitting...',()=>updateFinding(f.siteId,f.id,patch));
    logActivity(f.siteId, 'Resolution submitted', `${f.findingNo||''} — ${f.title}`);
    closeModal();render();
    toast('Resolution submitted — awaiting auditor verification');
  };
}

