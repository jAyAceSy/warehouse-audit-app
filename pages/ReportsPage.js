/* ============================================================ REPORTS & SUMMARY TAB ============================================================ */
import { ICONS } from '../assets/icons.js';
import { state } from '../state/store.js';
import { toast, fmtDateMMDDYY, reportFindings, resolutionPillHTML, sevColor } from '../utils/helpers.js';
import { openModal, closeModal, openImageViewer, openConfirmModal } from '../components/Modal.js';
import { render } from '../layouts/router.js';
import { openFindingDetail } from './AuditPage.js';

export let sevChartInstance=null;
export function renderReports(){
  const html = state.reportsTab==='reports' ? reportsListHTML() : summaryHTML();
  document.getElementById('content').innerHTML=`
    <div class="segmented">
      <button class="${state.reportsTab==='reports'?'active':''}" data-rt="reports">Reports</button>
      <button class="${state.reportsTab==='summary'?'active':''}" data-rt="summary">Summary</button>
    </div>
    ${html}
  `;
  document.querySelectorAll('[data-rt]').forEach(b=>b.onclick=()=>{state.reportsTab=b.dataset.rt;render();});
  document.querySelectorAll('.report-card').forEach(c=>{ c.onclick=()=>openReportPreview(parseInt(c.dataset.report)); });
  const exportPdfBtn=document.getElementById('exportPdfBtn'); if(exportPdfBtn) exportPdfBtn.onclick=()=>exportReportPDF();
  const exportXlsxBtn=document.getElementById('exportXlsxBtn'); if(exportXlsxBtn) exportXlsxBtn.onclick=()=>exportReportCSV();
  const exportDateSelect=document.getElementById('exportDateSelect'); if(exportDateSelect) exportDateSelect.onchange=(e)=>{state.exportDateFilter=e.target.value;};
  const exportSiteSelect=document.getElementById('exportSiteSelect'); if(exportSiteSelect) exportSiteSelect.onchange=(e)=>{state.exportSiteFilter=e.target.value;};
  const exportStatusSelect=document.getElementById('exportStatusSelect'); if(exportStatusSelect) exportStatusSelect.onchange=(e)=>{state.exportStatusFilter=e.target.value;};
  const exportAuditorSelect=document.getElementById('exportAuditorSelect'); if(exportAuditorSelect) exportAuditorSelect.onchange=(e)=>{state.exportAuditorFilter=e.target.value;};

  if(state.reportsTab==='summary' && state.findings.length>0){
    const high=state.findings.filter(f=>f.severity==='High').length;
    const medium=state.findings.filter(f=>f.severity==='Medium').length;
    const low=state.findings.filter(f=>f.severity==='Low').length;
    const ctx=document.getElementById('sevDonut');
    if(ctx){
      if(sevChartInstance) sevChartInstance.destroy();
      sevChartInstance=new Chart(ctx,{type:'doughnut',data:{labels:['High','Medium','Low'],datasets:[{data:[high,medium,low],backgroundColor:['#E0453F','#EF8B3B','#EFB223'],borderWidth:0,cutout:'72%'}]},options:{plugins:{legend:{display:false},tooltip:{enabled:false}},responsive:true,maintainAspectRatio:false}});
    }
  }
}
export function reportsListHTML(){
  return `
  <div class="filter-row" id="dateFilterRow"><span>${state.reportsFilter}</span>${ICONS.calendar}</div>
  <div class="section-head" style="margin-top:0;"><h2>Audit Reports</h2></div>
  ${state.reports.length===0 ? `<div class="card"><div class="empty-mini" style="padding:16px 0;">No reports yet — complete a daily audit and tap "Submit Audit" on the Daily Audit tab to generate one.</div></div>` : state.reports.map(r=>`
    <div class="card report-card" data-report="${r.id}">
      <div class="report-icon">${ICONS.clipboard}</div>
      <div style="flex:1;"><div class="report-date">${r.date}</div><div class="report-sub">${(state.sites[r.siteId]||{}).name||'Unknown Site'} · ${r.floor} · ${r.completedItems}/${r.totalItems} areas checked · ${r.findingsCount} findings</div></div>
      <div class="chevron">${ICONS.chevronR}</div>
    </div>`).join('')}
  `;
}
export function openReportPreview(reportId){
  const r=state.reports.find(x=>x.id===reportId);
  if(!r) return;
  const findings=reportFindings(r);
  const siteName=(state.sites[r.siteId]||{}).name||'Unknown Site';
  openModal(`
    <div class="modal-head"><h3>Audit Report</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${r.date} — Submitted by: ${r.submittedBy||'Unknown'}</div>
    <div style="font-size:13px;color:var(--text-600);font-weight:600;margin-bottom:16px;">Site: <u>${siteName}</u> · Area: <u>${r.floor}</u></div>
    <div class="card-title">Audit Findings</div>
    ${findings.length===0 ? `<div class="empty-mini" style="padding:16px 0;">No findings logged in this audit</div>` : findings.map(f=>`
      <div class="card" style="cursor:pointer;border-left:4px solid ${sevColor(f.severity)};" data-finding="${f.id}">
        <div style="font-size:11px;color:var(--text-400);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px;">${f.area}</div>
        <div class="row-between" style="margin-bottom:8px;"><div style="font-weight:700;font-size:14.5px;">${f.title}</div><div class="sev-chip sev-${f.severity}">${f.severity}</div></div>
        ${f.photos.before?`<img class="res-photo-thumb" src="${f.photos.before}" style="margin-top:0;margin-bottom:10px;cursor:zoom-in;" onclick="event.stopPropagation();openImageViewer('${f.photos.before.replace(/'/g,"\\'")}')">`:''}
        ${f.description?`<div style="font-size:12.5px;color:var(--text-900);margin-bottom:10px;line-height:1.4;">${f.description}</div>`:''}
        <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:2px;">
          <div style="font-size:11px;color:var(--green-600);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">Resolution — ${resolutionPillHTML(f)}</div>
          ${f.actionPlan ? `<div style="font-size:12.5px;color:var(--text-900);margin-bottom:8px;line-height:1.4;"><strong>Action Plan:</strong> ${f.actionPlan}</div>` : `<div class="empty-mini" style="padding:0;text-align:left;">No action plan submitted yet</div>`}
          ${f.photos.after?`<img class="res-photo-thumb" src="${f.photos.after}" style="cursor:zoom-in;" onclick="event.stopPropagation();openImageViewer('${f.photos.after.replace(/'/g,"\\'")}')">`:''}
        </div>
      </div>`).join('')}
    ${state.role==='admin' ? `<button class="btn-danger" id="deleteReportBtn" style="margin-top:10px;">${ICONS.trash} Archive Report</button>` : ''}
    <button class="btn-secondary" style="width:100%;margin-top:6px;" onclick="closeModal()">Close</button>
  `);
  document.querySelectorAll('#modalSheet [data-finding]').forEach(el=>{ el.onclick=()=>openFindingDetail(parseInt(el.dataset.finding),()=>openReportPreview(r.id)); });
  const deleteReportBtn=document.getElementById('deleteReportBtn');
  if(deleteReportBtn) deleteReportBtn.onclick=()=>{
    openConfirmModal(`Archive the ${r.date} — ${siteName} / ${r.floor} report? It can be restored later from the Archive.`,async()=>{
      const confirmBtn=document.getElementById('confirmOkBtn');
      await runGuarded(confirmBtn,'Archiving...',()=>archiveReport(r,state.username));
      logActivity(r.siteId, 'Report deleted', `${r.date} — ${r.floor} (archived)`);
      closeModal();render();toast('Report archived — restorable from Archive');
    },'Archive Report',true);
  };
}
export function summaryHTML(){
  const total=state.findings.length;
  const open=state.findings.filter(f=>f.resolutionStatus!=='verified').length;
  const closed=state.findings.filter(f=>f.resolutionStatus==='verified').length;
  const high=state.findings.filter(f=>f.severity==='High').length;
  const medium=state.findings.filter(f=>f.severity==='Medium').length;
  const low=state.findings.filter(f=>f.severity==='Low').length;
  const pct=(n)=>total?Math.round((n/total)*100):0;
  const siteEntries=Object.entries(state.sites);
  return `
  <div class="filter-row"><span>${state.reportsFilter}</span>${ICONS.calendar}</div>
  <div class="card"><div class="card-title" style="text-transform:none;font-size:13px;">Findings Summary</div>
    <div class="stat-grid-3"><div><div class="num">${total}</div><div class="lbl">Total Findings</div></div><div><div class="num" style="color:var(--red-500);">${open}</div><div class="lbl">Open</div></div><div><div class="num" style="color:var(--green-600);">${closed}</div><div class="lbl">Closed</div></div></div>
  </div>
  <div class="card"><div class="card-title" style="text-transform:none;font-size:13px;">Findings by Severity</div>
    ${total===0 ? `<div class="empty-mini" style="padding:6px 0;">No findings recorded yet</div>` : `
    <div class="donut-wrap"><div class="donut-canvas-box"><canvas id="sevDonut"></canvas><div class="donut-center"><div class="n">${total}</div><div class="l">Total</div></div></div>
      <div style="flex:1;">
        <div class="sev-legend-row"><span class="sev-dot" style="width:9px;height:9px;background:var(--red-500);"></span>High<span class="pct">${high} (${pct(high)}%)</span></div>
        <div class="sev-legend-row"><span class="sev-dot" style="width:9px;height:9px;background:var(--orange-500);"></span>Medium<span class="pct">${medium} (${pct(medium)}%)</span></div>
        <div class="sev-legend-row"><span class="sev-dot" style="width:9px;height:9px;background:var(--amber-400);"></span>Low<span class="pct">${low} (${pct(low)}%)</span></div>
      </div></div>`}
  </div>
  <div class="card"><div class="card-title" style="text-transform:none;font-size:13px;">Export Report</div>
    <div style="font-size:12px;color:var(--text-600);font-weight:600;margin-bottom:8px;">Filter what gets exported (optional)</div>
    <div style="display:flex;gap:10px;margin-bottom:14px;">
      <select class="select-input" id="exportDateSelect" style="flex:1;">
        <option value="all" ${state.exportDateFilter==='all'?'selected':''}>All Dates</option>
        ${[...new Set(state.reports.map(r=>r.date))].map(d=>`<option value="${d}" ${state.exportDateFilter===d?'selected':''}>${d}</option>`).join('')}
      </select>
      <select class="select-input" id="exportSiteSelect" style="flex:1;">
        <option value="all" ${state.exportSiteFilter==='all'?'selected':''}>All Sites</option>
        ${siteEntries.map(([id,s])=>`<option value="${id}" ${state.exportSiteFilter===id?'selected':''}>${s.name}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px;">
      <select class="select-input" id="exportStatusSelect" style="flex:1;">
        <option value="all" ${state.exportStatusFilter==='all'?'selected':''}>All Statuses</option>
        <option value="open" ${state.exportStatusFilter==='open'?'selected':''}>Open</option>
        <option value="pending" ${state.exportStatusFilter==='pending'?'selected':''}>Pending Verification</option>
        <option value="verified" ${state.exportStatusFilter==='verified'?'selected':''}>Verified</option>
      </select>
      <select class="select-input" id="exportAuditorSelect" style="flex:1;">
        <option value="all" ${state.exportAuditorFilter==='all'?'selected':''}>All Auditors</option>
        ${[...new Set(state.reports.map(r=>r.submittedBy))].map(a=>`<option value="${a}" ${state.exportAuditorFilter===a?'selected':''}>${a}</option>`).join('')}
      </select>
    </div>
    <div class="export-row"><button class="export-btn export-pdf" id="exportPdfBtn">${ICONS.pdf} Export as PDF</button><button class="export-btn export-xlsx" id="exportXlsxBtn">${ICONS.xlsx} Export as Excel</button></div>
  </div>
  `;
}

/* ---------- Exports ---------- */
export function getFilteredReports(){
  return state.reports.filter(r=>
    (state.exportDateFilter==='all' || r.date===state.exportDateFilter) &&
    (state.exportSiteFilter==='all' || r.siteId===state.exportSiteFilter) &&
    (state.exportAuditorFilter==='all' || r.submittedBy===state.exportAuditorFilter)
  );
}
export function getFilteredReportFindings(r){
  const findings=reportFindings(r);
  if(state.exportStatusFilter==='all') return findings;
  return findings.filter(f=>f.resolutionStatus===state.exportStatusFilter);
}
export function exportFileSuffix(){
  const d=state.exportDateFilter==='all' ? '' : `_${state.exportDateFilter.replace(/[, ]+/g,'-')}`;
  const siteName=state.exportSiteFilter==='all' ? '' : (state.sites[state.exportSiteFilter]||{}).name||'';
  const f=siteName ? `_${siteName.replace(/\s+/g,'-')}` : '';
  const s=state.exportStatusFilter==='all' ? '' : `_${state.exportStatusFilter}`;
  const a=state.exportAuditorFilter==='all' ? '' : `_${state.exportAuditorFilter.replace(/\s+/g,'-')}`;
  return d+f+s+a;
}
export function hasExportableData(){ return getFilteredReports().length>0; }
export function exportReportCSV(){
  if(!hasExportableData()){toast('No reports match that filter');return;}
  let csv='Site,Date,Submitted By,Area,Sub-Area,Checklist Item,Description,Image,Resolution,Action Plan,Image\n';
  getFilteredReports().forEach(r=>{
    const dateStr=fmtDateMMDDYY(r.date);
    const submitter=r.submittedBy||'Unknown';
    const siteName=(state.sites[r.siteId]||{}).name||'Unknown Site';
    const findings=getFilteredReportFindings(r);
    if(findings.length===0){
      csv+=`"${siteName}","${dateStr}","${submitter}","${r.floor}","No findings logged in this audit",,,,,,\n`;
    }else{
      findings.forEach(f=>{
        const desc=(f.description||'').replace(/"/g,'""');
        const plan=(f.actionPlan||'').replace(/"/g,'""');
        const resLabel=f.resolutionStatus==='verified'?'Verified':f.resolutionStatus==='pending'?'Pending Verification':'Open';
        const img1=f.photos.before?'Photo attached':'No photo';
        const img2=f.photos.after?'Photo attached':'No photo';
        csv+=`"${siteName}","${dateStr}","${submitter}","${r.floor}","${f.area}","${f.title}","${desc}",${img1},${resLabel},"${plan}",${img2}\n`;
      });
    }
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`warehouse-audit-report${exportFileSuffix()}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logActivity(null, 'Report exported', `CSV export${exportFileSuffix()||' (all)'}`);
  toast('Excel (CSV) file downloaded');
}
export function detectImgFormat(dataUrl){
  if(!dataUrl) return null;
  const m=dataUrl.match(/^data:image\/(\w+);/);
  if(!m) return null;
  const type=m[1].toLowerCase();
  if(type==='jpeg'||type==='jpg') return 'JPEG';
  if(type==='png') return 'PNG';
  if(type==='webp') return 'WEBP';
  return null;
}
export function exportReportPDF(){
  if(!hasExportableData()){toast('No reports match that filter');return;}
  if(!window.jspdf){toast('PDF library failed to load');return;}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'landscape'});
  const pageH=doc.internal.pageSize.getHeight();
  const marginX=10;
  // 0 Site | 1 Date | 2 Submitted By | 3 Area | 4 Sub-Area | 5 Checklist Item | 6 Description | 7 Image || 8 Resolution | 9 Action Plan | 10 Image
  const colW=[20,14,22,18,22,24,45,16, 16,32,16];
  const colX=[marginX];
  for(let i=0;i<colW.length-1;i++) colX.push(colX[i]+colW[i]);
  const tableW=colW.reduce((a,b)=>a+b,0);
  const orangeSpan=colW.slice(0,8).reduce((a,b)=>a+b,0);
  const greenSpan=colW.slice(8).reduce((a,b)=>a+b,0);

  function drawTableHeader(y){
    doc.setFillColor(239,139,59);
    doc.rect(colX[0],y,orangeSpan,6,'F');
    doc.setFillColor(29,154,98);
    doc.rect(colX[8],y,greenSpan,6,'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text('Audit Findings',colX[0]+2,y+4.2);
    doc.text('Resolution',colX[8]+2,y+4.2);
    y+=6;
    const heads=['Site','Date','Submitted By','Area','Sub-Area','Checklist Item','Description','Image','Resolution','Action Plan','Image'];
    doc.setFillColor(253,238,224); doc.rect(colX[0],y,orangeSpan,6,'F');
    doc.setFillColor(228,246,237); doc.rect(colX[8],y,greenSpan,6,'F');
    doc.setTextColor(20,24,43); doc.setFont('helvetica','bold'); doc.setFontSize(7);
    heads.forEach((h,i)=>doc.text(h,colX[i]+2,y+4.2));
    return y+6;
  }

  // Flatten every filtered report into one continuous list of rows (a placeholder row for audits with zero findings)
  const rows=[];
  getFilteredReports().forEach(r=>{
    const findings=getFilteredReportFindings(r);
    if(findings.length===0) rows.push({r,f:null});
    else findings.forEach(f=>rows.push({r,f}));
  });

  let y=14;
  doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(15,27,51);
  doc.text('Warehouse Audit Findings Report',marginX,y); y+=7;
  y=drawTableHeader(y);

  rows.forEach(({r,f})=>{
    const dateStr=fmtDateMMDDYY(r.date);
    const siteName=(state.sites[r.siteId]||{}).name||'Unknown';
    if(!f){
      const rowH=8;
      if(y+rowH>pageH-12){ doc.addPage(); y=14; y=drawTableHeader(y); }
      doc.setDrawColor(225,230,240); doc.rect(colX[0],y,tableW,rowH);
      for(let i=1;i<colX.length;i++) doc.line(colX[i],y,colX[i],y+rowH);
      doc.setTextColor(18,24,43);doc.setFont('helvetica','normal');doc.setFontSize(6.5);
      doc.text(siteName,colX[0]+2,y+5,{maxWidth:colW[0]-4});
      doc.text(dateStr,colX[1]+2,y+5);
      doc.text(r.submittedBy||'Unknown',colX[2]+2,y+5,{maxWidth:colW[2]-4});
      doc.text(r.floor,colX[3]+2,y+5,{maxWidth:colW[3]-4});
      doc.setTextColor(90,100,120);
      doc.text('No findings logged in this audit',colX[4]+2,y+5,{maxWidth:colW[4]+colW[5]+colW[6]-4});
      y+=rowH;
      return;
    }
    doc.setFont('helvetica','normal').setFontSize(6.5);
    const descLines=doc.splitTextToSize(f.description||'—',colW[6]-4);
    const planLines=doc.splitTextToSize(f.actionPlan||'—',colW[9]-4);
    const titleLines=doc.splitTextToSize(f.title,colW[5]-4);
    const areaLines=doc.splitTextToSize(f.area,colW[4]-4);
    const maxLines=Math.max(descLines.length,planLines.length,titleLines.length,areaLines.length,1);
    const rowH=Math.max(maxLines*3.2+4,18);
    if(y+rowH>pageH-12){ doc.addPage(); y=14; y=drawTableHeader(y); }
    doc.setDrawColor(225,230,240); doc.rect(colX[0],y,tableW,rowH);
    for(let i=1;i<colX.length;i++) doc.line(colX[i],y,colX[i],y+rowH);
    doc.setTextColor(18,24,43);doc.setFont('helvetica','normal');doc.setFontSize(6.5);
    doc.text(siteName,colX[0]+2,y+4.5,{maxWidth:colW[0]-4});
    doc.text(dateStr,colX[1]+2,y+4.5);
    doc.text(r.submittedBy||'Unknown',colX[2]+2,y+4.5,{maxWidth:colW[2]-4});
    doc.text(r.floor,colX[3]+2,y+4.5,{maxWidth:colW[3]-4});
    doc.text(areaLines,colX[4]+2,y+4.5);
    doc.text(titleLines,colX[5]+2,y+4.5);
    doc.text(descLines,colX[6]+2,y+4.5);
    const fmt1=detectImgFormat(f.photos.before);
    if(fmt1){ try{ doc.addImage(f.photos.before,fmt1,colX[7]+2,y+2,colW[7]-4,Math.min(rowH-4,16)); } catch(e){ doc.text('Photo attached',colX[7]+2,y+4.5,{maxWidth:colW[7]-4}); } }
    else doc.text('No photo',colX[7]+2,y+4.5);
    const resLabel=f.resolutionStatus==='verified'?'Verified':f.resolutionStatus==='pending'?'Pending':'Open';
    doc.text(resLabel,colX[8]+2,y+4.5);
    doc.text(planLines,colX[9]+2,y+4.5);
    const fmt2=detectImgFormat(f.photos.after);
    if(fmt2){ try{ doc.addImage(f.photos.after,fmt2,colX[10]+2,y+2,colW[10]-4,Math.min(rowH-4,16)); } catch(e){ doc.text('Photo attached',colX[10]+2,y+4.5,{maxWidth:colW[10]-4}); } }
    else doc.text('No photo',colX[10]+2,y+4.5);
    y+=rowH;
  });
  doc.save(`warehouse-audit-report${exportFileSuffix()}.pdf`);
  logActivity(null, 'Report exported', `PDF export${exportFileSuffix()||' (all)'}`);
  toast('PDF downloaded');
}

