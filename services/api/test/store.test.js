import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const seedFile = path.resolve(currentDir, '..', 'data', 'livestock.seed.json')

test('creates purchased and born livestock records with mother validation', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'livestock-store-'))
  process.env.LIVESTOCK_DB_FILE = path.join(tempDir, 'test.sqlite')
  process.env.LIVESTOCK_SEED_FILE = seedFile

  let store
  try {
    store = await import(`../src/store.js?test=${Date.now()}`)

    const purchased = await store.createLivestock({
      id: 'SC-2099-10001',
      species: '牦牛',
      breed: '麦洼牦牛',
      sex: 'male',
      sourceType: 'purchased',
      purchaseDate: '2026-09-17',
      supplier: '测试供应商',
      purchasePrice: 8800,
      pastureId: 'P-A-02',
      owner: '测试牧户',
    })
    assert.equal(purchased.sourceType, 'purchased')
    assert.equal(purchased.supplier, '测试供应商')

    const born = await store.createLivestock({
      id: 'SC-2099-10002',
      species: '牦牛',
      breed: '九龙牦牛',
      sex: 'female',
      sourceType: 'born',
      motherId: 'SC-2022-00068',
      birthDate: '2026-09-16',
      pastureId: 'P-A-01',
      owner: '测试牧户',
    })
    assert.equal(born.motherId, 'SC-2022-00068')

    await assert.rejects(
      () => store.createLivestock({
        id: 'SC-2099-10003',
        species: '牦牛',
        breed: '九龙牦牛',
        sex: 'female',
        sourceType: 'born',
        birthDate: '2026-09-16',
        pastureId: 'P-A-01',
      }),
      (error) => error.statusCode === 400 && error.details.motherId === '生产来源必须选择母亲',
    )

    await assert.rejects(
      () => store.createLivestock({
        id: 'SC-2099-10004',
        species: '牦牛',
        breed: '九龙牦牛',
        sex: 'female',
        sourceType: 'born',
        motherId: 'SC-2099-10002',
        birthDate: '2026-09-17',
        pastureId: 'P-A-01',
      }),
      (error) => error.statusCode === 400 && error.details.motherId === '所选母畜未达到适繁月龄',
    )

    const records = await store.listLivestock()
    assert.equal(records.length, 9)
    assert.equal((await store.listMothers()).length, 2)

    const stats = await store.getStats()
    assert.equal(stats.total, 9)
    assert.equal(stats.purchased, 2)
    assert.equal(stats.born, 7)

    const todayTodo = await store.createTodo({
      type: 'rotation',
      date: '2026-09-20',
      time: '07:30',
      title: '东沟草场巡检',
      detail: '检查围栏和水源',
    })
    assert.equal(todayTodo.type, 'rotation')
    assert.equal(todayTodo.status, '待办')
    assert.equal(typeof todayTodo.id, 'string')

    const customTodo = await store.createTodo({
      type: 'custom',
      date: '2026-09-21',
      time: '09:00',
      title: '领取防疫物资',
      detail: '',
    })
    assert.equal(customTodo.status, '待办')
    assert.equal(customTodo.tone, 'warn')

    const updatedTodo = await store.updateTodo(todayTodo.id, {
      date: '2026-09-20',
      time: '08:15',
      title: '北坡草场轮换',
      detail: '更新后的待办备注',
    })
    assert.equal(updatedTodo.title, '北坡草场轮换')
    assert.equal(updatedTodo.time, '08:15')
    assert.equal(updatedTodo.status, '待办')

    const completedTodo = await store.completeTodo(updatedTodo.id)
    assert.equal(completedTodo.status, '已完成')
    assert.equal(completedTodo.tone, 'ok')

    const todayTodos = await store.listTodos({ date: '2026-09-20' })
    assert.equal(todayTodos.length, 1)
    assert.equal(todayTodos[0].title, '北坡草场轮换')
    assert.equal(todayTodos[0].detail, '更新后的待办备注')
    assert.equal(todayTodos[0].status, '已完成')

    const deletedTodo = await store.deleteTodo(customTodo.id)
    assert.equal(deletedTodo.id, customTodo.id)
    assert.equal((await store.listTodos()).length, 1)

    await assert.rejects(
      () => store.createTodo({ type: 'custom', date: '2026-02-30', time: '09:00', title: '无效日期' }),
      (error) => error.statusCode === 400 && error.details.date === '日期格式不正确',
    )
  } finally {
    store?.closeDatabase()
    delete process.env.LIVESTOCK_DB_FILE
    delete process.env.LIVESTOCK_SEED_FILE
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})