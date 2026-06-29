/* events.js — Events: plannen, route uitstippelen, RSVP, afsluiten en scoren.
   - Plannen: route tekenen door punten te tikken (optioneel snapping via ORS).
   - Organisator kan een event 'als uitgevoerd' markeren en, als er geen route
     vooraf is, de route live opnemen via GPS.
   - Na afsluiten geven deelnemers (die 'Ga mee' kozen) een score + review.
   Hergebruikt het detail-overlay (#detail) uit app.js. */

'use strict';

const Events = {
  init(){
    const btn = document.getElementById('event-new-btn');
    if (btn) btn.addEventListener('click', () => this.openCreate());
  },

  fmtWhen(iso){
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  },
  rsvpLabel(s){ return s === 'going' ? 'Ik ga mee' : s === 'maybe' ? 'Misschien' : s === 'declined' ? 'Niet' : ''; },

  async render(){
    const box = document.getElementById('event-list');
    const empty = document.getElementById('event-empty');
    if (!box) return;
    box.innerHTML = '';
    if (!(navigator.onLine && Auth.isAuthed())) {
      empty.style.display = 'none';
      box.innerHTML = '<div class="offline-note">Events vereisen een verbinding. Maak verbinding om geplande wandelingen te zien of te plannen.</div>';
      return;
    }
    let events = [];
    try { events = await api('/api/events'); }
    catch (e) { box.innerHTML = '<div class="offline-note">' + (e.message || 'Kon events niet laden') + '</div>'; return; }
    empty.style.display = events.length ? 'none' : 'block';
    for (const e of events) {
      const card = document.createElement('div');
      card.className = 'card';
      const km = e.distance ? `<span>📏 ${fmtKm2(e.distance)} km</span>` : '';
      const status = e.status === 'completed'
        ? `<span class="badge-mine">Afgehandeld${e.avg_score ? ' ⭐ ' + e.avg_score : ''}</span>`
        : '<span class="badge-plan">Gepland</span>';
      const mine = e.my_rsvp ? `<span class="badge-mine">${this.rsvpLabel(e.my_rsvp)}</span>` : '';
      card.innerHTML = `<div class="card-body">
        <p class="card-title">${esc(e.title)} ${status}</p>
        <div class="card-meta"><span class="event-when">📅 ${esc(this.fmtWhen(e.planned_at))}</span></div>
        <div class="card-meta" style="margin-top:4px">
          <span>👤 ${esc(e.creator_name)}</span>
          <span>✅ ${e.going_count} gaan mee</span>
          ${km} ${mine}
        </div>
      </div>`;
      card.addEventListener('click', () => this.openDetail(e.id));
      box.appendChild(card);
    }
  },

  openCreate(prefill){
    if (!(navigator.onLine && Auth.isAuthed())) { toast('Hiervoor is verbinding nodig'); return; }
    const inp = 'style="width:100%;font-size:16px;padding:10px;border:1px solid #cdd6cd;border-radius:10px"';
    const body = document.getElementById('detail-body');
    body.innerHTML = `
      <h2 style="margin:6px 40px 10px 0">Nieuw event plannen</h2>
      <div class="field"><label>Titel</label><input id="ev-title" type="text" placeholder="bv. Zondagswandeling Merode" ${inp} /></div>
      <div class="field"><label>Wanneer</label><input id="ev-when" type="datetime-local" ${inp} /></div>
      <div class="field"><label>Omschrijving (optioneel)</label><textarea id="ev-desc" placeholder="Vertrekpunt, wat je wil…"></textarea></div>
      <div class="field"><label>Route uitstippelen — tik punten op de kaart (optioneel)</label>
        <div id="ev-map"></div>
        <div class="draw-tools">
          <button type="button" id="ev-undo">↶ Ongedaan</button>
          <button type="button" id="ev-clear">✕ Wissen</button>
          <button type="button" id="ev-snap">🧭 Volg paden</button>
          <span class="len" id="ev-len">0,00 km</span>
        </div></div>
      <p id="ev-error" class="auth-error" hidden></p>
      <div class="btnrow"><button class="primary" id="ev-save">Plannen</button></div>`;
    document.getElementById('detail').hidden = false;
    if (prefill && prefill.title) document.getElementById('ev-title').value = prefill.title;

    let pts = (prefill && Array.isArray(prefill.route)) ? prefill.route.slice() : [];
    let evMap = null, line = null, markers = [];
    function redraw(){
      if (line) line.setLatLngs(pts);
      markers.forEach(m => evMap.removeLayer(m)); markers = [];
      pts.forEach((p) => markers.push(L.circleMarker(p, { radius: 4, color: '#1565c0', fillColor: '#1565c0', fillOpacity: 1 }).addTo(evMap)));
      document.getElementById('ev-len').textContent = fmtKm2(routeLen2(pts)) + ' km';
    }
    setTimeout(() => {
      evMap = L.map('ev-map').setView([50.85, 4.35], 9);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(evMap);
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition(
        (p) => evMap.setView([p.coords.latitude, p.coords.longitude], 14), () => {}, { timeout: 6000 });
      line = L.polyline([], { color: '#1565c0', weight: 4 }).addTo(evMap);
      evMap.on('click', (e) => { pts.push([e.latlng.lat, e.latlng.lng]); redraw(); });
      if (pts.length) { redraw(); if (pts.length > 1) evMap.fitBounds(pts, { padding: [30, 30] }); }
    }, 130);

    document.getElementById('ev-undo').addEventListener('click', () => { pts.pop(); redraw(); });
    document.getElementById('ev-clear').addEventListener('click', () => { pts = []; redraw(); });
    document.getElementById('ev-snap').addEventListener('click', async () => {
      const key = (function(){ try { return (localStorage.getItem('wa_ors_key') || '').trim(); } catch { return ''; } })();
      if (!key) { toast('Stel eerst een API-sleutel in via je profiel'); return; }
      if (pts.length < 2) { toast('Tik eerst minstens 2 punten'); return; }
      try { const snapped = await snapRoute(pts, key); if (snapped.length) { pts = snapped; redraw(); toast('Route volgt nu wandelpaden'); } }
      catch (e) { toast('Snappen mislukt: ' + (e.message || '')); }
    });

    document.getElementById('ev-save').addEventListener('click', async () => {
      const title = document.getElementById('ev-title').value.trim();
      const when = document.getElementById('ev-when').value;
      const desc = document.getElementById('ev-desc').value.trim();
      const err = document.getElementById('ev-error');
      if (!title || !when) { err.textContent = 'Titel en datum/tijd zijn verplicht.'; err.hidden = false; return; }
      try {
        await api('/api/events', { body: { title, planned_at: when, description: desc, route: pts } });
        closeDetail(); toast('Event gepland'); this.render();
      } catch (e) { err.textContent = e.message || 'Opslaan mislukt'; err.hidden = false; }
    });
  },

  async openDetail(id){
    let e;
    try { e = await api('/api/events/' + id); }
    catch (err) { toast(err.message || 'Kon event niet laden'); return; }
    const me = Auth.getUser() || {};
    const isOrganizer = e.creator_id === me.id;
    const completed = e.status === 'completed';
    const hasRoute = e.route && e.route.length > 1;
    const amGoing = e.my_rsvp === 'going';
    const sel = (s) => e.my_rsvp === s ? ' sel-' + s : '';
    const statusBadge = completed ? '<span class="badge-mine">Afgehandeld</span>' : '<span class="badge-plan">Gepland</span>';
    const attendees = (e.rsvps || []).map(r =>
      `<div class="attendee"><span>${esc(r.display_name)}${r.user_id === me.id ? '<span class="badge-mine">jij</span>' : ''}</span><span class="st">${this.rsvpLabel(r.status)}</span></div>`
    ).join('') || '<p class="hint">Nog geen reacties.</p>';
    const reviews = (e.reviews || []).map(r =>
      `<div class="attendee"><span>${esc(r.display_name)} ⭐ ${r.score}/5</span><span class="st">${esc(r.text || '')}</span></div>`
    ).join('') || '<p class="hint">Nog geen reviews.</p>';

    const body = document.getElementById('detail-body');
    body.innerHTML = `
      <h2 style="margin:6px 40px 4px 0">${esc(e.title)} ${statusBadge}</h2>
      <div class="card-meta" style="margin-bottom:8px">
        <span class="event-when">📅 ${esc(this.fmtWhen(e.planned_at))}</span>
        <span>👤 ${esc(e.creator_name)}</span>
        ${e.distance ? `<span>📏 ${fmtKm2(e.distance)} km</span>` : ''}
        ${completed && e.avg_score ? `<span class="score-badge">⭐ ${e.avg_score}/5</span>` : ''}
      </div>
      ${e.description ? `<p style="margin:0 0 12px">${esc(e.description)}</p>` : ''}
      ${hasRoute ? '<div id="ev-detail-map"></div>' : ''}
      ${(hasRoute && !completed) ? '<div class="btnrow"><button class="primary" id="ev-start">▶ Start wandeling met deze route</button></div>' : ''}
      ${(isOrganizer && !hasRoute) ? '<div class="btnrow"><button id="ev-recroute">📍 Route nu opnemen (GPS)</button></div>' : ''}
      ${hasRoute ? '<div class="btnrow"><button id="ev-replan">📅 Opnieuw plannen</button><button id="ev-export">⬇ GPX</button></div>' : ''}
      ${(isOrganizer && !completed) ? '<div class="btnrow"><button class="primary" id="ev-complete">✓ Markeer als uitgevoerd</button></div>' : ''}
      ${!completed ? `<div class="field"><label>Ga je mee?</label>
        <div class="rsvp-row">
          <button data-st="going" class="${sel('going')}">✅ Ga mee</button>
          <button data-st="maybe" class="${sel('maybe')}">🤔 Misschien</button>
          <button data-st="declined" class="${sel('declined')}">❌ Niet</button>
        </div></div>` : ''}
      ${completed ? `<div class="field"><label>Jouw score</label>
        ${amGoing ? `<div class="stars" id="ev-stars"></div>
          <textarea id="ev-review" placeholder="Hoe was de wandeling?" style="margin-top:8px"></textarea>
          <div class="btnrow"><button class="primary" id="ev-review-save">Review opslaan</button></div>`
        : '<p class="hint">Alleen wie meeging (‘Ga mee’) kan deze wandeling scoren.</p>'}
        </div>
        <div class="field"><label>Reviews van de groep</label>${reviews}</div>` : ''}
      <div class="field"><label>Wie gaan er?</label>${attendees}</div>
      ${isOrganizer ? '<div class="btnrow"><button class="danger" id="ev-delete">Event verwijderen</button></div>' : ''}`;
    document.getElementById('detail').hidden = false;

    if (hasRoute) setTimeout(() => {
      const m = L.map('ev-detail-map', { zoomControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      L.polyline(e.route, { color: '#1565c0', weight: 4 }).addTo(m);
      m.fitBounds(e.route, { padding: [20, 20] });
    }, 120);

    const startBtn = document.getElementById('ev-start');
    if (startBtn) startBtn.addEventListener('click', () => { closeDetail(); if (window.startWalkWithRoute) window.startWalkWithRoute(e.route); });

    const recBtn = document.getElementById('ev-recroute');
    if (recBtn) recBtn.addEventListener('click', () => { closeDetail(); if (window.recordRouteForEvent) window.recordRouteForEvent(e.id); });
    const replanBtn = document.getElementById('ev-replan');
    if (replanBtn) replanBtn.addEventListener('click', () => { closeDetail(); if (window.planEventFromRoute) window.planEventFromRoute(e.route, 'Herhaling: ' + e.title); });
    const expBtn = document.getElementById('ev-export');
    if (expBtn) expBtn.addEventListener('click', () => { if (window.exportGpx) window.exportGpx(e.title, e.route); });

    const compBtn = document.getElementById('ev-complete');
    if (compBtn) compBtn.addEventListener('click', async () => {
      if (!confirm('Dit event markeren als uitgevoerd? Daarna kunnen deelnemers scoren.')) return;
      try { await api('/api/events/' + id + '/complete', { method: 'PUT' }); toast('Event afgesloten'); this.openDetail(id); this.render(); }
      catch (err) { toast(err.message || 'Mislukt'); }
    });

    if (completed && amGoing) {
      let score = e.my_review ? e.my_review.score : 0;
      const starsEl = document.getElementById('ev-stars');
      const draw = () => { starsEl.innerHTML = [1,2,3,4,5].map(n => `<span data-n="${n}" class="${n <= score ? 'on' : ''}">★</span>`).join(''); };
      draw();
      starsEl.addEventListener('click', (ev) => { if (ev.target.dataset.n) { score = +ev.target.dataset.n; draw(); } });
      if (e.my_review) document.getElementById('ev-review').value = e.my_review.text || '';
      document.getElementById('ev-review-save').addEventListener('click', async () => {
        if (!score) { toast('Geef eerst een score'); return; }
        try { await api('/api/events/' + id + '/review', { method: 'PUT', body: { score, text: document.getElementById('ev-review').value.trim() } });
          toast('Review opgeslagen'); this.openDetail(id); this.render(); }
        catch (err) { toast(err.message || 'Mislukt'); }
      });
    }

    body.querySelectorAll('.rsvp-row button').forEach((b) =>
      b.addEventListener('click', async () => {
        try { await api('/api/events/' + id + '/rsvp', { body: { status: b.dataset.st } }); this.openDetail(id); this.render(); }
        catch (err) { toast(err.message || 'Mislukt'); }
      }));
    const del = document.getElementById('ev-delete');
    if (del) del.addEventListener('click', async () => {
      if (!confirm('Dit event verwijderen?')) return;
      try { await api('/api/events/' + id, { method: 'DELETE' }); closeDetail(); toast('Event verwijderd'); this.render(); }
      catch (err) { toast(err.message || 'Mislukt'); }
    });
  }
};

/* Optioneel: route langs wandelpaden via OpenRouteService (vereist API-sleutel). */
async function snapRoute(pts, key){
  const coordinates = pts.map(p => [p[1], p[0]]); // ORS verwacht [lng,lat]
  const res = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
    method: 'POST',
    headers: { 'Authorization': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates })
  });
  if (!res.ok) throw new Error('ORS ' + res.status);
  const data = await res.json();
  const coords = data.features && data.features[0] && data.features[0].geometry.coordinates;
  return (coords || []).map(c => [c[1], c[0]]);
}

function routeLen2(c){
  let d = 0; const R = 6371000, r = (x) => x * Math.PI / 180;
  for (let i = 1; i < c.length; i++) {
    const a = c[i-1], b = c[i], dLa = r(b[0]-a[0]), dLn = r(b[1]-a[1]);
    const s = Math.sin(dLa/2)**2 + Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dLn/2)**2;
    d += 2 * R * Math.asin(Math.sqrt(s));
  }
  return d;
}
function fmtKm2(m){ return (m/1000).toFixed(2).replace('.', ','); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

window.Events = Events;
