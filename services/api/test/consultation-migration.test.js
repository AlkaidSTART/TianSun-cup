import test from 'node:test'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const dbUrl = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/db.js')).href

// Run in a child so Windows can release SQLite's WAL/SHM files before cleanup.
test('legacy consultation messages migrate without being relabeled as AI', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiansun-consult-migrate-'))
  const databaseFile = path.join(tempDir, 'legacy.sqlite')
  const script = `
    import assert from 'node:assert/strict'
    import { DatabaseSync } from 'node:sqlite'
    const legacy = new DatabaseSync(process.env.LIVESTOCK_DB_FILE)
    legacy.exec(\`\n      CREATE TABLE consultations (\n        id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL,\n        livestock_id TEXT, pasture_id TEXT, symptoms TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '',\n        title TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('open', 'answered', 'closed')),\n        doctor_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL\n      );\n      CREATE TABLE consultation_messages (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,\n        role TEXT NOT NULL CHECK (role IN ('doctor', 'user')),\n        author_name TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL\n      );\n      CREATE INDEX idx_consult_messages ON consultation_messages(consultation_id, created_at);\n      INSERT INTO consultations (code, user_id, symptoms, title, status, doctor_name, created_at, updated_at)\n        VALUES ('VC-20261001-001', 'legacy-user', '[]', 'legacy', 'answered', 'legacy', '2026-10-01', '2026-10-01');\n      INSERT INTO consultation_messages (consultation_id, role, author_name, text, created_at)\n        VALUES (1, 'doctor', 'legacy', 'human reply', '2026-10-01');\n    \`)
    legacy.close()
    const { db, closeDatabase } = await import(${JSON.stringify(dbUrl)})
    assert.equal(db.prepare('SELECT role FROM consultation_messages WHERE id = 1').get().role, 'doctor')
    assert.equal(db.prepare('SELECT maxkb_chat_id AS chatId FROM consultations WHERE id = 1').get().chatId, null)
    db.prepare("INSERT INTO consultation_messages (consultation_id, role, author_name, text, created_at) VALUES (1, 'assistant', 'AI', 'AI reply', '2026-10-05')").run()
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM consultation_messages WHERE consultation_id = 1').get().count, 2)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3)
    closeDatabase()
  `
  try {
    await execFileAsync(process.execPath, ['--experimental-sqlite', '--disable-warning=ExperimentalWarning', '--input-type=module', '-e', script], {
      env: { ...process.env, LIVESTOCK_DB_FILE: databaseFile },
    })
  } finally {
    const resolved = path.resolve(tempDir)
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('tiansun-consult-migrate-')) {
      throw new Error(`Unexpected migration test directory: ${resolved}`)
    }
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
