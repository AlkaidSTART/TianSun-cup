import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(currentDir, '..', 'data')
const defaultDatabaseFile = path.resolve(dataDir, 'tiansun.sqlite')
const defaultSeedFile = path.resolve(dataDir, 'livestock.seed.json')
const legacySeedFile = path.resolve(dataDir, 'livestock.json')

export const databaseFile = process.env.LIVESTOCK_DB_FILE
  ? path.resolve(process.env.LIVESTOCK_DB_FILE)
  : defaultDatabaseFile

export const seedFile = process.env.LIVESTOCK_SEED_FILE
  ? path.resolve(process.env.LIVESTOCK_SEED_FILE)
  : (fs.existsSync(defaultSeedFile) ? defaultSeedFile : legacySeedFile)

fs.mkdirSync(path.dirname(databaseFile), { recursive: true })

export const db = new DatabaseSync(databaseFile)
// Authentication tables are created before business tables so ownership columns
// can safely reference users in both fresh and existing databases.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    display_name TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

  CREATE TABLE IF NOT EXISTS auth_login_attempts (
    attempt_key TEXT PRIMARY KEY,
    failures INTEGER NOT NULL,
    window_started_at TEXT NOT NULL,
    blocked_until TEXT
  );
`)

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS livestock (
    id TEXT PRIMARY KEY,
    species TEXT NOT NULL,
    breed TEXT NOT NULL,
    sex TEXT NOT NULL CHECK (sex IN ('female', 'male')),
    source_type TEXT NOT NULL CHECK (source_type IN ('purchased', 'born')),
    mother_id TEXT REFERENCES livestock(id) ON UPDATE CASCADE ON DELETE SET NULL,
    birth_date TEXT,
    purchase_date TEXT,
    supplier TEXT,
    purchase_price REAL,
    pasture_id TEXT NOT NULL,
    pasture_name TEXT NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'attention', 'abnormal', 'offline')),
    temperature REAL,
    heart_rate INTEGER,
    steps INTEGER,
    rumination INTEGER,
    last_report_at TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_livestock_status ON livestock(status);
  CREATE INDEX IF NOT EXISTS idx_livestock_source_type ON livestock(source_type);
  CREATE INDEX IF NOT EXISTS idx_livestock_mother_id ON livestock(mother_id);
  CREATE INDEX IF NOT EXISTS idx_livestock_pasture_id ON livestock(pasture_id);
  CREATE INDEX IF NOT EXISTS idx_livestock_updated_at ON livestock(updated_at DESC);

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('rotation', 'inspection', 'vaccination', 'maintenance', 'device', 'custom')),
    todo_date TEXT NOT NULL,
    todo_time TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    tone TEXT NOT NULL CHECK (tone IN ('ok', 'warn')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_todos_date_time ON todos(todo_date, todo_time);
  CREATE INDEX IF NOT EXISTS idx_todos_type ON todos(type);

  UPDATE todos SET status = '待办', tone = 'warn' WHERE status <> '已完成';
`)


function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((entry) => entry.name === column)
}

