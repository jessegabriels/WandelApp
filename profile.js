/* profile.js — profielpagina: weergavenaam, eigen kleur, wachtwoord wijzigen,
   en optioneel een routerings-API-sleutel (OpenRouteService) voor pad-snapping.
   Hergebruikt het detail-overlay (#detail). */

'use strict';

const Profile = {
  open(){
    if (!(window.Auth && Auth.isAuthed())) { if (window.toast) toast('Eerst inloggen'); return; }
    const u = Auth.getUser() || {};
    const orsKey = (function(){ try { return localStorage.getItem('wa_ors_key') || ''; } catch { return ''; } })();
    const inp = 'style="width:100%;font-size:16px;padding:10px;border:1px solid #cdd6cd;border-radius:10px"';
    const body = document.getElementById('detail-body');
    body.innerHTML = `
      <h2 style="margin:6px 40px 12px 0">Profiel</h2>
      <div class="field"><label>Weergavenaam</label>
        <input id="pf-name" type="text" value="${escAttr(u.display_name || '')}" ${inp} /></div>
      <div class="field"><label>Mijn kleur (voor pins en routes)</label>
        <div class="profile-color"><input id="pf-color" type="color" value="${u.color || '#2e7d32'}" />
        <span class="hint">Zo zien je vrienden welke pins en routes van jou zijn.</span></div></div>
      <p id="pf-msg" class="auth-error" hidden></p>
      <div class="btnrow"><button class="primary" id="pf-save">Profiel opslaan</button></div>

      <hr class="profile-sep" />
      <h3 style="font-size:15px;margin:0 0 8px">Meldingen</h3>
      <p class="hint" style="margin-bottom:8px">Krijg een melding wanneer iemand een nieuw event plant, zodat je kunt doorgeven of je meegaat.</p>
      <div class="btnrow"><button id="pf-notif">Meldingen aanzetten</button></div>
      <p id="pf-notif-msg" class="hint" style="margin-top:6px"></p>

      <hr class="profile-sep" />
      <h3 style="font-size:15px;margin:0 0 8px">Wachtwoord wijzigen</h3>
      <div class="field"><label>Huidig wachtwoord</label><input id="pf-cur" type="password" ${inp} /></div>
      <div class="field"><label>Nieuw wachtwoord (min. 6 tekens)</label><input id="pf-new" type="password" ${inp} /></div>
      <p id="pf-pwmsg" class="auth-error" hidden></p>
      <div class="btnrow"><button class="primary" id="pf-pw">Wachtwoord wijzigen</button></div>

      <hr class="profile-sep" />
      <h3 style="font-size:15px;margin:0 0 8px">Routes op wandelpaden (optioneel)</h3>
      <p class="hint" style="margin-bottom:8px">Standaard teken je routes met rechte lijnen tussen je punten. Wil je dat ze echte wandelpaden volgen? Maak een gratis sleutel aan op openrouteservice.org en plak die hieronder.</p>
      <div class="field"><input id="pf-ors" type="text" value="${escAttr(orsKey)}" placeholder="OpenRouteService API-sleutel (optioneel)" ${inp} /></div>
      <div class="btnrow"><button id="pf-ors-save">Sleutel bewaren</button></div>`;
    document.getElementById('detail').hidden = false;

    document.getElementById('pf-save').addEventListener('click', async () => {
      try {
        const r = await api('/api/me', { method: 'PUT', body: {
          display_name: document.getElementById('pf-name').value.trim(),
          color: document.getElementById('pf-color').value
        }});
        Auth.setUser(r.user);
        const un = document.getElementById('user-name'); if (un) un.textContent = r.user.display_name;
        pfMsg('pf-msg', 'Opgeslagen', false);
        if (window.renderOverview) renderOverview();
      } catch (e) { pfMsg('pf-msg', e.message || 'Opslaan mislukt', true); }
    });

    document.getElementById('pf-pw').addEventListener('click', async () => {
      try {
        await api('/api/me/password', { method: 'PUT', body: {
          current: document.getElementById('pf-cur').value,
          new: document.getElementById('pf-new').value
        }});
        pfMsg('pf-pwmsg', 'Wachtwoord gewijzigd', false);
        document.getElementById('pf-cur').value = '';
        document.getElementById('pf-new').value = '';
      } catch (e) { pfMsg('pf-pwmsg', e.message || 'Wijzigen mislukt', true); }
    });

    document.getElementById('pf-ors-save').addEventListener('click', () => {
      try { localStorage.setItem('wa_ors_key', document.getElementById('pf-ors').value.trim()); } catch {}
      if (window.toast) toast('Sleutel bewaard');
    });

    // Meldingen aan/uit
    (async () => {
      const btn = document.getElementById('pf-notif');
      const msg = document.getElementById('pf-notif-msg');
      if (!btn) return;
      async function refresh(){
        const st = window.Push ? await Push.status() : 'unsupported';
        btn.disabled = (st === 'unsupported' || st === 'denied');
        if (st === 'unsupported') { btn.textContent = 'Niet ondersteund'; msg.textContent = 'Meldingen worden hier niet ondersteund. Op iPhone: installeer de app eerst op je beginscherm.'; }
        else if (st === 'denied') { btn.textContent = 'Geblokkeerd'; msg.textContent = 'Meldingen zijn geblokkeerd. Sta ze toe in je browser-/systeeminstellingen.'; }
        else if (st === 'on') { btn.textContent = 'Meldingen uitzetten'; msg.textContent = 'Meldingen staan aan.'; }
        else { btn.textContent = 'Meldingen aanzetten'; msg.textContent = ''; }
      }
      btn.addEventListener('click', async () => {
        btn.disabled = true; msg.textContent = 'Even geduld…';
        try {
          const st = await Push.status();
          if (st === 'on') await Push.disable(); else await Push.enable();
        } catch (e) { msg.textContent = e.message || 'Mislukt'; }
        await refresh();
      });
      refresh();
    })();
  }
};

function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function pfMsg(id, text, isErr){
  const el = document.getElementById(id);
  el.textContent = text; el.hidden = false;
  el.style.background = isErr ? '' : '#e9f7e9';
  el.style.color = isErr ? '' : '#1b5e20';
}

window.Profile = Profile;
