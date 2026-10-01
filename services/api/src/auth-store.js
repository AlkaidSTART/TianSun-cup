import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { db } from './db.js'
import { ApiError } from './shared.js'

const passwordBytes = 64
const passwordMinLength = 10
const passwordMaxLength = 128
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000
const loginWindowMs = 15 * 60 * 1000
const maxLoginFailures = 5

function nowIso() {
  return new Date().toISOString()
}

function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validateCredentials({ username, displayName, password }, { needsDisplayName = false } = {}) {
  const errors = {}
  const normalizedUsername = normalizeUsername(username)
  const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : ''

  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(normalizedUsername)) {
    errors.username = '账号需为 3–32 位字母、数字、点、下划线或短横线'
  }
  if (needsDisplayName && (!normalizedDisplayName || normalizedDisplayName.length > 40)) {
    errors.displayName = '请填写 1–40 个字符的显示名称'
  }
  if (typeof password !== 'string' || password.length < passwordMinLength || password.length > passwordMaxLength) {
    errors.password = `密码长度需为 ${passwordMinLength}–${passwordMaxLength} 个字符`
  }
  if (Object.keys(errors).length) throw new ApiError(400, '账号信息校验失败', errors)
  return { username: normalizedUsername, displayName: normalizedDisplayName }
}

const recommendedScrypt = { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 }
const legacyScrypt = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function hashPassword(password, salt = randomBytes(16)) {
  const derived = scryptSync(password, salt, passwordBytes, recommendedScrypt)
  return { salt: salt.toString('hex'), hash: `scrypt$16384$8$5$${derived.toString('hex')}` }
}

function verifyPassword(password, saltHex, hashValue) {
  try {
    const parts = hashValue.split('$')
    const legacy = parts.length === 1
    const expected = Buffer.from(legacy ? hashValue : parts[4], 'hex')
    const options = legacy ? legacyScrypt : recommendedScrypt
    if (!legacy && parts.slice(0, 4).join('$') !== 'scrypt$16384$8$5') return false
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), passwordBytes, options)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

function tokenDigest(token) {
  return createHash('sha256').update(token).digest('hex')
}

function loginAttemptKey(username, clientAddress) {
  return createHash('sha256')
    .update(`${String(clientAddress || 'unknown').slice(0, 128)}|${username.toLowerCase()}`)
    .digest('hex')
}

function makeSession(userId) {
  const token = randomBytes(32).toString('base64url')
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString()
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(tokenDigest(token), userId, createdAt, expiresAt)
  return { token, expiresAt }
}

function transaction(callback) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = callback()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function createUserRecord({ username, displayName, password, role, mustChangePassword }) {
  const { salt, hash } = hashPassword(password)
  const id = randomUUID()
  const now = nowIso()
  db.prepare(`
    INSERT INTO users (
      id, username, display_name, password_salt, password_hash, role,
      is_active, must_change_password, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, username, displayName, salt, hash, role, mustChangePassword ? 1 : 0, now, now)
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

function createOwnershipGuards() {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS livestock_require_user_owner_insert
    BEFORE INSERT ON livestock WHEN NEW.user_id IS NULL
    BEGIN SELECT RAISE(ABORT, 'livestock user_id is required'); END;

    CREATE TRIGGER IF NOT EXISTS livestock_require_user_owner_update
    BEFORE UPDATE OF user_id ON livestock WHEN NEW.user_id IS NULL
    BEGIN SELECT RAISE(ABORT, 'livestock user_id is required'); END;

    CREATE TRIGGER IF NOT EXISTS todos_require_user_owner_insert
    BEFORE INSERT ON todos WHEN NEW.user_id IS NULL
    BEGIN SELECT RAISE(ABORT, 'todos user_id is required'); END;

    CREATE TRIGGER IF NOT EXISTS todos_require_user_owner_update
    BEFORE UPDATE OF user_id ON todos WHEN NEW.user_id IS NULL
    BEGIN SELECT RAISE(ABORT, 'todos user_id is required'); END;
  `)
}

export function hasAnyUser() {
  return Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count) > 0
}

export function bootstrapInitialAdmin({ username, displayName, password }) {
  const normalized = validateCredentials({ username, displayName, password }, { needsDisplayName: true })
  return transaction(() => {
    if (hasAnyUser()) throw new ApiError(409, '系统管理员已初始化，不能再次执行初始化')
    const user = createUserRecord({
      ...normalized,
      password,
      role: 'admin',
      mustChangePassword: false,
    })
    db.prepare('UPDATE livestock SET user_id = ? WHERE user_id IS NULL').run(user.id)
    db.prepare('UPDATE todos SET user_id = ? WHERE user_id IS NULL').run(user.id)
    createOwnershipGuards()
    return publicUser(user)
  })
}

function bumpLoginFailure(key) {
  const now = Date.now()
  const existing = db.prepare('SELECT * FROM auth_login_attempts WHERE attempt_key = ?').get(key)
  let failures = 1
  let startedAt = new Date(now).toISOString()
  let blockedUntil = null

  if (existing && now - Date.parse(existing.window_started_at) < loginWindowMs) {
    failures = Number(existing.failures) + 1
    startedAt = existing.window_started_at
  }
  if (failures >= maxLoginFailures) blockedUntil = new Date(now + loginWindowMs).toISOString()

  db.prepare(`
    INSERT INTO auth_login_attempts (attempt_key, failures, window_started_at, blocked_until)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(attempt_key) DO UPDATE SET
      failures = excluded.failures,
      window_started_at = excluded.window_started_at,
      blocked_until = excluded.blocked_until
  `).run(key, failures, startedAt, blockedUntil)
  return Boolean(blockedUntil)
}

