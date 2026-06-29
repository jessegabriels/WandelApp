/* sync.js — synchronisatie tussen de lokale opslag (IndexedDB) en de server.
   Strategie (bewust eenvoudig): client genereert ID's, last-write-wins,
   pushen zodra er verbinding is.
   - PUSH: jouw lokaal opgenomen wandelingen, pins, foto-thumbnails en reviews
     gaan naar de server (originele foto's blijven lokaal — hybride).
   - LEZEN: de gedeelde weergaves (kaart/lijst/ranking/detail) halen de
     groepsdata live van de server; offline valt alles terug op je eigen
     lokale data.
   Gebruikt helpers uit app.js (getAll/put/getOne/photosForWalk/...) die op het
   moment van aanroepen al geladen zijn. */

'use strict';

const Sync = {
  online(){ return navigator.onLine && window.Auth && Auth.isAuthed(); },

  /* ---------- PUSH (lokaal -> server) ---------- */
  _pushTimer: null,
  pushSoon(){
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => this.push().catch(() => {}), 800);
  },

  async push(){
    if (!this.online()) return;
    // 1) Wandelingen
    for (const w of await getAll('walks')) {
      if (!w.synced) {
        try {
          await api('/api/walks', { body: {
            id: w.id, name: w.name, date: w.date, coords: w.coords,
            distance: w.distance, duration: w.durationSec
          }});
          w.synced = true; await put('walks', w);
        } catch { /* later opnieuw proberen */ }
      }
      // eigen review/score van deze (eigen) wandeling
      if (w.score && !w.reviewSynced) {
        try {
          await api('/api/walks/' + w.id + '/review', { method: 'PUT', body: { score: w.score, text: w.review || '' } });
          w.reviewSynced = true; await put('walks', w);
        } catch {}
      }
    }
    // 2) Pins
    for (const p of await getAll('pins')) {
      if (p.synced) continue;
      try {
        await api('/api/pins', { body: { id: p.id, name: p.name, lat: p.lat, lng: p.lng } });
        p.synced = true; await put('pins', p);
      } catch {}
    }
    // 3) Foto's/video's: thumbnail + volledig origineel. Een video groter dan de
    //    serverlimiet blijft lokaal (enkel de poster wordt gedeeld).
    const maxBytes = await this.maxUploadBytes();
    for (const ph of await getAll('photos')) {
      if (ph.synced || !ph.thumb) continue;
      try {
        const form = new FormData();
        form.append('thumb', ph.thumb, ph.id + '.jpg');
        form.append('id', ph.id);
        form.append('kind', ph.kind || 'image');
        if (ph.walkId) form.append('walk_id', ph.walkId);
        if (ph.pinId) form.append('pin_id', ph.pinId);
        if (ph.lat != null) form.append('lat', ph.lat);
        if (ph.lng != null) form.append('lng', ph.lng);
        if (ph.takenAt) form.append('taken_at', ph.takenAt);
        const tooBigVideo = (ph.kind === 'video') && ph.blob && ph.blob.size > maxBytes;
        if (ph.blob && !tooBigVideo) {
          form.append('full', ph.blob, ph.blob.name || (ph.id + (ph.kind === 'video' ? '.mp4' : '.jpg')));
        }
        await api('/api/photos', { form });
        ph.synced = true; await put('photos', ph);
      } catch {}
    }
  },

  _maxBytes: null,
  async maxUploadBytes(){
    if (this._maxBytes != null) return this._maxBytes;
    let mb = 250;
    try { const h = await api('/api/health', { auth: false }); if (h && h.maxUploadMb) mb = h.maxUploadMb; } catch {}
    this._maxBytes = mb * 1024 * 1024;
    return this._maxBytes;
  },

  async fullSync(){ await this.push(); },

  /* ---------- LEZEN (server-eerst, lokale fallback) ---------- */
  async listWalks(){
    if (this.online()) {
      try {
        const me = Auth.getUser() || {};
        return (await api('/api/walks')).map(w => ({
          id: w.id, name: w.name, date: w.date, distance: w.distance, coords: w.coords || [],
          score: w.avg_score || 0, review_count: w.review_count || 0, photo_count: w.photo_count || 0,
          coverUrl: w.cover ? '/uploads/' + w.cover : null, color: w.owner_color || '#2e7d32',
          owner_name: w.owner_name, mine: w.owner_id === me.id, isRemote: true
        }));
      } catch {}
    }
    const myColor = (Auth.getUser() || {}).color || '#2e7d32';
    return (await getAll('walks')).sort((a, b) => b.date - a.date).map(w => ({
      id: w.id, name: w.name, date: w.date, distance: w.distance, coords: w.coords || [],
      score: w.score || 0, coverUrl: null, color: myColor, owner_name: 'Ik', mine: true, isRemote: false
    }));
  },

  async listPins(){
    if (this.online()) {
      try {
        const me = Auth.getUser() || {};
        return (await api('/api/pins')).map(p => ({
          id: p.id, name: p.name, lat: p.lat, lng: p.lng, color: p.owner_color || '#2e7d32',
          owner_name: p.owner_name, mine: p.owner_id === me.id, isRemote: true
        }));
      } catch {}
    }
    const myColor = (Auth.getUser() || {}).color || '#2e7d32';
    return (await getAll('pins')).map(p => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, color: myColor, mine: true, isRemote: false }));
  },

  // Afgehandelde events voor de ranking (server-only).
  async listCompletedEvents(){
    if (!this.online()) return [];
    try {
      return (await api('/api/events')).filter(e => e.status === 'completed').map(e => ({
        id: e.id, name: e.title, date: new Date(e.planned_at).getTime(),
        distance: e.distance || 0, score: e.avg_score || 0, owner: e.creator_name, kind: 'event'
      }));
    } catch { return []; }
  },

  // Detail van één wandeling: server-eerst, anders lokaal.
  async getWalkDetail(id){
    if (this.online()) {
      try {
        const me = Auth.getUser() || {};
        const w = await api('/api/walks/' + id);
        return {
          id: w.id, name: w.name, date: w.date, distance: w.distance,
          durationSec: w.duration, coords: w.coords || [],
          owner_name: w.owner_name, mine: w.owner_id === me.id, isRemote: true,
          photos: (w.photos || []).map(p => ({ id: p.id, url: '/uploads/' + p.thumb, fullUrl: p.full ? '/uploads/' + p.full : null, kind: p.kind || 'image', lat: p.lat, lng: p.lng, caption: p.caption })),
          reviews: w.reviews || [],
          myReview: (w.reviews || []).find(r => r.user_id === me.id) || null
        };
      } catch {}
    }
    const w = await getOne('walks', id);
    if (!w) return null;
    const photos = await photosForWalk(id);
    return {
      id: w.id, name: w.name, date: w.date, distance: w.distance, durationSec: w.durationSec,
      coords: w.coords || [], owner_name: 'Ik', mine: true, isRemote: false,
      photos: photos.map(p => ({ id: p.id, blob: p.blob, thumb: p.thumb, kind: p.kind || 'image', lat: p.lat, lng: p.lng })),
      reviews: [], myReview: w.score ? { score: w.score, text: w.review } : null,
      localScore: w.score || 0, localReview: w.review || ''
    };
  },

  async getPinDetail(id){
    if (this.online()) {
      try {
        const me = Auth.getUser() || {};
        const p = await api('/api/pins/' + id);
        return {
          id: p.id, name: p.name, lat: p.lat, lng: p.lng, owner_name: p.owner_name,
          mine: p.owner_id === me.id, isRemote: true,
          photos: (p.photos || []).map(ph => ({ id: ph.id, url: '/uploads/' + ph.thumb, fullUrl: ph.full ? '/uploads/' + ph.full : null, kind: ph.kind || 'image', lat: ph.lat, lng: ph.lng, caption: ph.caption }))
        };
      } catch {}
    }
    const p = await getOne('pins', id);
    if (!p) return null;
    const photos = await photosForPin(id);
    return { id: p.id, name: p.name, lat: p.lat, lng: p.lng, mine: true, isRemote: false,
      photos: photos.map(ph => ({ id: ph.id, blob: ph.blob, thumb: ph.thumb, kind: ph.kind || 'image', lat: ph.lat, lng: ph.lng })) };
  },

  // Mijn review opslaan: bij een server-wandeling rechtstreeks pushen.
  async saveReviewRemote(walkId, score, text){
    return api('/api/walks/' + walkId + '/review', { method: 'PUT', body: { score, text } });
  },
  async deleteWalkRemote(walkId){ return api('/api/walks/' + walkId, { method: 'DELETE' }); },
  async deletePinRemote(pinId){ return api('/api/pins/' + pinId, { method: 'DELETE' }); }
};

window.Sync = Sync;
