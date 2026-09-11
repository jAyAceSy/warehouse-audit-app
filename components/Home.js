/* ============================================================ HOME (kept for internal navigation only) ============================================================ */
export function greetingWord(){
  const h=new Date().getHours();
  if(h<12) return 'Good Morning';
  if(h<17) return 'Good Afternoon';
  return 'Good Evening';
}
export function statusDotColor(status){
  if(status==='good') return 'var(--green-600)';
  if(status==='issue') return 'var(--red-500)';
  if(status==='warning') return 'var(--orange-500)';
  return 'var(--text-400)';
}
export function statusPillLabel(status){
  if(status==='good') return 'Good';
  if(status==='issue') return 'Critical';
  if(status==='warning') return 'Needs Attention';
  return 'Not Checked';
}