export function loginUser({ username, password, clientAddress }) {
  const normalizedUsername = normalizeUsername(username)
  const attemptKey = loginAttemptKey(normalizedUsername, clientAddress)
  const attempt = db.prepare('SELECT * FROM auth_login_attempts WHERE attempt_key = ?').get(attemptKey)
  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) {
    throw new ApiError(429, '登录尝试次数过多，请 15 分钟后重试')
  }
  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) <= Date.now()) {
    db.prepare('DELETE FROM auth_login_attempts WHERE attempt_key = ?').run(attemptKey)
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(normalizedUsername)
  // Run the same expensive KDF for unknown usernames to reduce account enumeration timing.
  const salt = user?.password_salt || '00112233445566778899aabbccddeeff'
  const hash = user?.password_hash || `scrypt$16384$8$5$${Buffer.alloc(passwordBytes).toString('hex')}`
  const validPassword = typeof password === 'string'
    && password.length <= passwordMaxLength
    && verifyPassword(password, salt, hash)
  if (!user || !user.is_active || !validPassword) {
    if (bumpLoginFailure(attemptKey)) throw new ApiError(429, '登录尝试次数过多，请 15 分钟后重试')
    throw new ApiError(401, '账号或密码错误')
  }

  db.prepare('DELETE FROM auth_login_attempts WHERE attempt_key = ?').run(attemptKey)
  db.prepare("DELETE FROM auth_login_attempts WHERE window_started_at < datetime('now', '-1 day')").run()
  const session = makeSession(user.id)
  return { ...session, user: publicUser(user) }
}

export function getUserForSession(token) {
  if (!token) return null
  const tokenHash = tokenDigest(token)
  const user = db.prepare(`
    SELECT users.* FROM auth_sessions
    INNER JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ?
      AND auth_sessions.expires_at > ?
      AND users.is_active = 1
  `).get(tokenHash, nowIso())
  if (!user) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash)
    return null
  }
  return publicUser(user)
}

export function revokeSession(token) {
  if (!token) return
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenDigest(token))
}

export function changePassword(userId, { currentPassword, newPassword }) {
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    throw new ApiError(400, '请填写当前密码和新密码')
  }
  if (newPassword.length < passwordMinLength || newPassword.length > passwordMaxLength) {
    throw new ApiError(400, `新密码长度需为 ${passwordMinLength}–${passwordMaxLength} 个字符`, {
      newPassword: `密码长度需为 ${passwordMinLength}–${passwordMaxLength} 个字符`,
    })
  }
  const previous = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!previous || !verifyPassword(currentPassword, previous.password_salt, previous.password_hash)) {
    throw new ApiError(400, '当前密码不正确')
  }

  const { salt, hash } = hashPassword(newPassword)
  const now = nowIso()
  return transaction(() => {
    db.prepare(`
      UPDATE users
      SET password_salt = ?, password_hash = ?, must_change_password = 0, updated_at = ?
      WHERE id = ?
    `).run(salt, hash, now, userId)
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId)
    const session = makeSession(userId)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    return { ...session, user: publicUser(user) }
  })
}

export function listUsers() {
  return db.prepare(`
    SELECT id, username, display_name, role, is_active, must_change_password, created_at, updated_at
    FROM users
    ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, username COLLATE NOCASE
  `).all().map(publicUser)
}

export function createUser({ username, displayName, password, role = 'operator' }) {
  const normalized = validateCredentials({ username, displayName, password }, { needsDisplayName: true })
  if (!['admin', 'operator'].includes(role)) {
    throw new ApiError(400, '请选择有效的账号角色', { role: '请选择管理员或操作员' })
  }
  try {
    const user = createUserRecord({
      ...normalized,
      password,
      role,
      mustChangePassword: true,
    })
    return publicUser(user)
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed: users.username')) {
      throw new ApiError(409, '该登录账号已存在')
    }
    throw error
  }
}

export function updateUser(id, payload = {}, actingUserId = '') {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) throw new ApiError(404, '未找到该用户')
  const displayName = payload.displayName === undefined ? user.display_name : String(payload.displayName).trim()
  const isActive = payload.isActive === undefined ? Boolean(user.is_active) : payload.isActive
  const errors = {}
  if (!displayName || displayName.length > 40) errors.displayName = '显示名称需为 1–40 个字符'
  if (typeof isActive !== 'boolean') errors.isActive = '账号状态不正确'
  if (Object.keys(errors).length) throw new ApiError(400, '用户信息校验失败', errors)
  if (id === actingUserId && !isActive) throw new ApiError(400, '不能停用当前登录的管理员')
  if (user.role === 'admin' && !isActive) {
    const activeAdmins = Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1").get().count)
    if (activeAdmins <= 1) throw new ApiError(400, '至少需要保留一个启用的管理员')
  }

  db.prepare('UPDATE users SET display_name = ?, is_active = ?, updated_at = ? WHERE id = ?')
    .run(displayName, isActive ? 1 : 0, nowIso(), id)
  if (!isActive) db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id)
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
}

export function resetUserPassword(id, actingUserId = '') {
  if (id === actingUserId) throw new ApiError(400, '请使用修改密码功能更改自己的密码')
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) throw new ApiError(404, '未找到该用户')
  const temporaryPassword = randomBytes(12).toString('base64url')
  const { salt, hash } = hashPassword(temporaryPassword)
  db.prepare(`
    UPDATE users
    SET password_salt = ?, password_hash = ?, must_change_password = 1, updated_at = ?
    WHERE id = ?
  `).run(salt, hash, nowIso(), id)
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id)
  return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)), temporaryPassword }
}

export function createTokenSessionForUser(userId) {
  return makeSession(userId)
}

export function countUsers() {
  return Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count)
}
