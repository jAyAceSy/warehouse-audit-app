/* ============================================================ WELCOME / ROLE GATE ============================================================ */
import { ICONS } from '../assets/icons.js';
import { state } from '../state/store.js';
import { auth, friendlyFirebaseError } from '../services/firebase.service.js';
import { toast } from '../utils/helpers.js';
import { render } from '../layouts/router.js';

export function renderWelcome(){
  document.getElementById('topbar').style.display='none';
  document.getElementById('bottomNav').style.display='none';
  const content=document.getElementById('content');
  content.style.padding='0';

  const brandHTML=`
    <div class="welcome-brand">
      <div class="welcome-brand-main">
        <div class="welcome-brand-logo">${ICONS.box}</div>
        <h1>Warehouse Audit Findings System</h1>
        <p class="desc">Run daily checklist audits, track findings through resolution, and keep every Site accountable — all synced in real time.</p>
        <div class="welcome-badges">
          <span class="welcome-badge">${ICONS.shield} Compliance Ready</span>
          <span class="welcome-badge">${ICONS.box} Multi-Area</span>
          <span class="welcome-badge">${ICONS.refresh} Real-Time</span>
        </div>
      </div>
      <div class="welcome-brand-footer">© ${new Date().getFullYear()} Warehouse Audit Findings System. All rights reserved.</div>
    </div>`;

  if(state.authChecking){
    content.innerHTML=`<div class="welcome-screen">${brandHTML}<div class="welcome-form-panel"><div class="welcome-card"><h2>Loading…</h2><p class="sub">Checking your session.</p></div></div></div>`;
    return;
  }

  if(state.welcomeStep==='bootstrap'){
    content.innerHTML=`
      <div class="welcome-screen">
        ${brandHTML}
        <div class="welcome-form-panel">
          <div class="welcome-card">
            <h2>First-Time Setup</h2>
            <p class="sub">No administrator account exists yet. Create the first Admin account to get started.</p>
            <div class="form-field"><label for="bsName">Full Name</label><div class="form-input-wrap"><input class="form-input" id="bsName" placeholder="e.g. Juan Dela Cruz"></div></div>
            <div class="form-field"><label for="bsEmail">Email</label><div class="form-input-wrap"><input class="form-input" id="bsEmail" type="email" placeholder="admin@company.com"></div></div>
            <div class="form-field"><label for="bsPw">Password</label><div class="form-input-wrap"><input class="form-input" id="bsPw" type="password" placeholder="At least 6 characters"></div></div>
            <button class="welcome-submit-btn" id="bsSubmitBtn">Create Admin Account</button>
            <button class="welcome-back" id="bsBackBtn">&larr; Back to sign in</button>
            <div class="welcome-auth-note">This only works once, before any admin account exists.</div>
          </div>
        </div>
      </div>`;
    document.getElementById('bsBackBtn').onclick=()=>{ state.welcomeStep='login'; renderWelcome(); };
    const submit=async()=>{
      const name=document.getElementById('bsName').value.trim();
      const email=document.getElementById('bsEmail').value.trim();
      const pw=document.getElementById('bsPw').value;
      if(!name||!email||pw.length<6){ toast('Fill in your name, email, and a password of at least 6 characters'); return; }
      const btn=document.getElementById('bsSubmitBtn'); btn.disabled=true; btn.textContent='Creating...';
      try{
        await bootstrapFirstAdmin(name,email,pw);
        toast('Admin account created — welcome!');
      }catch(e){
        toast(friendlyFirebaseError(e));
        btn.disabled=false; btn.textContent='Create Admin Account';
      }
    };
    document.getElementById('bsSubmitBtn').onclick=submit;
    return;
  }

  if(state.welcomeStep==='forgot'){
    content.innerHTML=`
      <div class="welcome-screen">
        ${brandHTML}
        <div class="welcome-form-panel">
          <div class="welcome-card">
            <h2>Reset Password</h2>
            <p class="sub">Enter your email and we'll send you a reset link.</p>
            <div class="form-field"><label for="frEmail">Email</label><div class="form-input-wrap"><input class="form-input" id="frEmail" type="email" placeholder="you@company.com" value="${state.email||''}"></div></div>
            <button class="welcome-submit-btn" id="frSubmitBtn">Send Reset Link</button>
            <button class="welcome-back" id="frBackBtn">&larr; Back to sign in</button>
          </div>
        </div>
      </div>`;
    document.getElementById('frBackBtn').onclick=()=>{ state.welcomeStep='login'; renderWelcome(); };
    document.getElementById('frSubmitBtn').onclick=async()=>{
      const email=document.getElementById('frEmail').value.trim();
      if(!email){ toast('Enter your email first'); return; }
      await sendPasswordReset(email);
      state.welcomeStep='login'; renderWelcome();
    };
    return;
  }

  // default: 'login'
  content.innerHTML=`
    <div class="welcome-screen">
      ${brandHTML}
      <div class="welcome-form-panel">
        <div class="welcome-card">
          <h2>Welcome Back</h2>
          <p class="sub">Sign in with your work email to access your dashboard.</p>
          <div class="form-field"><label for="loginEmail">Email</label><div class="form-input-wrap"><input class="form-input" id="loginEmail" type="email" placeholder="you@company.com" value="${state.email||''}"></div></div>
          <div class="form-field"><label for="loginPw">Password</label><div class="form-input-wrap"><input class="form-input" id="loginPw" type="password" placeholder="Password"></div></div>
          <div class="remember-row">
            <label class="remember-check"><input type="checkbox" id="rememberMeCheckbox" ${state.rememberMe!==false?'checked':''}><span>Remember me on this device</span></label>
          </div>
          <button class="welcome-submit-btn" id="loginSubmitBtn">Sign In</button>
          <button class="welcome-back" id="forgotPwBtn" style="margin-top:4px;">Forgot password?</button>
          ${state.needsBootstrap ? `<button class="welcome-back" id="bootstrapLink">First time here? Create the admin account</button>` : ''}
          <div class="welcome-auth-note">This system is intended for authorized warehouse personnel only. Accounts are created by your Admin.</div>
        </div>
      </div>
    </div>`;
  const emailInput=document.getElementById('loginEmail');
  const pwInput=document.getElementById('loginPw');
  emailInput.focus();
  document.getElementById('rememberMeCheckbox').onchange=(e)=>{ state.rememberMe=e.target.checked; };
  document.getElementById('forgotPwBtn').onclick=()=>{ state.welcomeStep='forgot'; renderWelcome(); };
  const bsLink=document.getElementById('bootstrapLink');
  if(bsLink) bsLink.onclick=()=>{ state.welcomeStep='bootstrap'; renderWelcome(); };
  const doLogin=async()=>{
    const email=emailInput.value.trim();
    const pw=pwInput.value;
    if(!email||!pw){ toast('Enter your email and password'); return; }
    const btn=document.getElementById('loginSubmitBtn'); btn.disabled=true; btn.textContent='Signing in...';
    try{
      await signInWithEmail(email,pw,state.rememberMe!==false);
      // onAuthStateChanged + subscribeToMyRole take it from here
    }catch(e){
      toast(friendlyFirebaseError(e));
      btn.disabled=false; btn.textContent='Sign In';
    }
  };
  document.getElementById('loginSubmitBtn').onclick=doLogin;
  pwInput.addEventListener('keydown',e=>{if(e.key==='Enter') doLogin();});
}

export function switchUser(){
  if(state.username) logActivity(null, 'Logout', `Signed out (${state.role||''})`);
  state.welcomeStep='login'; state.tab='welcome';
  auth.signOut();
  render();
}

