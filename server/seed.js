/* seed.js — vult de database met dummy-data om de ranking en reviews te testen.
   Maakt dummygebruikers, enkele afgehandelde events (met route + scores) en een
   paar losse wandelingen. Alle bestaande gebruikers worden als deelnemer ('going')
   op de events gezet, zodat je met je eigen account ook kunt scoren.

   Uitvoeren (in de map server):  node seed.js
   Herhaalbaar: bestaande seed-data (id's met 'seed-') wordt eerst verwijderd.

   Dummygebruikers: sven, lotte, tom  — wachtwoord: wandel123
*/

const bcrypt = require('bcryptjs');
const { db, engine } = require('./db');

const now = Date.now();
const DAY = 86400000;
const iso = (ts) => new Date(ts).toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:mm'

function routeLen(c){
  let d = 0; const R = 6371000, r = (x) => x * Math.PI / 180;
  for (let i = 1; i < c.length; i++) {
    const a = c[i-1], b = c[i], dLa = r(b[0]-a[0]), dLn = r(b[1]-a[1]);
    const s = Math.sin(dLa/2)**2 + Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dLn/2)**2;
    d += 2 * R * Math.asin(Math.sqrt(s));
  }
  return d;
}
function makeRoute(lat, lng, n){
  const r = [];
  for (let i = 0; i < n; i++) r.push([lat + i * 0.0022, lng + (i % 2 ? 0.0016 : -0.0011)]);
  return r;
}

const pwHash = bcrypt.hashSync('wandel123', 10);
const dummies = [
  { username: 'sven',  display_name: 'Sven',  color: '#1565c0' },
  { username: 'lotte', display_name: 'Lotte', color: '#c62828' },
  { username: 'tom',   display_name: 'Tom',   color: '#6a1b9a' }
];
const ids = {};
for (const u of dummies) {
  const row = db.prepare('SELECT id FROM users WHERE username=?').get(u.username);
  if (row) { ids[u.username] = row.id; }
  else {
    const info = db.prepare('INSERT INTO users (username, display_name, password_hash, color, created_at) VALUES (?,?,?,?,?)')
      .run(u.username, u.display_name, pwHash, u.color, now);
    ids[u.username] = Number(info.lastInsertRowid);
  }
}

// Vorige seed-data opruimen (cascade verwijdert reviews/rsvps).
db.prepare("DELETE FROM events WHERE id LIKE 'seed-%'").run();
db.prepare("DELETE FROM walks WHERE id LIKE 'seed-%'").run();

const allUsers = db.prepare('SELECT id FROM users').all().map(r => r.id);

const events = [
  { id: 'seed-ev1', title: 'Bos van de Merode',      creator: 'sven',  daysAgo: 20, route: makeRoute(51.170, 4.740, 8),  reviews: { sven: 5, lotte: 4, tom: 5 } },
  { id: 'seed-ev2', title: 'Langs de Nete',          creator: 'lotte', daysAgo: 12, route: makeRoute(51.150, 4.700, 6),  reviews: { sven: 3, lotte: 4, tom: 4 } },
  { id: 'seed-ev3', title: 'Kasteelroute Herenthout', creator: 'tom',  daysAgo: 5,  route: makeRoute(51.182, 4.752, 10), reviews: { sven: 4, lotte: 5 } }
];
for (const ev of events) {
  const dist = routeLen(ev.route);
  db.prepare('INSERT INTO events (id, creator_id, title, description, walk_id, planned_at, lat, lng, route, distance, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(ev.id, ids[ev.creator], ev.title, 'Dummywandeling om de ranking en reviews te testen.', null,
      iso(now - ev.daysAgo * DAY), ev.route[0][0], ev.route[0][1], JSON.stringify(ev.route), dist, 'completed', now - ev.daysAgo * DAY);
  for (const uid of allUsers)
    db.prepare('INSERT OR REPLACE INTO rsvps (event_id, user_id, status, responded_at) VALUES (?,?,?,?)').run(ev.id, uid, 'going', now);
  for (const [uname, score] of Object.entries(ev.reviews))
    db.prepare('INSERT OR REPLACE INTO event_reviews (event_id, user_id, score, text, updated_at) VALUES (?,?,?,?,?)')
      .run(ev.id, ids[uname], score, 'Mooie wandeling!', now);
}

const walks = [
  { id: 'seed-w1', owner: 'sven',  name: 'Avondwandeling', daysAgo: 30, route: makeRoute(51.160, 4.720, 7), reviews: { sven: 4, lotte: 5 } },
  { id: 'seed-w2', owner: 'lotte', name: 'Zondagse lus',   daysAgo: 8,  route: makeRoute(51.190, 4.760, 9), reviews: { tom: 5 } }
];
for (const w of walks) {
  const dist = routeLen(w.route);
  db.prepare('INSERT INTO walks (id, owner_id, name, date, coords, distance, duration, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(w.id, ids[w.owner], w.name, now - w.daysAgo * DAY, JSON.stringify(w.route), dist, 3600, now);
  for (const [uname, score] of Object.entries(w.reviews))
    db.prepare('INSERT OR REPLACE INTO reviews (walk_id, user_id, score, text, updated_at) VALUES (?,?,?,?,?)')
      .run(w.id, ids[uname], score, 'Top!', now);
}

console.log(`Seed klaar (opslag: ${engine}).`);
console.log(`Dummygebruikers: sven, lotte, tom — wachtwoord: wandel123`);
console.log(`Afgehandelde events: ${events.length}, losse wandelingen: ${walks.length}.`);
console.log(`Alle bestaande gebruikers staan als deelnemer ingesteld, zodat je met je eigen account ook kunt scoren.`);
