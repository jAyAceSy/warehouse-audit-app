/* ============================================================ APP ENTRY POINT ============================================================
   This is the only file index.html loads directly (as a module). Its only job is to bootstrap the
   app: initialize Firebase, start listening for auth state, and kick off the first render. All
   actual UI/logic lives in state/, services/, components/, pages/, and layouts/.
============================================================ */
import { state } from './state/store.js';
import { initFirebase, initAuthListener, storageAvailable } from './services/firebase.service.js';
import { render } from './layouts/router.js';
import { toast } from './utils/helpers.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((e) => {
      console.warn('Service worker registration failed (app still works without it):', e);
    });
  });
}

(function init(){
  initFirebase();
  if(!storageAvailable){
    state.authChecking=false;
    render();
    setTimeout(()=>{ toast('Local-only mode — add Firebase config to sync devices'); },400);
    return;
  }
  initAuthListener(); // drives render() itself once auth state (and then role) resolves
  render(); // shows the "Loading…" screen while authChecking is true
})();
