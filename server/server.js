/* WandelApp backend — zelf-gehoste server (Node + Express + SQLite).
   Functies: accounts (JWT, met uitnodigingscode), wandelingen, foto-thumbnails
   (hybride opslag), gepinde locaties, en events met RSVP. Serveert ook de PWA.

   Starten:  npm install  &&  npm start
   Config via omgevingsvariabelen (optioneel):
     PORT          (standaard 3000)
     JWT_SECRET    (sterk geheim; wordt anders gegenereerd en bewaard)
     INVITE_CODE   (registratiecode; wordt anders gegenereerd en getoond)
     CLIENT_DIR    (map met de frontend; standaard de bovenliggende map)
*/

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { db, engine } = require('./db');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = process.env.CLIENT_DIR || path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* JWT-geheim: env, of genereer en bewaar lokaal. */
const SECRET_FILE = path.join(DATA_DIR, 'jwt-secret');
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (fs.existsSync(SECRET_FILE)) JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  else { JWT_SECRET = crypto.randomBytes(48).toString('hex'); fs.writeFileSync(SECRET_FILE, JWT_SECRET); }
}

/* Uitnodigingscode: env, of genereer en bewaar (zodat registratie nooit open staat). */
const INVITE_FILE = path.join(DATA_DIR, 'invite-code');
let INVITE_CODE = process.env.INVITE_CODE;
if (!INVITE_CODE) {
  if (fs.existsSync(INVITE_FILE)) INVITE_CODE = fs.readFileSync(INVITE_FILE, 'utf8').trim();
  else { INVITE_CODE = crypto.randomBytes(4).toString('hex'); fs.writeFileSync(INVITE_FILE, INVITE_CODE); }
}

const uid = () => crypto.randomBytes(9).toString('base64url');
const now = () => Date.now();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

/* ---------- Auth ---------- */
const sign = (u) => jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: '180d' });
const pub = (u) => u && ({ id: u.id, username: u.username, display_name: u.display_name, color: u.color });
const safeJson = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
function routeLen(coords){
  let d = 0; const R = 6371000, rad = (x) => x * Math.PI / 180;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i-1], b = coords[i];
    const dLat = rad(b[0]-a[0]), dLng = rad(b[1]-a[1]);
    const s = Math.sin(dLat/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLng/2)**2;
    d += 2 * R * Math.asin(Math.sqrt(s));
  }
  return d;
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Niet ingelogd' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT id, username, display_name, color FROM users WHERE id = ?').get(payload.id);
    if (!u) return res.status(401).json({ error: 'Onbekende gebruiker' });
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'Sessie ongeldig of verlopen' });
  }
}

/* ---------- Accounts ---------- */
app.post('/api/register', (req, res) => {
  const { username, display_name, password, invite_code } = req.body || {};
  if (!invite_code || invite_code.trim() !== INVITE_CODE) return res.status(403).json({ error: 'Ongeldige uitnodigingscode' });
  if (!username || !password) return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord verplicht' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Wachtwoord minstens 6 tekens' });
  const uname = String(username).toLowerCase().trim();
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(uname)) return res.status(409).json({ error: 'Gebruikersnaam bestaat al' });
  const hash = bcrypt.hashSync(String(password), 10);
  const palette = ['#2e7d32','#1565c0','#c62828','#6a1b9a','#ef6c00','#00838f','#ad1457','#558b00'];
  const color = palette[db.prepare('SELECT COUNT(*) AS c FROM users').get().c % palette.length];
  const info = db.prepare('INSERT INTO users (username, display_name, password_hash, color, created_at) VALUES (?,?,?,?,?)')
    .run(uname, display_name || username, hash, color, now());
  const user = { id: Number(info.lastInsertRowid), username: uname, display_name: display_name || username, color };
  res.json({ token: sign(user), user });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').toLowerCase().trim());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) {
    return res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord' });
  }
  res.json({ token: sign(u), user: pub(u) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: pub(req.user) }));
app.get('/api/users', auth, (req, res) =>
  res.json(db.prepare('SELECT id, username, display_name, color FROM users ORDER BY display_name').all()));