if (!hasColumn('livestock', 'user_id')) {
  db.exec('ALTER TABLE livestock ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE RESTRICT')
}
if (!hasColumn('todos', 'user_id')) {
  db.exec('ALTER TABLE todos ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE RESTRICT')
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_livestock_user_id ON livestock(user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_user_date_time ON todos(user_id, todo_date, todo_time, id);
`)

// Pasture management units. `area_code` maps a unit to the 3D screen's ecological
// zone (area-a..area-d) purely for backend bookkeeping; it is never returned by
// the API. See docs/api-contract.md section 1.
db.exec(`
  CREATE TABLE IF NOT EXISTS pastures (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    area_code TEXT NOT NULL,
    area_size REAL NOT NULL,
    quality TEXT NOT NULL CHECK (quality IN ('excellent', 'fair', 'poor', 'closed')),
    capacity INTEGER NOT NULL CHECK (capacity >= 0),
    coverage REAL NOT NULL DEFAULT 0,
    grass_height REAL,
    soil_moisture REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

// Daily pressure snapshots feed the "near 7 days" chart. A day with no visit
// has no row, so history starts when the feature ships rather than being
// back-filled with invented numbers.
db.exec(`
  CREATE TABLE IF NOT EXISTS pasture_pressure_daily (
    pasture_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    pressure REAL NOT NULL,
    current_load INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (pasture_id, snapshot_date)
  );
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS livestock_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    livestock_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    longitude REAL NOT NULL,
    latitude REAL NOT NULL,
    temperature REAL,
    heart_rate INTEGER,
    steps INTEGER,
    rumination INTEGER,
    health_status TEXT CHECK (health_status IN ('normal', 'attention', 'abnormal')),
    source TEXT NOT NULL DEFAULT 'device',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_telemetry_livestock_time
    ON livestock_telemetry(livestock_id, recorded_at DESC);

  -- A sample is only meaningful for a livestock record that exists.
  CREATE TRIGGER IF NOT EXISTS telemetry_require_livestock_insert
  BEFORE INSERT ON livestock_telemetry
  WHEN NOT EXISTS (SELECT 1 FROM livestock WHERE livestock.id = NEW.livestock_id)
  BEGIN SELECT RAISE(ABORT, 'livestock_telemetry requires an existing livestock record'); END;
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('temperature', 'pressure', 'device')),
    severity TEXT NOT NULL CHECK (severity IN ('bad', 'warn', 'off')),
    target_type TEXT NOT NULL CHECK (target_type IN ('livestock', 'pasture')),
    target_id TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'handling', 'resolved')),
    rule_key TEXT NOT NULL,
    resolved_at TEXT,
    triggered_at TEXT NOT NULL,
    handled_by TEXT,
    handled_by_name TEXT,
    handled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_open_rule
    ON alerts(user_id, target_type, target_id, rule_key) WHERE resolved_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON alerts(triggered_at DESC);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    livestock_id TEXT,
    pasture_id TEXT,
    symptoms TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'answered', 'closed')),
    doctor_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS consultation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('doctor', 'user')),
    author_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_consult_messages
    ON consultation_messages(consultation_id, created_at);
`)

db.exec('PRAGMA user_version = 2;')
const insertStatement = db.prepare(`
  INSERT INTO livestock (
    id, species, breed, sex, source_type, mother_id, birth_date, purchase_date,
    supplier, purchase_price, pasture_id, pasture_name, owner, status, temperature,
    heart_rate, steps, rumination, last_report_at, notes, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateMotherStatement = db.prepare('UPDATE livestock SET mother_id = ? WHERE id = ?')

function insertRecord(record, includeMother = true, userId = null) {
  const now = new Date().toISOString()
  insertStatement.run(
    record.id,
    record.species || '牦牛',
    record.breed,
    record.sex,
    record.sourceType,
    includeMother ? record.motherId || null : null,
    record.birthDate || null,
    record.purchaseDate || null,
    record.supplier || null,
    record.purchasePrice ?? null,
    record.pastureId,
    record.pastureName,
    record.owner || '未分配',
    record.status || 'normal',
    record.temperature ?? null,
    record.heartRate ?? null,
    record.steps ?? null,
    record.rumination ?? null,
    record.lastReportAt || null,
    record.notes || '',
    record.createdAt || now,
    record.updatedAt || record.createdAt || now,
  )
}

function importSeedData() {
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM livestock').get().count)
  if (count > 0 || !fs.existsSync(seedFile)) return

  const parsed = JSON.parse(fs.readFileSync(seedFile, 'utf8'))
  const records = Array.isArray(parsed.livestock) ? parsed.livestock : []
  if (records.length === 0) return

  db.exec('BEGIN')
  try {
    for (const record of records) insertRecord(record, false)
    for (const record of records) {
      if (record.motherId) updateMotherStatement.run(record.motherId, record.id)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

importSeedData()

// Default pasture units. `/api/meta/options` must keep returning exactly these
// ids, names and order, so they are seeded once and then owned by the table.
const defaultPastures = [
  { id: 'P-A-01', name: '东沟草场', areaCode: 'area-a', areaSize: 320, quality: 'excellent', capacity: 60, coverage: 0.75, grassHeight: 18, soilMoisture: 0.42, sortOrder: 1 },
  { id: 'P-A-02', name: '北坡草场', areaCode: 'area-b', areaSize: 210, quality: 'fair', capacity: 48, coverage: 0.58, grassHeight: 12, soilMoisture: 0.31, sortOrder: 2 },
  { id: 'P-A-03', name: '河谷草场', areaCode: 'area-c', areaSize: 280, quality: 'excellent', capacity: 55, coverage: 0.82, grassHeight: 21, soilMoisture: 0.55, sortOrder: 3 },
]

function importPastureData() {
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM pastures').get().count)
  if (count > 0) return
  const now = new Date().toISOString()
  const insert = db.prepare(`
    INSERT INTO pastures (
      id, name, area_code, area_size, quality, capacity, coverage,
      grass_height, soil_moisture, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  db.exec('BEGIN')
  try {
    for (const pasture of defaultPastures) {
      insert.run(
        pasture.id, pasture.name, pasture.areaCode, pasture.areaSize, pasture.quality,
        pasture.capacity, pasture.coverage, pasture.grassHeight, pasture.soilMoisture,
        pasture.sortOrder, now, now,
      )
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

importPastureData()

export function closeDatabase() {
  db.close()
}