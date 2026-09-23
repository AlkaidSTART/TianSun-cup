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

const insertStatement = db.prepare(`
  INSERT INTO livestock (
    id, species, breed, sex, source_type, mother_id, birth_date, purchase_date,
    supplier, purchase_price, pasture_id, pasture_name, owner, status, temperature,
    heart_rate, steps, rumination, last_report_at, notes, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateMotherStatement = db.prepare('UPDATE livestock SET mother_id = ? WHERE id = ?')

function insertRecord(record, includeMother = true) {
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

export function closeDatabase() {
  db.close()
}