// Profiel bijwerken (weergavenaam, kleur)
app.put('/api/me', auth, (req, res) => {
  const { display_name, color } = req.body || {};
  if (display_name) db.prepare('UPDATE users SET display_name=? WHERE id=?').run(String(display_name).trim(), req.user.id);
  if (color) db.prepare('UPDATE users SET color=? WHERE id=?').run(String(color), req.user.id);
  res.json({ user: db.prepare('SELECT id, username, display_name, color FROM users WHERE id=?').get(req.user.id) });
});
// Wachtwoord wijzigen
app.put('/api/me/password', auth, (req, res) => {
  const current = req.body && req.body.current;
  const next = req.body && req.body.new;
  if (!next || String(next).length < 6) return res.status(400).json({ error: 'Nieuw wachtwoord minstens 6 tekens' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(String(current || ''), row.password_hash)) return res.status(403).json({ error: 'Huidig wachtwoord klopt niet' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(next), 10), req.user.id);
  res.json({ ok: true });
});

/* ---------- Wandelingen (gedeeld binnen de groep) ---------- */
const WALK_LIST_SQL = `
  SELECT w.*, u.display_name AS owner_name, u.color AS owner_color,
    (SELECT COUNT(*) FROM photos p WHERE p.walk_id = w.id) AS photo_count,
    (SELECT COUNT(*) FROM reviews r WHERE r.walk_id = w.id) AS review_count,
    (SELECT ROUND(AVG(score),2) FROM reviews r WHERE r.walk_id = w.id) AS avg_score,
    (SELECT thumb FROM photos p WHERE p.walk_id = w.id ORDER BY rowid LIMIT 1) AS cover
  FROM walks w JOIN users u ON u.id = w.owner_id
  ORDER BY w.date DESC`;

app.get('/api/walks', auth, (req, res) => {
  res.json(db.prepare(WALK_LIST_SQL).all().map(w => ({ ...w, coords: JSON.parse(w.coords) })));
});

app.post('/api/walks', auth, (req, res) => {
  const { id, name, date, coords, distance, duration } = req.body || {};
  const wid = id || uid();
  if (db.prepare('SELECT 1 FROM walks WHERE id = ?').get(wid)) return res.json({ id: wid, existed: true });
  db.prepare('INSERT INTO walks (id, owner_id, name, date, coords, distance, duration, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(wid, req.user.id, name || 'Naamloze wandeling', date || now(), JSON.stringify(coords || []), distance || 0, duration || 0, now());
  res.json({ id: wid });
});

app.get('/api/walks/:id', auth, (req, res) => {
  const w = db.prepare('SELECT w.*, u.display_name AS owner_name, u.color AS owner_color FROM walks w JOIN users u ON u.id=w.owner_id WHERE w.id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Niet gevonden' });
  w.coords = JSON.parse(w.coords);
  w.photos = db.prepare('SELECT id, owner_id, thumb, lat, lng, caption, taken_at FROM photos WHERE walk_id=? ORDER BY rowid').all(req.params.id);
  w.reviews = db.prepare('SELECT r.*, u.display_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.walk_id=?').all(req.params.id);
  res.json(w);
});

app.delete('/api/walks/:id', auth, (req, res) => {
  const w = db.prepare('SELECT * FROM walks WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Niet gevonden' });
  if (w.owner_id !== req.user.id) return res.status(403).json({ error: 'Alleen de eigenaar mag verwijderen' });
  db.prepare('SELECT thumb FROM photos WHERE walk_id=?').all(req.params.id).forEach(p => fs.rm(path.join(UPLOAD_DIR, p.thumb), () => {}));
  db.prepare('DELETE FROM walks WHERE id=?').run(req.params.id); // cascade verwijdert foto's/reviews
  res.json({ ok: true });
});

// Review + score per gebruiker; ranking = gemiddelde.
app.put('/api/walks/:id/review', auth, (req, res) => {
  if (!db.prepare('SELECT 1 FROM walks WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Niet gevonden' });
  const s = Math.max(1, Math.min(5, parseInt(req.body && req.body.score, 10) || 0));
  const text = (req.body && req.body.text) || '';
  db.prepare(`INSERT INTO reviews (walk_id, user_id, score, text, updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(walk_id, user_id) DO UPDATE SET score=excluded.score, text=excluded.text, updated_at=excluded.updated_at`)
    .run(req.params.id, req.user.id, s, text, now());
  res.json({ ok: true });
});

