import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const seedFile = path.resolve(currentDir, '..', 'data', 'livestock.seed.json')
const adminPassword = 'InitialAdminPass123!'

test('SQLite store preserves livestock/todo behavior and assigns every record to its authenticated owner', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiansun-store-'))
  process.env.LIVESTOCK_DB_FILE = path.join(tempDir, 'test.sqlite')
  process.env.LIVESTOCK_SEED_FILE = seedFile
  let store
  try {
    store = await import('../src/store.js')
    const auth = await import('../src/auth-store.js')
    const admin = auth.bootstrapInitialAdmin({
      username: 'testadmin', displayName: '测试管理员', password: adminPassword,
    })
    assert.equal(admin.role, 'admin')
    assert.equal((await store.listLivestock({}, admin)).length, 7)

    const purchased = await store.createLivestock({
      id: 'SC-2099-10001', species: '牦牛', breed: '麦洼牦牛', sex: 'male',
      sourceType: 'purchased', purchaseDate: '2026-09-17', supplier: '测试供应商',
      purchasePrice: 8800, pastureId: 'P-A-02', owner: '测试牧户',
    }, admin)
    assert.equal(purchased.sourceType, 'purchased')
    assert.equal(purchased.userId, admin.id)

    const born = await store.createLivestock({
      id: 'SC-2099-10002', species: '牦牛', breed: '九龙牦牛', sex: 'female',
      sourceType: 'born', motherId: 'SC-2022-00068', birthDate: '2026-09-16',
      pastureId: 'P-A-01', owner: '测试牧户',
    }, admin)
    assert.equal(born.motherId, 'SC-2022-00068')

    await assert.rejects(() => store.createLivestock({
      id: 'SC-2099-10003', breed: '九龙牦牛', sex: 'female', sourceType: 'born',
      birthDate: '2026-09-16', pastureId: 'P-A-01',
    }, admin), (error) => error.statusCode === 400 && error.details.motherId === '生产来源必须选择母亲')

    const stats = await store.getStats(admin)
    assert.equal(stats.total, 9)
    assert.equal(stats.born, 7)
    assert.equal((await store.listMothers(admin)).length, 2)

    const item = await store.createTodo({ type: 'rotation', date: '2026-09-20', time: '07:30', title: '东沟草场巡检' }, admin)
    assert.equal(item.userId, admin.id)
    const updated = await store.updateTodo(item.id, { date: item.date, time: '08:15', title: '北坡草场轮换' }, admin)
    assert.equal(updated.title, '北坡草场轮换')
    assert.equal((await store.completeTodo(item.id, admin)).status, '已完成')
    assert.equal((await store.listTodos({ date: item.date }, admin)).length, 1)
    assert.deepEqual(await store.deleteTodo(item.id, admin), { id: item.id })
    await assert.rejects(() => store.createTodo({ type: 'custom', date: '2026-02-30', time: '09:00', title: '无效日期' }, admin),
      (error) => error.statusCode === 400 && error.details.date === '日期格式不正确')
  } finally {
    store?.closeDatabase()
    delete process.env.LIVESTOCK_DB_FILE
    delete process.env.LIVESTOCK_SEED_FILE
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
