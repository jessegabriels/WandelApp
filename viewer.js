/* viewer.js — in-app mediaviewer (lightbox) voor foto's en video's.
   window.openMediaViewer(items, startIndex)
   item = { kind:'image'|'video', thumbUrl, fullUrl (string|null), blob (Blob|null), caption, name }
   - foto's tonen in volle kwaliteit (klik = in/uitzoomen)
   - video's afspelen met bediening
   - bladeren, downloaden en delen (via de deelfunctie van het toestel) */

'use strict';

const Viewer = (function(){
  let items = [], idx = 0;
  const el = (id) => document.getElementById(id);

  function open(list, start){
    items = Array.isArray(list) ? list : [];
    idx = start || 0;
    if (!items.length || !el('viewer')) return;
    el('viewer').hidden = false;
    render();
  }
  function close(){
    const s = el('viewer-stage'); if (s) s.innerHTML = '';
    if (el('viewer')) el('viewer').hidden = true;
  }
  function render(){
    const it = items[idx]; if (!it) return;
    const stage = el('viewer-stage'); stage.innerHTML = '';
    if (it.kind === 'video') {
      const src = it.fullUrl || (it.blob ? URL.createObjectURL(it.blob) : null);
      if (src) {
        const v = document.createElement('video');
        v.src = src; v.controls = true; v.playsInline = true; v.className = 'viewer-media';
        stage.appendChild(v);
      } else {
        const wrap = document.createElement('div'); wrap.className = 'viewer-missing';
        if (it.thumbUrl) { const img = document.createElement('img'); img.src = it.thumbUrl; img.className = 'viewer-media'; wrap.appendChild(img); }
        const p = document.createElement('p');
        p.textContent = 'Deze video staat op het toestel van de maker en is hier niet beschikbaar.';
        wrap.appendChild(p); stage.appendChild(wrap);
      }
    } else {
      const img = document.createElement('img');
      img.src = it.fullUrl || it.thumbUrl; img.className = 'viewer-media';
      img.addEventListener('click', () => img.classList.toggle('zoomed'));
      stage.appendChild(img);
    }
    el('viewer-info').textContent = (idx + 1) + ' / ' + items.length + (it.caption ? ' · ' + it.caption : '');
    const multi = items.length > 1 ? 'visible' : 'hidden';
    el('viewer-prev').style.visibility = multi;
    el('viewer-next').style.visibility = multi;
  }
  function prev(){ idx = (idx - 1 + items.length) % items.length; render(); }
  function next(){ idx = (idx + 1) % items.length; render(); }

  function fileName(it){ return (it.name || 'media') + (it.kind === 'video' ? '.mp4' : '.jpg'); }
  function triggerDownload(href, name){
    const a = document.createElement('a'); a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function download(){
    const it = items[idx]; if (!it) return;
    if (it.blob) { const u = URL.createObjectURL(it.blob); triggerDownload(u, fileName(it)); setTimeout(() => URL.revokeObjectURL(u), 2000); }
    else { const url = it.fullUrl || it.thumbUrl; if (url) triggerDownload(url, fileName(it)); }
  }
  async function currentFile(){
    const it = items[idx];
    if (it.blob) return new File([it.blob], fileName(it), { type: it.blob.type || (it.kind === 'video' ? 'video/mp4' : 'image/jpeg') });
    const url = it.fullUrl || it.thumbUrl; if (!url) return null;
    const r = await fetch(url); const b = await r.blob();
    return new File([b], fileName(it), { type: b.type });
  }
  async function share(){
    try {
      const f = await currentFile();
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: 'HikeLog' });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    download(); // fallback wanneer delen niet kan
  }

  function wire(){
    const root = el('viewer');
    if (!root || root.dataset.wired) return;
    root.dataset.wired = '1';
    el('viewer-close').addEventListener('click', close);
    el('viewer-prev').addEventListener('click', prev);
    el('viewer-next').addEventListener('click', next);
    el('viewer-download').addEventListener('click', download);
    el('viewer-share').addEventListener('click', share);
    root.addEventListener('click', (e) => { if (e.target.id === 'viewer') close(); });
    document.addEventListener('keydown', (e) => {
      if (root.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    });
  }
  wire();
  return { open };
})();

window.openMediaViewer = (list, i) => Viewer.open(list, i);