/* ---------- Gepinde locaties ---------- */
app.get('/api/pins', auth, (req, res) => {
  res.json(db.prepare(`SELECT p.*, u.display_name AS owner_name, u.color AS owner_color,
      (SELECT COUNT(*) FROM photos ph WHERE ph.pin_id=p.id) AS photo_count,
      (SELECT thumb FROM photos ph WHERE ph.pin_id=p.id ORDER BY rowid LIMIT 1) AS cover
    FROM pins p JOIN users u ON u.id=p.owner_id ORDER BY p.created_at DESC`).all());
});
app.post('/api/pins', auth, (req, res) => {
  const { id, name, lat, lng } = req.body || {};
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat/lng verplicht' });
  const pid = id || uid();
  if (db.prepare('SELECT 1 FROM pins WHERE id=?').get(pid)) return res.json({ id: pid, existed: true });
  db.prepare('INSERT INTO pins (id, owner_id, name, lat, lng, created_at) VALUES (?,?,?,?,?,?)')
    .run(pid, req.user.id, name || 'Gepinde plek', lat, lng, now());
  res.json({ id: pid });
});
app.get('/api/pins/:id', auth, (req, res) => {
  const p = db.prepare('SELECT p.*, u.display_name AS owner_name, u.color AS owner_color FROM pins p JOIN users u ON u.id=p.owner_id WHERE p.id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Niet gevonden' });
  p.photos = db.prepare('SELECT id, owner_id, thumb, lat, lng, caption, taken_at FROM photos WHERE pin_id=? ORDER BY rowid').all(req.params.id);
  res.json(p);
});
app.delete('/api/pins/:id', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM pins WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Niet gevonden' });
  if (p.owner_id !== req.user.id) return res.status(403).json({ error: 'Alleen de eigenaar mag verwijderen' });
  db.prepare('SELECT thumb FROM photos WHERE pin_id=?').all(req.params.id).forEach(ph => fs.rm(path.join(UPLOAD_DIR, ph.thumb), () => {}));
  db.prepare('DELETE FROM pins WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Foto-thumbnails (origineel blijft op het toestel) ---------- */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, uid() + '.jpg')
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.post('/api/photos', auth, upload.single('thumb'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Geen afbeelding ontvangen' });
  const b = req.body || {};
  const id = b.id || uid();
  if (db.prepare('SELECT 1 FROM photos WHERE id=?').get(id)) {
    fs.rm(path.join(UPLOAD_DIR, req.file.filename), () => {});
    return res.json({ id, existed: true });
  }
  db.prepare('INSERT INTO photos (id, owner_id, walk_id, pin_id, thumb, lat, lng, caption, taken_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, req.user.id, b.walk_id || null, b.pin_id || null, req.file.filename,
      b.lat != null && b.lat !== '' ? Number(b.lat) : null,
      b.lng != null && b.lng !== '' ? Number(b.lng) : null,
      b.caption || '', b.taken_at ? Number(b.taken_at) : null);
  res.json({ id, thumb: req.file.filename, url: '/uploads/' + req.file.filename });
});

/* ---------- Events met RSVP ---------- */
app.get('/api/events', auth, (req, res) => {
  res.json(db.prepare(`SELECT e.*, u.display_name AS creator_name,
      (SELECT COUNT(*) FROM rsvps r WHERE r.event_id=e.id AND r.status='going') AS going_count,
      (SELECT status FROM rsvps r WHERE r.event_id=e.id AND r.user_id=?) AS my_rsvp,
      (SELECT ROUND(AVG(score),2) FROM event_reviews er WHERE er.event_id=e.id) AS avg_score,
      (SELECT COUNT(*) FROM event_reviews er WHERE er.event_id=e.id) AS review_count
    FROM events e JOIN users u ON u.id=e.creator_id ORDER BY e.planned_at ASC`).all(req.user.id)
    .map(e => ({ ...e, route: safeJson(e.route) })));
});

app.post('/api/events', auth, (req, res) => {
  const { title, description, walk_id, planned_at, lat, lng, route } = req.body || {};
  if (!title || !planned_at) return res.status(400).json({ error: 'Titel en datum/tijd verplicht' });
  const id = uid();
  const rt = Array.isArray(route) ? route : [];
  const dist = (req.body && req.body.distance != null) ? Number(req.body.distance) : routeLen(rt);
  db.prepare('INSERT INTO events (id, creator_id, title, description, walk_id, planned_at, lat, lng, route, distance, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, req.user.id, title, description || '', walk_id || null, planned_at, lat != null ? lat : null, lng != null ? lng : null, JSON.stringify(rt), dist, now());
  db.prepare('INSERT INTO rsvps (event_id, user_id, status, responded_at) VALUES (?,?,?,?)').run(id, req.user.id, 'going', now());
  res.json({ id });
});

app.get('/api/events/:id', auth, (req, res) => {
  const e = db.prepare('SELECT e.*, u.display_name AS creator_name FROM events e JOIN users u ON u.id=e.creator_id WHERE e.id=?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Niet gevonden' });
  e.route = safeJson(e.route);
  e.rsvps = db.prepare('SELECT r.status, r.responded_at, u.id AS user_id, u.display_name FROM rsvps r JOIN users u ON u.id=r.user_id WHERE r.event_id=? ORDER BY u.display_name').all(req.params.id);
  e.my_rsvp = (db.prepare('SELECT status FROM rsvps WHERE event_id=? AND user_id=?').get(req.params.id, req.user.id) || {}).status || null;
  e.reviews = db.prepare('SELECT er.score, er.text, er.updated_at, u.id AS user_id, u.display_name FROM event_reviews er JOIN users u ON u.id=er.user_id WHERE er.event_id=? ORDER BY u.display_name').all(req.params.id);
  e.avg_score = (db.prepare('SELECT ROUND(AVG(score),2) AS a FROM event_reviews WHERE event_id=?').get(req.params.id) || {}).a || null;
  e.my_review = db.prepare('SELECT score, text FROM event_reviews WHERE event_id=? AND user_id=?').get(req.params.id, req.user.id) || null;
  res.json(e);
});

// Organisator: event afsluiten ('uitgevoerd')
app.put('/api/events/:id/complete', auth, (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Niet gevonden' });
  if (e.creator_id !== req.user.id) return res.status(403).json({ error: 'Alleen de organisator kan afsluiten' });
  db.prepare("UPDATE events SET status='completed' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Organisator: route (achteraf) instellen — bv. op basis van de afgelegde route
app.put('/api/events/:id/route', auth, (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Niet gevonden' });
  if (e.creator_id !== req.user.id) return res.status(403).json({ error: 'Alleen de organisator kan de route instellen' });
  const rt = Array.isArray(req.body && req.body.route) ? req.body.route : [];
  const dist = (req.body && req.body.distance != null) ? Number(req.body.distance) : routeLen(rt);
  db.prepare('UPDATE events SET route=?, distance=? WHERE id=?').run(JSON.stringify(rt), dist, req.params.id);
  res.json({ ok: true });
});

// Deelnemer (met 'going') scoort/reviewt een afgehandeld event
app.put('/api/events/:id/review', auth, (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Niet gevonden' });
  if (e.status !== 'completed') return res.status(403).json({ error: 'Je kunt pas scoren nadat het event is afgesloten' });
  const rsvp = db.prepare('SELECT status FROM rsvps WHERE event_id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!rsvp || rsvp.status !== 'going') return res.status(403).json({ error: 'Alleen wie meeging, kan scoren' });
  const s = Math.max(1, Math.min(5, parseInt(req.body && req.body.score, 10) || 0));
  const text = (req.body && req.body.text) || '';
  db.prepare(`INSERT INTO event_reviews (event_id, user_id, score, text, updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(event_id, user_id) DO UPDATE SET score=excluded.score, text=excluded.text, updated_at=excluded.updated_at`)
    .run(req.params.id, req.user.id, s, text, now());
  res.json({ ok: true });
});

app.post('/api/events/:id/rsvp', auth, (req, res) => {
  const status = req.body && req.body.status;
  if (!['going', 'maybe', 'declined'].includes(status)) return res.status(400).json({ error: 'Ongeldige status' });
  const ev = db.prepare('SELECT status FROM events WHERE id=?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Niet gevonden' });
  if (ev.status === 'completed') return res.status(403).json({ error: 'Dit event is afgehandeld; je kunt niet meer reageren' });
  db.prepare(`INSERT INTO rsvps (event_id, user_id, status, responded_at) VALUES (?,?,?,?)
    ON CONFLICT(event_id, user_id) DO UPDATE SET status=excluded.status, responded_at=excluded.responded_at`)
    .run(req.params.id, req.user.id, status, now());
  res.json({ ok: true });
});

app.delete('/api/events/:id', auth, (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Niet gevonden' });
  if (e.creator_id !== req.user.id) return res.status(403).json({ error: 'Alleen de organisator mag verwijderen' });
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Statisch + start ---------- */
app.get('/api/health', (req, res) => res.json({ ok: true, time: now(), engine }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(CLIENT_DIR));

app.listen(PORT, () => {
  console.log(`WandelApp-server draait op http://localhost:${PORT}  (opslag: ${engine})`);
  console.log(`Frontend vanuit: ${CLIENT_DIR}`);
  console.log(`Uitnodigingscode voor registratie: ${INVITE_CODE}`);
});
