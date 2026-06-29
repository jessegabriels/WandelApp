/* Databaselaag — SQLite.
   Adapter: gebruikt better-sqlite3 wanneer beschikbaar (jouw Windows-server),
   en valt anders automatisch terug op Node's ingebouwde node:sqlite. Beide
   delen dezelfde SQLite-engine en (vrijwel) dezelfde API, dus de SQL hieronder
   is identiek. Eén databasebestand: data/wandelapp.db */

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'wandelapp.db');

let db, engine;
try {
  const Better = require('better-sqlite3');
  db = new Better(DB_FILE);
  engine = 'better-sqlite3';
} catch (e) {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_FILE);
  engine = 'node:sqlite';
}

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS walks (
  id         TEXT PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  date       INTEGER NOT NULL,
  coords     TEXT NOT NULL DEFAULT '[]',
  distance   REAL NOT NULL DEFAULT 0,
  duration   REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  walk_id    TEXT NOT NULL REFERENCES walks(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (walk_id, user_id)
);

CREATE TABLE IF NOT EXISTS pins (
  id         TEXT PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id        TEXT PRIMARY KEY,
  owner_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  walk_id   TEXT REFERENCES walks(id) ON DELETE CASCADE,
  pin_id    TEXT REFERENCES pins(id) ON DELETE CASCADE,
  thumb     TEXT NOT NULL,
  lat       REAL,
  lng       REAL,
  caption   TEXT NOT NULL DEFAULT '',
  taken_at  INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  creator_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  walk_id     TEXT REFERENCES walks(id) ON DELETE SET NULL,
  planned_at  TEXT NOT NULL,
  lat         REAL,
  lng         REAL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rsvps (
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  responded_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS event_reviews (
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sub        TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_photos_walk ON photos(walk_id);
CREATE INDEX IF NOT EXISTS idx_photos_pin  ON photos(pin_id);
CREATE INDEX IF NOT EXISTS idx_reviews_walk ON reviews(walk_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_walks_owner ON walks(owner_id);
`);

/* Migraties voor bestaande databases: voeg kolommen toe als ze nog ontbreken. */
function addColumn(table, col, def){
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch (e) { /* bestaat al */ }
}
addColumn('users', 'color', "TEXT NOT NULL DEFAULT '#2e7d32'");
addColumn('events', 'route', "TEXT NOT NULL DEFAULT '[]'");
addColumn('events', 'distance', "REAL NOT NULL DEFAULT 0");
addColumn('events', 'status', "TEXT NOT NULL DEFAULT 'planned'");
addColumn('photos', 'full', 'TEXT');
addColumn('photos', 'kind', "TEXT NOT NULL DEFAULT 'image'");

module.exports = { db, engine };
