/* push.js — web push-meldingen aan/uit zetten.
   Vraagt toestemming, abonneert via de service worker en registreert het
   abonnement bij de server. De server stuurt een melding bij een nieuw event. */

'use strict';

const Push = {
  supported(){
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  async status(){
    if (!this.supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub ? 'on' : 'off';
    } catch { return 'off'; }
  },

  async enable(){
    if (!this.supported()) throw new Error('Meldingen worden niet ondersteund op dit toestel of in deze browser.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Geen toestemming gegeven voor meldingen.');
    const reg = await navigator.serviceWorker.ready;
    const r = await api('/api/push/key');
    if (!r || !r.key) throw new Error('De server heeft geen push-sleutel beschikbaar.');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(r.key)
      });
    }
    await api('/api/push/subscribe', { body: { subscription: sub } });
    return true;
  },

  async disable(){
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('/api/push/unsubscribe', { body: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
    } catch {}
  }
};

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

window.Push = Push;
