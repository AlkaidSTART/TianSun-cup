import { createHash } from 'node:crypto'
﻿import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const initialPassword = 'InitialAdminPass123!'

test('legacy records migrate to the initial admin; sessions and user scopes are enforced over HTTP', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiansun-auth-'))
  const file = path.join(tempDir, 'legacy.sqlite')
  const legacy = new DatabaseSync(file)
  legacy.exec(`
    CREATE TABLE livestock (
      id TEXT PRIMARY KEY, species TEXT NOT NULL, breed TEXT NOT NULL, sex TEXT NOT NULL,
      source_type TEXT NOT NULL, mother_id TEXT, birth_date TEXT, purchase_date TEXT,
      supplier TEXT, purchase_price REAL, pasture_id TEXT NOT NULL, pasture_name TEXT NOT NULL,
      owner TEXT NOT NULL, status TEXT NOT NULL, temperature REAL, heart_rate INTEGER,
      steps INTEGER, rumination INTEGER, last_report_at TEXT, notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, todo_date TEXT NOT NULL,
      todo_time TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, tone TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO livestock (id, species, breed, sex, source_type, pasture_id, pasture_name,
      owner, status, created_at, updated_at) VALUES
      ('SC-OLD-001', '牦牛', '九龙牦牛', 'female', 'purchased', 'P-A-01', '东沟草场',
       '旧牧户', 'normal', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    INSERT INTO todos (type, todo_date, todo_time, title, status, tone, created_at, updated_at)
      VALUES ('custom', '2026-09-23', '08:00', '历史待办', '待办', 'warn',
       '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
  `)
  legacy.close()
  process.env.LIVESTOCK_DB_FILE = file
  process.env.LIVESTOCK_SEED_FILE = path.join(tempDir, 'no-seed.json')

  let store
  let server
  try {
    const [{ default: app }, auth, importedStore, { db }] = await Promise.all([
      import('../src/app.js'), import('../src/auth-store.js'),
      import('../src/store.js'), import('../src/db.js'),
    ])
    store = importedStore
    assert.equal(db.prepare('SELECT user_id FROM livestock').get().user_id, null)
    const admin = auth.bootstrapInitialAdmin({ username: 'admin', displayName: '初始管理员', password: initialPassword })
    assert.equal(db.prepare('SELECT user_id FROM livestock').get().user_id, admin.id)
    assert.equal(db.prepare('SELECT user_id FROM todos').get().user_id, admin.id)
    assert.throws(() => auth.bootstrapInitialAdmin({ username: 'again', displayName: '重复', password: initialPassword }),
      (error) => error.statusCode === 409)
    assert.throws(() => db.prepare('INSERT INTO todos (type, todo_date, todo_time, title, status, tone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('custom', '2026-09-23', '09:00', '无归属', '待办', 'warn', 'now', 'now'))

    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    async function call(method, route, body, token) {
      const response = await fetch(`${base}${route}`, {
        method, headers: { 'Content-Type': 'application/json', ...(route === '/api/auth/login' ? { 'X-Client-Platform': 'app-plus' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return { status: response.status, data: await response.json() }
    }
    async function login(username, password) {
      const response = await call('POST', '/api/auth/login', { username, password })
      assert.equal(response.status, 200, response.data.message)
      return response.data.data
    }

    const browserLoginResponse = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: initialPassword }),
    })
    const browserLogin = await browserLoginResponse.json()
    assert.equal(browserLogin.data.token, undefined)
    const setCookie = browserLoginResponse.headers.get('set-cookie')
    assert.match(setCookie, /HttpOnly/)
    assert.match(setCookie, /SameSite=Strict/)
    const cookie = setCookie.split(';')[0]
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).status, 200)
    assert.equal((await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })).status, 403)
    const browserLogout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'TianSun' } })
    assert.equal(browserLogout.status, 200)
    assert.match(browserLogout.headers.get('set-cookie'), /Max-Age=0/)
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401)

    const appLoginResponse = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'app-plus' },
      body: JSON.stringify({ username: 'admin', password: initialPassword }),
    })
    const appLogin = await appLoginResponse.json()
    assert.equal(appLoginResponse.status, 200)
    assert.equal(typeof appLogin.data.token, 'string')
    assert.equal((await call('GET', '/api/auth/me', undefined, appLogin.data.token)).status, 200)
    assert.equal((await call('POST', '/api/auth/logout', undefined, appLogin.data.token)).status, 200)

    const adminLogin = await login('admin', initialPassword)
    assert.match(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(admin.id).password_hash, /^scrypt\$16384\$8\$5\$/)
    assert.equal((await call('GET', '/api/livestock', undefined, adminLogin.token)).data.data.length, 1)
    assert.equal((await call('GET', '/api/todos', undefined, adminLogin.token)).data.data.length, 1)

    const alice = await call('POST', '/api/users', {
      username: 'alice', displayName: '甲', password: 'InitialAlicePass123!', role: 'operator',
    }, adminLogin.token)
    const bob = await call('POST', '/api/users', {
      username: 'bob', displayName: '乙', password: 'InitialBobPass123!', role: 'operator',
    }, adminLogin.token)
    assert.equal(alice.status, 201)
    assert.equal(bob.status, 201)
    assert.equal((await call('POST', '/api/users', {
      username: 'Alice', displayName: '重名', password: 'AnotherPassword123!', role: 'operator',
    }, adminLogin.token)).status, 409)
    assert.equal((await call('POST', `/api/users/${admin.id}/reset-password`, undefined, adminLogin.token)).status, 400)
    assert.equal((await call('GET', '/api/users')).status, 401)
    let a = await login('alice', 'InitialAlicePass123!')
    assert.equal(a.user.mustChangePassword, true)
    assert.equal((await call('GET', '/api/livestock', undefined, a.token)).status, 403)
    const changeA = await call('POST', '/api/auth/password', {
      currentPassword: 'InitialAlicePass123!', newPassword: 'AliceNewPassword123!',
    }, a.token)
    assert.equal(changeA.status, 200)
    assert.equal((await call('GET', '/api/todos', undefined, a.token)).status, 401)
    a = changeA.data.data
    let b = await login('bob', 'InitialBobPass123!')
    b = (await call('POST', '/api/auth/password', {
      currentPassword: 'InitialBobPass123!', newPassword: 'BobNewPassword123!',
    }, b.token)).data.data

    const newLivestock = await call('POST', '/api/livestock', {
      id: 'SC-2099-A01', species: '牦牛', breed: '九龙牦牛', sex: 'female',
      sourceType: 'purchased', purchaseDate: '2026-09-29', pastureId: 'P-A-01', owner: '牧户甲',
      userId: b.user.id,
    }, a.token)
    assert.equal(newLivestock.status, 201, newLivestock.data.message)
    assert.equal(newLivestock.data.data.userId, a.user.id)
    assert.equal((await call('GET', '/api/livestock', undefined, a.token)).data.data.length, 1)
    assert.equal((await call('GET', '/api/livestock', undefined, b.token)).data.data.length, 0)
    assert.equal((await call('GET', '/api/livestock/SC-2099-A01', undefined, b.token)).status, 404)
    assert.equal((await call('PATCH', '/api/livestock/SC-2099-A01', { notes: '越权编辑' }, b.token)).status, 404)
    assert.equal((await call('GET', '/api/livestock/stats', undefined, b.token)).data.data.total, 0)
    assert.equal((await call('GET', '/api/livestock', undefined, adminLogin.token)).data.data.length, 2)

    const newTodo = await call('POST', '/api/todos', {
      type: 'custom', date: '2026-09-29', time: '10:00', title: '甲的待办',
      userId: b.user.id,
    }, a.token)
    assert.equal(newTodo.status, 201)
    assert.equal(newTodo.data.data.userId, a.user.id)
    const todoId = newTodo.data.data.id
    assert.equal((await call('GET', '/api/todos', undefined, b.token)).data.data.length, 0)
    assert.equal((await call('PATCH', `/api/todos/${todoId}/complete`, undefined, b.token)).status, 404)
    assert.equal((await call('DELETE', `/api/todos/${todoId}`, undefined, b.token)).status, 404)
    assert.equal((await call('PATCH', `/api/todos/${todoId}`, { title: '越权编辑' }, b.token)).status, 404)
    assert.equal((await call('GET', '/api/todos', undefined, adminLogin.token)).data.data.length, 2)
    const adminEdit = await call('PATCH', '/api/livestock/SC-2099-A01', { notes: '管理员复核' }, adminLogin.token)
    assert.equal(adminEdit.status, 200)
    assert.equal(adminEdit.data.data.userId, a.user.id)

    assert.equal((await call('GET', '/api/users', undefined, b.token)).status, 403)
    assert.equal((await call('PATCH', `/api/users/${bob.data.data.id}`, { isActive: false }, adminLogin.token)).status, 200)
    assert.equal((await call('GET', '/api/todos', undefined, b.token)).status, 401)
    assert.equal((await call('PATCH', `/api/users/${bob.data.data.id}`, { isActive: true }, adminLogin.token)).status, 200)
    const reset = await call('POST', `/api/users/${bob.data.data.id}/reset-password`, undefined, adminLogin.token)
    assert.equal(reset.status, 200)
    assert.equal((await call('POST', '/api/auth/login', { username: 'bob', password: 'BobNewPassword123!' })).status, 401)
    assert.equal((await login('bob', reset.data.data.temporaryPassword)).user.mustChangePassword, true)

    const expiryLogin = auth.loginUser({ username: 'alice', password: 'AliceNewPassword123!', clientAddress: 'expiry-test' })
    const expiredHash = createHash('sha256').update(expiryLogin.token).digest('hex')
    db.prepare('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?')
      .run('2000-01-01T00:00:00.000Z', expiredHash)
    assert.equal((await call('GET', '/api/livestock', undefined, expiryLogin.token)).status, 401)
    assert.equal((await call('GET', '/api/livestock', undefined, a.token)).status, 200)

    const logout = await call('POST', '/api/auth/logout', undefined, a.token)
    assert.equal(logout.status, 200)
    assert.equal((await call('GET', '/api/livestock', undefined, a.token)).status, 401)

    for (let i = 0; i < 5; i++) {
      const failed = await call('POST', '/api/auth/login', { username: 'unknown', password: 'wrongpassword' })
      assert.equal(failed.status, i === 4 ? 429 : 401)
    }
    assert.equal((await call('POST', '/api/auth/login', { username: 'unknown', password: initialPassword })).status, 429)
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    store?.closeDatabase()
    delete process.env.LIVESTOCK_DB_FILE
    delete process.env.LIVESTOCK_SEED_FILE
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
