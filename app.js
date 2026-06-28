/* WandelApp — offline-first PWA voor wandelroutes met foto's, reviews en ranking.
   Alle data wordt lokaal opgeslagen in IndexedDB (werkt offline).
   Foto's worden als origineel bestand bewaard (geen hercompressie => geen kwaliteitsverlies). */

'use strict';

/* ---------- IndexedDB ---------- */
const DB_NAME = 'wandelapp', DB_VER = 2;
let _db = null;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('walks')) {
        db.createObjectStore('walks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const ps = db.createObjectStore('photos', { keyPath: 'id' });
        ps.createIndex('walkId', 'walkId', { unique: false });
      }
      if (!db.objectStoreNames.contains('pins')) {
        db.createObjectStore('pins', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode){ return _db.transaction(store, mode).objectStore(store); }

function put(store, value){
  return new Promise((res, rej) => {
    const r = tx(store, 'readwrite').put(value);
    r.onsuccess = () => res(value); r.onerror = () => rej(r.error);
  });
}
function getAll(store){
  return new Promise((res, rej) => {
    const r = tx(store, 'readonly').getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function getOne(store, key){
  return new Promise((res, rej) => {
    const r = tx(store, 'readonly').get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function del(store, key){
  return new Promise((res, rej) => {
    const r = tx(store, 'readwrite').delete(key);
    r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
}
function photosForWalk(walkId){
  return new Promise((res, rej) => {
    const idx = tx('photos', 'readonly').index('walkId');
    const r = idx.getAll(IDBKeyRange.only(walkId));
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function photosForPin(pinId){
  return (await getAll('photos')).filter(p => p.pinId === pinId);
}

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function haversine(a, b){ // [lat,lng] meters
  const R = 6371000, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat/2)**2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function routeDistance(coords){
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i-1], coords[i]);
  return d; // meters
}
const fmtKm = (m) => (m/1000).toFixed(2).replace('.', ',');
function fmtDur(sec){
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = Math.floor(sec%60);
  const p = (n) => String(n).padStart(2,'0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
function fmtDate(ts){
  return new Date(ts).toLocaleDateString('nl-BE', { day:'numeric', month:'long', year:'numeric' });
}
function toast(msg){
  let t = $('.toast');
  if (!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

/* Genereer een kleine thumbnail (alleen voor lijstweergave/performance).
   Het ORIGINEEL blijft onaangeroerd bewaard => geen kwaliteitsverlies op je echte foto. */
function makeThumb(file, maxSize = 400){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob((b) => { URL.revokeObjectURL(img.src); resolve(b || file); }, 'image/jpeg', 0.8);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}
/* Lees EXIF GPS uit JPEG indien aanwezig (best effort, geen externe library). */
function readExifGps(file){
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => { try { resolve(parseExifGps(new DataView(r.result))); } catch(e){ resolve(null); } };
    r.onerror = () => resolve(null);
    r.readAsArrayBuffer(file.slice(0, 128 * 1024));
  });
}
function parseExifGps(view){
  if (view.getUint16(0) !== 0xFFD8) return null; // niet JPEG
  let offset = 2;
  while (offset < view.byteLength) {
    if (view.getUint16(offset) === 0xFFE1) {
      if (view.getUint32(offset + 4) !== 0x45786966) return null; // "Exif"
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const get16 = (o) => view.getUint16(o, little);
      const get32 = (o) => view.getUint32(o, little);
      const dir0 = tiff + get32(tiff + 4);
      const entries = get16(dir0);
      let gpsIfd = 0;
      for (let i = 0; i < entries; i++) {
        const e = dir0 + 2 + i * 12;
        if (get16(e) === 0x8825) gpsIfd = tiff + get32(e + 8);
      }
      if (!gpsIfd) return null;
      const gEntries = get16(gpsIfd);
      let latRef, lat, lngRef, lng;
      const readRational3 = (valOff) => {
        const o = tiff + get32(valOff);
        return [ get32(o)/get32(o+4), get32(o+8)/get32(o+12), get32(o+16)/get32(o+20) ];
      };
      for (let i = 0; i < gEntries; i++) {
        const e = gpsIfd + 2 + i * 12, tag = get16(e);
        if (tag === 1) latRef = String.fromCharCode(view.getUint8(e + 8));
        if (tag === 2) lat = readRational3(e + 8);
        if (tag === 3) lngRef = String.fromCharCode(view.getUint8(e + 8));
        if (tag === 4) lng = readRational3(e + 8);
      }
      if (!lat || !lng) return null;
      const dms = (a) => a[0] + a[1]/60 + a[2]/3600;
      let la = dms(lat), ln = dms(lng);
      if (latRef === 'S') la = -la;
      if (lngRef === 'W') ln = -ln;
      return [la, ln];
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

/* ---------- Navigatie ---------- */
const views = ['map','record','list','events','rank'];
function showView(name){
  views.forEach((v) => {
    $('#view-' + v).classList.toggle('active', v === name);
  });
  document.querySelectorAll('#tabbar button').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  if (name === 'map') setTimeout(() => map && map.invalidateSize(), 100);
  if (name === 'list') renderList();
  if (name === 'rank') renderRank();
  if (name === 'events' && window.Events) Events.render();
}
document.querySelectorAll('#tabbar button').forEach((b) => {
  b.addEventListener('click', () => showView(b.dataset.view));
});

/* ---------- Kaart ---------- */
let map, overviewLayer;
function initMap(){
  map = L.map('map', { zoomControl: true }).setView([50.85, 4.35], 9); // België als startpunt
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(map);
  overviewLayer = L.layerGroup().addTo(map);
  // Probeer huidige locatie te centreren
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => map.setView([p.coords.latitude, p.coords.longitude], 14),
      () => {}, { enableHighAccuracy: true, timeout: 8000 }
    );
  }
  // Locatie pinnen: knop wapent, daarna plaatst een tik op de kaart een pin.
  $('#fab-pin').addEventListener('click', togglePinMode);
  map.on('click', onMapClickForPin);
}

let pinArming = false;
function togglePinMode(){
  pinArming = !pinArming;
  $('#fab-pin').classList.toggle('armed', pinArming);
  map.getContainer().style.cursor = pinArming ? 'crosshair' : '';
  if (pinArming) toast('Tik op de kaart om een locatie te pinnen');
}
async function onMapClickForPin(e){
  if (!pinArming) return;
  pinArming = false;
  $('#fab-pin').classList.remove('armed');
  map.getContainer().style.cursor = '';
  const name = prompt('Naam van deze plek:', 'Mooi plekje');
  if (name === null) return;
  const pin = { id: uid(), name: name.trim() || 'Gepinde plek', lat: e.latlng.lat, lng: e.latlng.lng, createdAt: Date.now() };
  await put('pins', pin);
  if (Sync.online()) { try { await Sync.push(); } catch {} }
  await renderOverview();
  openPinDetail(pin.id);
}

async function renderOverview(){
  overviewLayer.clearLayers();
  const bounds = [];
  // Routes van de hele groep (server) of lokaal als fallback, in de kleur van de eigenaar
  const walks = await Sync.listWalks();
  for (const w of walks) {
    if (w.coords && w.coords.length > 1) {
      L.polyline(w.coords, { color: w.color || '#2e7d32', weight: 4, opacity: .85 })
        .addTo(overviewLayer).on('click', () => openDetail(w.id));
      w.coords.forEach((c) => bounds.push(c));
    }
  }
  // Eigen lokale foto-markers — maar NIET voor foto's die bij een pin horen (pin heeft voorrang)
  for (const ph of await getAll('photos')) {
    if (ph.pinId) continue;
    if (ph.walkId && ph.lat != null && ph.lng != null) {
      const icon = L.divIcon({ className: '', html: '<div class="photo-pin">📷</div>', iconSize: [26,26] });
      L.marker([ph.lat, ph.lng], { icon }).addTo(overviewLayer).on('click', () => openDetail(ph.walkId));
      bounds.push([ph.lat, ph.lng]);
    }
  }
  // Gepinde locaties (groep) in de kleur van de eigenaar
  for (const pin of await Sync.listPins()) {
    L.marker([pin.lat, pin.lng], { icon: colorPinIcon(pin.color) }).addTo(overviewLayer)
      .on('click', () => openPinDetail(pin.id));
    bounds.push([pin.lat, pin.lng]);
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [30,30], maxZoom: 15 });
}

function colorPinIcon(color){
  return L.divIcon({ className: '', iconSize: [26,26], iconAnchor: [13,24],
    html: `<div class="user-pin" style="background:${color || '#2e7d32'}"></div>` });
}

/* ---------- Opnemen ---------- */
let rec = null; // {coords, photos:[{file,thumb,lat,lng,takenAt}], startTime, watchId, line, timer}
let plannedRoute = null, plannedLayer = null, liveMarker = null, recordingForEvent = null;

/* Start een wandeling met een vooraf geplande route (vanuit een event). */
window.startWalkWithRoute = function(route){
  plannedRoute = (route && route.length > 1) ? route : null;
  showView('record');
  setTimeout(() => { if (map) { map.invalidateSize(); drawPlanned(); } }, 200);
  if (plannedRoute) toast('Route geladen — druk op ▶ Start om te volgen');
};

/* Organisator: route van een event live opnemen op basis van de afgelegde weg. */
window.recordRouteForEvent = function(eventId){
  recordingForEvent = eventId;
  startRecording();
  toast('Neem de route op en druk daarna op ■ Stop');
};
function drawPlanned(){
  if (plannedLayer) { map.removeLayer(plannedLayer); plannedLayer = null; }
  if (plannedRoute && plannedRoute.length > 1) {
    plannedLayer = L.polyline(plannedRoute, { color: '#1565c0', weight: 5, opacity: .7, dashArray: '8,8' }).addTo(map);
    map.fitBounds(plannedRoute, { padding: [40,40] });
  }
}
function updateLiveMarker(c){
  if (!liveMarker) {
    liveMarker = L.marker(c, { icon: L.divIcon({ className: '', html: '<div class="live-dot"></div>', iconSize: [16,16] }) }).addTo(map);
  } else liveMarker.setLatLng(c);
}
function clearLive(){
  if (liveMarker) { map.removeLayer(liveMarker); liveMarker = null; }
  if (plannedLayer) { map.removeLayer(plannedLayer); plannedLayer = null; }
  plannedRoute = null;
}
// Resterende afstand langs de geplande route vanaf de huidige positie.
function remainingAlong(route, pos){
  let best = 0, bestD = Infinity;
  for (let i = 0; i < route.length; i++) { const d = haversine(pos, route[i]); if (d < bestD) { bestD = d; best = i; } }
  let rem = bestD;
  for (let i = best; i < route.length - 1; i++) rem += haversine(route[i], route[i+1]);
  return rem;
}

function resetRecUI(){
  $('#rec-distance').textContent = '0,00';
  $('#rec-time').textContent = '00:00';
  $('#rec-points').textContent = '0';
  $('#rec-photos').innerHTML = '';
}

function startRecording(){
  if (!navigator.geolocation) { toast('Geen GPS beschikbaar op dit toestel'); return; }
  rec = { coords: [], photos: [], startTime: Date.now(), watchId: null, line: null, timer: null };
  resetRecUI();
  $('#btn-start').disabled = true;
  $('#btn-stop').disabled = false;
  $('#btn-addphoto').disabled = false;
  $('#rec-status').textContent = 'Bezig met opnemen… GPS-signaal zoeken.';
  showView('map');
  drawPlanned(); // toon de geplande route (indien aanwezig)

  rec.line = L.polyline([], { color: '#c62828', weight: 5 }).addTo(map);
  rec.watchId = navigator.geolocation.watchPosition((pos) => {
    const c = [pos.coords.latitude, pos.coords.longitude];
    updateLiveMarker(c);
    const last = rec.coords[rec.coords.length - 1];
    // negeer sprongen < 3m (ruis) en onrealistische uitschieters
    if (!last || haversine(last, c) >= 3) {
      rec.coords.push(c);
      rec.line.setLatLngs(rec.coords);
      map.setView(c, Math.max(map.getZoom(), 16));
      $('#rec-distance').textContent = fmtKm(routeDistance(rec.coords));
      $('#rec-points').textContent = rec.coords.length;
      if (plannedRoute && plannedRoute.length > 1) {
        $('#rec-status').textContent = 'Nog ~' + fmtKm(remainingAlong(plannedRoute, c)) + ' km tot het einde';
      } else {
        $('#rec-status').textContent = 'Opnemen… (' + Math.round(pos.coords.accuracy) + ' m nauwkeurig)';
      }
    }
  }, (err) => {
    $('#rec-status').textContent = 'GPS-fout: ' + err.message;
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });

  rec.timer = setInterval(() => {
    $('#rec-time').textContent = fmtDur((Date.now() - rec.startTime) / 1000);
  }, 1000);
}

async function addPhotos(files){
  for (const file of files) {
    const thumb = await makeThumb(file);
    let loc = await readExifGps(file); // GPS uit foto-metadata
    if (!loc && rec && rec.coords.length) loc = rec.coords[rec.coords.length - 1]; // val terug op huidige positie
    const photo = { file, thumb, lat: loc ? loc[0] : null, lng: loc ? loc[1] : null, takenAt: Date.now() };
    if (rec) rec.photos.push(photo);
    const img = document.createElement('img');
    img.src = URL.createObjectURL(thumb);
    $('#rec-photos').appendChild(img);
  }
  toast(files.length + ' foto(\'s) toegevoegd');
}

async function stopRecording(){
  if (!rec) return;
  navigator.geolocation.clearWatch(rec.watchId);
  clearInterval(rec.timer);
  if (rec.line) map.removeLayer(rec.line);

  // Route opnemen voor een event (organisator) i.p.v. een gewone wandeling opslaan
  if (recordingForEvent) {
    const evId = recordingForEvent; recordingForEvent = null;
    const coords = rec.coords.slice();
    finishRecUI();
    if (coords.length < 2) { toast('Te weinig GPS-punten voor een route'); return; }
    try {
      await api('/api/events/' + evId + '/route', { method: 'PUT', body: { route: coords } });
      toast('Route opgeslagen bij het event');
      if (window.Events) Events.openDetail(evId);
    } catch (e) { toast(e.message || 'Route opslaan mislukt'); }
    return;
  }

  if (rec.coords.length < 2 && rec.photos.length === 0) {
    toast('Te weinig data om op te slaan');
    finishRecUI(); return;
  }
  const name = prompt('Naam van deze wandeling:', 'Wandeling ' + new Date().toLocaleDateString('nl-BE'));
  if (name === null) { // geannuleerd -> hervat niet, gewoon weggooien
    if (!confirm('Opname weggooien?')) { finishRecUI(); return; }
    finishRecUI(); return;
  }
  const walk = {
    id: uid(),
    name: name.trim() || 'Naamloze wandeling',
    date: rec.startTime,
    coords: rec.coords,
    distance: routeDistance(rec.coords),
    durationSec: (Date.now() - rec.startTime) / 1000,
    review: '',
    score: 0,
    createdAt: Date.now()
  };
  await put('walks', walk);
  for (const p of rec.photos) {
    await put('photos', {
      id: uid(), walkId: walk.id, blob: p.file, thumb: p.thumb,
      lat: p.lat, lng: p.lng, takenAt: p.takenAt
    });
  }
  finishRecUI();
  toast('Wandeling opgeslagen');
  if (Sync.online()) { try { await Sync.push(); } catch {} }
  await renderOverview();
  openDetail(walk.id); // direct review/score kunnen geven
}

function finishRecUI(){
  rec = null;
  clearLive();
  $('#btn-start').disabled = false;
  $('#btn-stop').disabled = true;
  $('#btn-addphoto').disabled = true;
  $('#rec-status').textContent = 'Druk op start om je route te volgen. Houd je scherm aan voor de beste GPS-nauwkeurigheid.';
  resetRecUI();
}

$('#btn-start').addEventListener('click', startRecording);
$('#btn-stop').addEventListener('click', stopRecording);
$('#btn-addphoto').addEventListener('click', () => $('#photo-input').click());
$('#photo-input').addEventListener('change', (e) => {
  if (e.target.files.length) addPhotos([...e.target.files]);
  e.target.value = '';
});

/* ---------- Lijst ---------- */
async function renderList(){
  const walks = await Sync.listWalks();
  const box = $('#walk-list'); box.innerHTML = '';
  $('#list-empty').style.display = walks.length ? 'none' : 'block';
  for (const w of walks) {
    box.appendChild(await walkCard(w));
  }
}
async function walkCard(w){
  let coverUrl = w.coverUrl, count = w.photo_count;
  if (!w.isRemote) {
    const ps = await photosForWalk(w.id);
    count = ps.length;
    if (ps.length) coverUrl = URL.createObjectURL(ps[0].thumb);
  }
  const card = document.createElement('div'); card.className = 'card';
  const cover = coverUrl ? `<div class="card-cover" style="background-image:url(${coverUrl})"></div>` : '';
  card.innerHTML = cover + `
    <div class="card-body">
      <p class="card-title">${escapeHtml(w.name)}</p>
      <div class="card-meta">
        <span>📅 ${fmtDate(w.date)}</span>
        <span>📏 ${fmtKm(w.distance)} km</span>
        ${count != null ? `<span>📷 ${count}</span>` : ''}
        ${w.owner_name ? `<span>👤 ${escapeHtml(w.owner_name)}</span>` : ''}
        ${w.score ? `<span class="score-badge">⭐ ${w.score}/5</span>` : ''}
      </div>
    </div>`;
  card.addEventListener('click', () => openDetail(w.id));
  return card;
}

/* ---------- Ranking ---------- */
async function renderRank(){
  // Ranking combineert losse wandelingen en afgehandelde events
  const walks = (await Sync.listWalks()).filter((w) => w.score > 0).map((w) => ({
    id: w.id, name: w.name, date: w.date, distance: w.distance, score: w.score, owner: w.owner_name, kind: 'walk'
  }));
  let events = [];
  try { events = await Sync.listCompletedEvents(); } catch {}
  const all = walks.concat(events.filter((e) => e.score > 0));

  const years = [...new Set(all.map((x) => new Date(x.date).getFullYear()))].sort((a,b) => b - a);
  const sel = $('#rank-year');
  const cur = sel.value;
  sel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
  if (years.length) sel.value = years.includes(+cur) ? cur : years[0];
  const year = +sel.value;

  const ranked = all
    .filter((x) => new Date(x.date).getFullYear() === year)
    .sort((a,b) => b.score - a.score || (b.distance || 0) - (a.distance || 0));

  const box = $('#rank-list'); box.innerHTML = '';
  $('#rank-empty').style.display = ranked.length ? 'none' : 'block';
  let pos = 1;
  for (const x of ranked) {
    const row = document.createElement('div'); row.className = 'rank-row';
    const num = document.createElement('div'); num.className = 'rank-num';
    num.textContent = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
    row.appendChild(num);
    row.appendChild(rankCard(x));
    box.appendChild(row);
    pos++;
  }
}
function rankCard(x){
  const card = document.createElement('div'); card.className = 'card';
  const tag = x.kind === 'event' ? '📅 Event' : '🥾 Wandeling';
  card.innerHTML = `<div class="card-body">
    <p class="card-title">${escapeHtml(x.name)}</p>
    <div class="card-meta">
      <span>${tag}</span>
      <span>📅 ${fmtDate(x.date)}</span>
      ${x.distance ? `<span>📏 ${fmtKm(x.distance)} km</span>` : ''}
      ${x.owner ? `<span>👤 ${escapeHtml(x.owner)}</span>` : ''}
      <span class="score-badge">⭐ ${x.score}/5</span>
    </div></div>`;
  card.addEventListener('click', () => { if (x.kind === 'event' && window.Events) Events.openDetail(x.id); else openDetail(x.id); });
  return card;
}
$('#rank-year').addEventListener('change', renderRank);

/* ---------- Detail / review ---------- */
let detailMap = null;
async function openDetail(walkId){
  const w = await Sync.getWalkDetail(walkId);
  if (!w) return;
  const photos = w.photos || [];
  const body = $('#detail-body');
  body.innerHTML = `
    <h2 style="margin:6px 40px 4px 0">${escapeHtml(w.name)}</h2>
    <div class="card-meta" style="margin-bottom:6px">
      <span>📅 ${fmtDate(w.date)}</span>
      <span>📏 ${fmtKm(w.distance)} km</span>
      ${w.durationSec ? `<span>⏱️ ${fmtDur(w.durationSec)}</span>` : ''}
      ${w.owner_name ? `<span>👤 ${escapeHtml(w.owner_name)}</span>` : ''}
    </div>
    <div id="detail-map"></div>
    <div class="detail-gallery" id="detail-gallery"></div>
    <div class="field">
      <label>Jouw score</label>
      <div class="stars" id="stars"></div>
    </div>
    <div class="field">
      <label>Review</label>
      <textarea id="review-text" placeholder="Hoe was de wandeling?"></textarea>
    </div>
    ${(w.reviews && w.reviews.length) ? `<div class="field"><label>Reviews van de groep</label>${w.reviews.map((r) => `<div class="attendee"><span>${escapeHtml(r.display_name || '')} ⭐ ${r.score}/5</span><span class="st">${escapeHtml(r.text || '')}</span></div>`).join('')}</div>` : ''}
    <div class="btnrow">
      <button class="primary" id="save-review">Review opslaan</button>
      ${w.mine ? '<button class="danger" id="delete-walk">Verwijderen</button>' : ''}
    </div>
  `;
  $('#detail').hidden = false;

  // eigen review voorvullen
  let myScore = 0, myText = '';
  if (w.myReview) { myScore = w.myReview.score || 0; myText = w.myReview.text || ''; }
  else if (w.localScore) { myScore = w.localScore; myText = w.localReview || ''; }
  $('#review-text').value = myText;

  // mini-kaart
  if (detailMap) { detailMap.remove(); detailMap = null; }
  setTimeout(() => {
    detailMap = L.map('detail-map', { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(detailMap);
    const b = [];
    if (w.coords && w.coords.length > 1) {
      L.polyline(w.coords, { color: '#2e7d32', weight: 4 }).addTo(detailMap);
      w.coords.forEach((c) => b.push(c));
    }
    photos.forEach((ph) => {
      if (ph.lat != null) {
        const icon = L.divIcon({ className:'', html:'<div class="photo-pin">📷</div>', iconSize:[26,26] });
        L.marker([ph.lat, ph.lng], { icon }).addTo(detailMap);
        b.push([ph.lat, ph.lng]);
      }
    });
    if (b.length) detailMap.fitBounds(b, { padding:[20,20], maxZoom:16 });
    else detailMap.setView([50.85, 4.35], 9);
  }, 80);

  // galerij (thumbnail uit blob of server-url; klik = volledige weergave)
  const gal = $('#detail-gallery');
  photos.forEach((ph) => {
    const img = document.createElement('img');
    img.src = photoThumbSrc(ph);
    img.addEventListener('click', () => window.open(photoFullSrc(ph), '_blank'));
    gal.appendChild(img);
  });

  // sterren
  let score = myScore;
  const starsEl = $('#stars');
  const drawStars = () => {
    starsEl.innerHTML = [1,2,3,4,5].map((n) =>
      `<span data-n="${n}" class="${n <= score ? 'on' : ''}">★</span>`).join('');
  };
  drawStars();
  starsEl.addEventListener('click', (e) => {
    if (e.target.dataset.n) { score = +e.target.dataset.n; drawStars(); }
  });

  $('#save-review').addEventListener('click', async () => {
    if (!score) { toast('Geef eerst een score'); return; }
    const text = $('#review-text').value.trim();
    try {
      if (w.isRemote) {
        await Sync.saveReviewRemote(w.id, score, text);
      } else {
        const local = await getOne('walks', w.id);
        if (local) { local.score = score; local.review = text; local.reviewSynced = false; await put('walks', local); Sync.pushSoon(); }
      }
      toast('Review opgeslagen');
      closeDetail();
      renderOverview();
    } catch (err) { toast(err.message || 'Opslaan mislukt'); }
  });

  const delBtn = $('#delete-walk');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('Deze wandeling en bijhorende foto\'s verwijderen?')) return;
    try {
      if (w.isRemote) await Sync.deleteWalkRemote(w.id);
      for (const ph of await photosForWalk(w.id)) await del('photos', ph.id);
      if (await getOne('walks', w.id)) await del('walks', w.id);
      toast('Verwijderd');
      closeDetail();
      renderOverview();
    } catch (err) { toast(err.message || 'Verwijderen mislukt'); }
  });
}
function closeDetail(){
  $('#detail').hidden = true;
  if (detailMap) { detailMap.remove(); detailMap = null; }
}
$('#detail-close').addEventListener('click', closeDetail);
$('#detail').addEventListener('click', (e) => { if (e.target.id === 'detail') closeDetail(); });

/* ---------- Pin-detail (locatie met foto's) ---------- */
let currentPinId = null;
async function openPinDetail(pinId){
  const pin = await Sync.getPinDetail(pinId);
  if (!pin) return;
  const photos = pin.photos || [];
  const body = $('#detail-body');
  body.innerHTML = `
    <h2 style="margin:6px 40px 4px 0">📍 ${escapeHtml(pin.name)}</h2>
    <div class="card-meta" style="margin-bottom:6px">
      <span>${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}</span>
      <span>📷 ${photos.length}</span>
      ${pin.owner_name ? `<span>👤 ${escapeHtml(pin.owner_name)}</span>` : ''}
    </div>
    <div class="detail-gallery" id="detail-gallery"></div>
    ${pin.mine ? `<div class="btnrow"><button class="primary" id="pin-add-photo">📷 Foto's toevoegen</button></div>
    <div class="btnrow"><button class="danger" id="pin-delete">Pin verwijderen</button></div>` : ''}`;
  $('#detail').hidden = false;

  const gal = $('#detail-gallery');
  if (!photos.length) gal.innerHTML = '<p class="hint">Nog geen foto\'s op deze plek.</p>';
  photos.forEach((ph) => {
    const img = document.createElement('img');
    img.src = photoThumbSrc(ph);
    img.addEventListener('click', () => window.open(photoFullSrc(ph), '_blank'));
    gal.appendChild(img);
  });

  const addBtn = $('#pin-add-photo');
  if (addBtn) addBtn.addEventListener('click', () => { currentPinId = pinId; $('#pin-photo-input').click(); });
  const delBtn = $('#pin-delete');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('Deze pin en bijhorende foto\'s verwijderen?')) return;
    try {
      if (pin.isRemote) await Sync.deletePinRemote(pinId);
      for (const ph of await photosForPin(pinId)) await del('photos', ph.id);
      if (await getOne('pins', pinId)) await del('pins', pinId);
      toast('Pin verwijderd');
      closeDetail();
      renderOverview();
    } catch (err) { toast(err.message || 'Verwijderen mislukt'); }
  });
}

async function addPhotosToPin(pinId, files){
  const pin = await getOne('pins', pinId);
  for (const file of files) {
    const thumb = await makeThumb(file);
    let loc = await readExifGps(file);
    if (!loc && pin) loc = [pin.lat, pin.lng];
    await put('photos', {
      id: uid(), pinId, walkId: null, blob: file, thumb,
      lat: loc ? loc[0] : null, lng: loc ? loc[1] : null, takenAt: Date.now()
    });
  }
  toast(files.length + ' foto(\'s) toegevoegd');
}

$('#pin-photo-input').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length && currentPinId) {
    await addPhotosToPin(currentPinId, files);
    if (Sync.online()) { try { await Sync.push(); } catch {} }
    await renderOverview();
    openPinDetail(currentPinId);
  }
});

/* Foto-bron: lokale blob (origineel/thumb) of server-URL (groepsfoto's). */
function photoThumbSrc(ph){ return ph.thumb ? URL.createObjectURL(ph.thumb) : ph.url; }
function photoFullSrc(ph){ return ph.blob ? URL.createObjectURL(ph.blob) : (ph.url || (ph.thumb ? URL.createObjectURL(ph.thumb) : '')); }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Netwerkstatus ---------- */
function updateNet(){
  const el = $('#netstatus');
  el.classList.toggle('online', navigator.onLine);
  el.classList.toggle('offline', !navigator.onLine);
  el.title = navigator.onLine ? 'Online' : 'Offline — data wordt lokaal bewaard';
}
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);

// Houd de kaart correct bij wisselen tussen smal/breed scherm.
let _resizeT;
window.addEventListener('resize', () => {
  clearTimeout(_resizeT);
  _resizeT = setTimeout(() => {
    if (map) map.invalidateSize();
    if (detailMap) detailMap.invalidateSize();
  }, 150);
}, { passive: true });

/* ---------- Init ---------- */
async function onAuthed(){
  const u = window.Auth && Auth.getUser();
  $('#user-name').textContent = u ? u.display_name : '';
  $('#logout-btn').hidden = false;
  try { await Sync.fullSync(); } catch {}
  await renderOverview();
  if ($('#view-events').classList.contains('active') && window.Events) Events.render();
}

(async function init(){
  updateNet();
  await openDB();
  initMap();
  if (window.Events) Events.init();
  $('#logout-btn').addEventListener('click', () => Auth.logout());
  $('#user-name').classList.add('clickable');
  $('#user-name').addEventListener('click', () => { if (window.Profile) Profile.open(); });
  await renderOverview();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (window.Auth) Auth.init(onAuthed);
})();

window.addEventListener('online', () => { if (window.Sync) Sync.pushSoon(); });
