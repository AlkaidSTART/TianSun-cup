import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const seedFile = path.resolve(currentDir, '..', 'data', 'livestock.seed.json')

test('Express API protects resources and preserves JSON error envelopes', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiansun-http-'))
  process.env.LIVESTOCK_DB_FILE = path.join(tempDir, 'test.sqlite')
  process.env.LIVESTOCK_SEED_FILE = seedFile
  let store
  let server
  try {
    const [{ default: app }, importedStore, auth] = await Promise.all([
      import('../src/app.js'), import('../src/store.js'), import('../src/auth-store.js'),
    ])
    store = importedStore
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
    const base = `http://127.0.0.1:${server.address().port}`
    const request = (url, options = {}) => fetch(`${base}${url}`, options)

    const health = await (await request('/api/health')).json()
    assert.equal(health.code, 0)
    assert.equal(health.data.storage, 'sqlite')
    assert.equal((await request('/api/livestock')).status, 401)

    auth.bootstrapInitialAdmin({ username: 'admin', displayName: '管理员', password: 'StrongAdminPass123!' })
    const login = await (await request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'mp-weixin' },
      body: JSON.stringify({ username: 'admin', password: 'StrongAdminPass123!' }),
    })).json()
    assert.equal(login.code, 0)
    const headers = { Authorization: `Bearer ${login.data.token}`, 'Content-Type': 'application/json' }

    const livestock = await (await request('/api/livestock', { headers })).json()
    assert.equal(livestock.code, 0)
    assert.equal(livestock.data.length, 7)

    const createdResponse = await request('/api/todos', {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'custom', date: '2026-09-23', time: '09:00', title: 'HTTP API 回归测试' }),
    })
    assert.equal(createdResponse.status, 201)
    const created = await createdResponse.json()
    assert.equal(created.data.title, 'HTTP API 回归测试')

    const invalidResponse = await request('/api/todos', { method: 'POST', headers, body: '{' })
    assert.equal(invalidResponse.status, 400)
    assert.equal((await invalidResponse.json()).code, 400)
    const unknownResponse = await request('/api/not-a-route', { method: 'POST', headers, body: '{' })
    assert.equal(unknownResponse.status, 404)
    assert.equal((await unknownResponse.json()).message, '接口不存在')

    assert.equal((await request('/api/auth/logout', { method: 'POST', headers })).status, 200)
    assert.equal((await request('/api/todos', { headers })).status, 401)
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    store?.closeDatabase()
    delete process.env.LIVESTOCK_DB_FILE
    delete process.env.LIVESTOCK_SEED_FILE
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
