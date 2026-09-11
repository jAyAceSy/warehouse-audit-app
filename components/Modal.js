/* ============================================================ MODAL SYSTEM ============================================================ */
import { ICONS } from '../assets/icons.js';

export function openModal(html){
  document.getElementById('modalSheet').innerHTML=html;
  document.getElementById('modalOverlay').classList.add('open');
}
export function closeModal(){document.getElementById('modalOverlay').classList.remove('open');}
export function openImageViewer(src){
  if(!src) return;
  const v=document.createElement('div');
  v.style.cssText='position:fixed;inset:0;background:rgba(10,15,30,.92);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;';
  v.innerHTML=`<img src="${src}" style="max-width:100%;max-height:100%;border-radius:10px;object-fit:contain;">
    <button style="position:absolute;top:18px;right:18px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.15);border:none;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;">${ICONS.x}</button>`;
  v.onclick=()=>v.remove();
  document.body.appendChild(v);
}
document.getElementById('modalOverlay').addEventListener('click',(e)=>{ if(e.target.id==='modalOverlay') closeModal(); });
export function openConfirmModal(message,onConfirm,confirmLabel,danger){
  openModal(`
    <div class="modal-head"><h3>Confirm</h3><button class="modal-close" onclick="closeModal()">${ICONS.x}</button></div>
    <div style="font-size:13.5px;color:var(--text-900);font-weight:600;line-height:1.5;margin-bottom:18px;">${message}</div>
    <div style="display:flex;gap:10px;">
      <button class="btn-secondary" id="confirmCancelBtn">Cancel</button>
      <button class="btn-primary" id="confirmOkBtn" style="flex:1;background:${danger?'var(--red-500)':'var(--green-600)'};">${confirmLabel||'Confirm'}</button>
    </div>
  `);
  document.getElementById('confirmCancelBtn').onclick=()=>closeModal();
  document.getElementById('confirmOkBtn').onclick=onConfirm;
}

