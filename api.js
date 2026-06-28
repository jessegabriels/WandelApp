/* api.js — verbinding met de zelf-gehoste backend + inlog/registratie.
   De server serveert deze app zelf, dus de API zit op dezelfde oorsprong
   (relatieve paden). Token en gebruiker worden in localStorage bewaard,
   zodat je na één keer inloggen ook offline verder kan. */

'use strict';

const TOKEN_KEY = 'wa_token', USER_KEY = 'wa_user';

function getToken(){ try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function getUser(){ try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
function setSession(token, user){
  try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch {}
}
function clearSession(){ try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch {} }

/* Generieke fetch-helper. opts: { method, body (object→JSON), form (FormData), auth } */
async function api(path, opts = {}){
  const headers = {};
  const token = getToken();
  if (opts.auth !== false && token) headers['Authorization'] = 'Bearer ' + token;
  let body;
  if (opts.form) { body = opts.form; }
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  let res;
  try {
    res = await fetch(path, { method: opts.method || (body ? 'POST' : 'GET'), headers, body });
  } catch (e) {
    throw new Error('Geen verbinding met de server');
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    if (res.status === 401) { clearSession(); }
    throw new Error((data && data.error) || ('Serverfout (' + res.status + ')'));
  }
  return data;
}

/* ---------- Auth ---------- */
const Auth = {
  _onAuthed: null,

  getToken, getUser,
  isAuthed(){ return !!getToken(); },

  async login(username, password){
    const r = await api('/api/login', { auth: false, body: { username, password } });
    setSession(r.token, r.user);
    return r.user;
  },
  async register(username, display_name, password, invite_code){
    const r = await api('/api/register', { auth: false, body: { username, display_name, password, invite_code } });
    setSession(r.token, r.user);
    return r.user;
  },
  logout(){ clearSession(); location.reload(); },
  setUser(u){ try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch {} },

  /* Wire het inlogscherm en bepaal of we moeten inloggen. onAuthed() draait
     zodra er een geldige sessie is (bij laden of na inloggen). */
  init(onAuthed){
    this._onAuthed = onAuthed;
    wireAuthScreen();
    if (this.isAuthed()) { hideAuthScreen(); if (onAuthed) onAuthed(); }
    else showAuthScreen();
  },
  showLogin: showAuthScreen
};

let authMode = 'login';
function $a(id){ return document.getElementById(id); }

function setAuthMode(mode){
  authMode = mode;
  const reg = mode === 'register';
  $a('auth-tab-login').classList.toggle('active', !reg);
  $a('auth-tab-register').classList.toggle('active', reg);
  $a('auth-display').hidden = !reg;
  $a('auth-invite').hidden = !reg;
  $a('auth-submit').textContent = reg ? 'Account aanmaken' : 'Inloggen';
  $a('auth-password').autocomplete = reg ? 'new-password' : 'current-password';
  hideAuthError();
}
function showAuthError(msg){ const el = $a('auth-error'); el.textContent = msg; el.hidden = false; }
function hideAuthError(){ $a('auth-error').hidden = true; }
function showAuthScreen(){ const s = $a('auth-screen'); if (s) s.hidden = false; }
function hideAuthScreen(){ const s = $a('auth-screen'); if (s) s.hidden = true; }

function wireAuthScreen(){
  if (!$a('auth-screen')) return;
  $a('auth-tab-login').addEventListener('click', () => setAuthMode('login'));
  $a('auth-tab-register').addEventListener('click', () => setAuthMode('register'));
  $a('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError();
    const u = $a('auth-username').value.trim();
    const p = $a('auth-password').value;
    if (!u || !p) { showAuthError('Vul gebruikersnaam en wachtwoord in.'); return; }
    const submit = $a('auth-submit');
    submit.disabled = true;
    const original = submit.textContent;
    submit.textContent = 'Even geduld…';
    try {
      if (authMode === 'register') {
        await Auth.register(u, $a('auth-display').value.trim() || u, p, $a('auth-invite').value.trim());
      } else {
        await Auth.login(u, p);
      }
      hideAuthScreen();
      if (Auth._onAuthed) Auth._onAuthed();
    } catch (err) {
      showAuthError(err.message || 'Aanmelden mislukt');
    } finally {
      submit.disabled = false;
      submit.textContent = original;
    }
  });
  setAuthMode('login');
}

window.api = api;
window.Auth = Auth;
