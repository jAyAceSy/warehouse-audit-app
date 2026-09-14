/* ============================================================ ON-SCREEN DEBUG PANEL ============================================================
   Temporary diagnostic tool. Loads as a plain classic script BEFORE everything else in index.html,
   so it can catch errors even if a later script fails to load entirely. Captures:
     - every console.error / console.warn call (including ones from friendlyFirebaseError)
     - uncaught JS errors (window 'error' event)
     - unhandled promise rejections (window 'unhandledrejection' event)
   Shows a small floating button (bottom-right) with a badge count. Tap it to open a scrollable
   log panel with a Copy button, so the full error text can be pasted elsewhere without needing a
   PC or USB debugging.

   Safe to remove later: delete this file and its <script> tag from index.html, nothing else
   depends on it.
============================================================ */
(function(){
  var log = [];
  var panelOpen = false;

  function ts(){
    var d = new Date();
    return d.toTimeString().slice(0,8);
  }

  function record(level, args){
    var text;
    try{
      text = Array.prototype.map.call(args, function(a){
        if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack : '');
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch(e){ return String(a); } }
        return String(a);
      }).join(' ');
    }catch(e){ text = '[unloggable]'; }
    log.push('[' + ts() + '] ' + level.toUpperCase() + ': ' + text);
    if (log.length > 200) log.shift(); // cap memory use
    updateBadge();
    if (panelOpen) renderPanel();
  }

  var origError = console.error.bind(console);
  console.error = function(){ record('error', arguments); origError.apply(console, arguments); };
  var origWarn = console.warn.bind(console);
  console.warn = function(){ record('warn', arguments); origWarn.apply(console, arguments); };

  window.addEventListener('error', function(e){
    record('error', ['Uncaught: ' + e.message + ' (' + e.filename + ':' + e.lineno + ')']);
  });
  window.addEventListener('unhandledrejection', function(e){
    var reason = e.reason;
    record('error', ['Unhandled promise rejection: ' + (reason && reason.message ? reason.message : reason)]);
  });

  function badgeCount(){
    return log.filter(function(l){ return l.indexOf('] ERROR:') !== -1; }).length;
  }

  var btn, panel, badge;

  function ensureUI(){
    if (btn) return;
    btn = document.createElement('div');
    btn.textContent = '🐞';
    btn.setAttribute('style',
      'position:fixed;bottom:14px;right:14px;width:40px;height:40px;border-radius:50%;' +
      'background:#0F1B33;color:#fff;display:flex;align-items:center;justify-content:center;' +
      'font-size:18px;z-index:999999;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer;opacity:0.55;');
    badge = document.createElement('div');
    badge.setAttribute('style',
      'position:absolute;top:-4px;right:-4px;background:#E0453F;color:#fff;border-radius:10px;' +
      'min-width:16px;height:16px;font-size:10px;line-height:16px;text-align:center;padding:0 3px;display:none;');
    btn.appendChild(badge);
    btn.addEventListener('click', function(){ panelOpen ? closePanel() : openPanel(); });
    document.body.appendChild(btn);
  }

  function updateBadge(){
    ensureUI();
    var n = badgeCount();
    if (n > 0){ badge.style.display='block'; badge.textContent = n>99?'99+':String(n); btn.style.opacity='0.95'; }
  }

  function openPanel(){
    ensureUI();
    panelOpen = true;
    panel = document.createElement('div');
    panel.setAttribute('style',
      'position:fixed;left:8px;right:8px;bottom:64px;top:auto;max-height:60vh;background:#12182B;' +
      'color:#D7DEEC;font-family:monospace;font-size:11px;line-height:1.5;border-radius:10px;' +
      'z-index:999998;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,.4);overflow:hidden;');

    var header = document.createElement('div');
    header.setAttribute('style','display:flex;gap:8px;padding:8px 10px;background:#1B3568;align-items:center;');
    header.innerHTML =
      '<strong style="flex:1;color:#fff;font-family:sans-serif;font-size:12px;">Debug Log</strong>' +
      '<button id="__dbgCopy" style="font-size:11px;padding:4px 8px;border-radius:6px;border:none;background:#2F5FE0;color:#fff;">Copy</button>' +
      '<button id="__dbgClear" style="font-size:11px;padding:4px 8px;border-radius:6px;border:none;background:#5B6478;color:#fff;">Clear</button>' +
      '<button id="__dbgClose" style="font-size:11px;padding:4px 8px;border-radius:6px;border:none;background:#E0453F;color:#fff;">Close</button>';
    panel.appendChild(header);

    var body = document.createElement('div');
    body.id = '__dbgBody';
    body.setAttribute('style','flex:1;overflow-y:auto;padding:8px 10px;white-space:pre-wrap;word-break:break-word;');
    panel.appendChild(body);

    document.body.appendChild(panel);

    document.getElementById('__dbgCopy').onclick = function(){
      var text = log.join('\n') || '(no log entries yet)';
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){
          this.textContent = 'Copied!';
          setTimeout(function(){ document.getElementById('__dbgCopy').textContent='Copy'; }, 1200);
        }.bind(this));
      } else {
        // Fallback for older browsers: select the text so the user can manually copy
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch(e){}
        document.body.removeChild(ta);
      }
    };
    document.getElementById('__dbgClear').onclick = function(){ log = []; updateBadge(); renderPanel(); };
    document.getElementById('__dbgClose').onclick = closePanel;

    renderPanel();
  }

  function renderPanel(){
    if (!panelOpen) return;
    var body = document.getElementById('__dbgBody');
    if (!body) return;
    body.textContent = log.length ? log.join('\n\n') : '(no errors logged yet — try the action that fails, this panel will fill in live)';
    body.scrollTop = body.scrollHeight;
  }

  function closePanel(){
    panelOpen = false;
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ensureUI);
  } else {
    ensureUI();
  }

  record('warn', ['Debug panel active — tap the 🐞 button (bottom-right) any time to view the log.']);
})();
