import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const seedFile = path.resolve(currentDir, '..', 'data', 'livestock.seed.json')

test('Express API preserves health, existing resources, and JSON error envelopes', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiansun-api-'))
  process.env.LIVESTOCK_DB_FILE = path.join(tempDir, 'test.sqlite')
  process.env.LIVESTOCK_SEED_FILE = seedFile

  let store
  let server
  try {
    const [{ default: app }, importedStore] = await Promise.all([
      import(`../src/app.js?test=${Date.now()}`),
      import(`../src/store.js?test=${Date.now()}`),
    ])
    store = importedStore
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const address = server.address()
    const baseUrl = `http://127.0.0.1:${address.port}`

    const healthResponse = await fetch(`${baseUrl}/api/health`)
    const health = await healthResponse.json()
    assert.equal(healthResponse.status, 200)
    assert.equal(health.code, 0)
    assert.equal(health.data.storage, 'sqlite')

    const livestockResponse = await fetch(`${baseUrl}/api/livestock`)
    const livestock = await livestockResponse.json()
    assert.equal(livestockResponse.status, 200)
    assert.equal(livestock.code, 0)
    assert.equal(livestock.data.length, 7)

    const createTodoResponse = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'custom',
        date: '2026-09-23',
        time: '09:00',
        title: 'HTTP API 回归测试',
      }),
    })
    const createdTodo = await createTodoResponse.json()
    assert.equal(createTodoResponse.status, 201)
    assert.equal(createdTodo.code, 0)
    assert.equal(createdTodo.data.title, 'HTTP API 回归测试')

    const invalidTodoResponse = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    const invalidTodo = await invalidTodoResponse.json()
    assert.equal(invalidTodoResponse.status, 400)
    assert.equal(invalidTodo.code, 400)
    assert.equal(invalidTodo.data, null)

    const unknownApiResponse = await fetch(`${baseUrl}/api/not-a-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    const unknownApi = await unknownApiResponse.json()
    assert.equal(unknownApiResponse.status, 404)
    assert.equal(unknownApi.message, '接口不存在')
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    store?.closeDatabase()
    delete process.env.LIVESTOCK_DB_FILE
    delete process.env.LIVESTOCK_SEED_FILE
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
