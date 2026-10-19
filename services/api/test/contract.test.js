import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const seedFile = path.resolve(currentDir, '..', 'data', 'livestock.seed.json')

// Regression guard for docs/api-contract.md chapters 1-8: the endpoints that
// existed before the pasture/alert/telemetry/consultation work must keep their
// documented paths, envelope, messages, status codes and null semantics.
test('contract: implemented endpoints keep their documented shape', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiansun-contract-'))
  process.env.LIVESTOCK_DB_FILE = path.join(tempDir, 'contract.sqlite')
  process.env.LIVESTOCK_SEED_FILE = seedFile
  let store
  let server
  try {
    const [{ default: app }, importedStore, auth] = await Promise.all([
      import('../src/app.js'), import('../src/store.js'), import('../src/auth-store.js'),
    ])
    store = importedStore
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const base = `http://127.0.0.1:${server.address().port}`

    async function call(url, options = {}) {
      const response = await fetch(`${base}${url}`, options)
      let body = null
      try { body = await response.json() } catch { body = null }
      return { status: response.status, body, headers: response.headers }
    }

    // --- public surface ---
    const health = await call('/api/health')
    assert.deepEqual([health.status, health.body.code, health.body.data.storage], [200, 0, 'sqlite'])

    const options = await call('/api/meta/options')
    assert.deepEqual(options.body.data.pastures.map((item) => item.id), ['P-A-01', 'P-A-02', 'P-A-03'])
    assert.deepEqual(options.body.data.pastures.map((item) => item.name), ['东沟草场', '北坡草场', '河谷草场'])
    assert.deepEqual(options.body.data.breeds, ['九龙牦牛', '麦洼牦牛', '藏绵羊', '高原山羊'])
    assert.deepEqual(options.body.data.sourceTypes.map((item) => item.value), ['purchased', 'born'])
    assert.deepEqual(options.body.data.statuses.map((item) => item.value), ['normal', 'attention', 'abnormal', 'offline'])
    assert.deepEqual(options.body.data.sexes.map((item) => item.value), ['female', 'male'])

    const anonymous = await call('/api/livestock')
    assert.deepEqual([anonymous.status, anonymous.body.message], [401, '请先登录'])
    const anonymousUnknown = await call('/api/nope')
    assert.deepEqual([anonymousUnknown.status, anonymousUnknown.body.message], [401, '请先登录'])
    const anonymousPage = await fetch(`${base}/definitely-not-a-page`)
    assert.deepEqual([anonymousPage.status, (await anonymousPage.json()).message], [404, '页面不存在'])

    auth.bootstrapInitialAdmin({ username: 'admin', displayName: '管理员', password: 'StrongAdminPass123!' })

    const badLogin = await call('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'app-plus' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password-x' }),
    })
    assert.deepEqual([badLogin.status, badLogin.body.message], [401, '账号或密码错误'])

    async function login(username, password) {
      const response = await call('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'app-plus' },
        body: JSON.stringify({ username, password }),
      })
      assert.equal(response.body.code, 0, JSON.stringify(response.body))
      return response.body.data.token
    }

    const token = await login('admin', 'StrongAdminPass123!')
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    const browserLogin = await call('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'TianSun' },
      body: JSON.stringify({ username: 'admin', password: 'StrongAdminPass123!' }),
    })
    assert.deepEqual(
      [browserLogin.status, browserLogin.body.data.token === undefined, /HttpOnly/.test(browserLogin.headers.get('set-cookie') || '')],
      [200, true, true],
    )
    const cookie = (browserLogin.headers.get('set-cookie') || '').split(';')[0]

    const me = await call('/api/auth/me', { headers })
    assert.deepEqual([me.body.data.role, 'password_hash' in me.body.data], ['admin', false])

    // --- livestock ---
    const created = await call('/api/livestock', {
      method: 'POST', headers,
      body: JSON.stringify({
        id: 'SC-2026-90001', breed: '九龙牦牛', sex: 'female', sourceType: 'purchased',
        pastureId: 'P-A-02', purchaseDate: '2026-05-01', supplier: '示范供应商', purchasePrice: 8200,
      }),
    })
    assert.deepEqual(
      [created.status, created.body.message, created.body.data.pastureName, created.body.data.species, created.body.data.owner, created.body.data.status],
      [201, '牲畜档案已创建', '北坡草场', '牦牛', '未分配', 'normal'],
    )

    const duplicate = await call('/api/livestock', {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'SC-2026-90001', breed: '九龙牦牛', sex: 'female', sourceType: 'purchased', pastureId: 'P-A-02', purchaseDate: '2026-05-01' }),
    })
    assert.deepEqual([duplicate.status, duplicate.body.details.id], [400, '该耳标号已存在'])

    for (const [badId, label] of [['AB1', '过短'], ['SC_2026_1', '下划线']]) {
      const invalidId = await call('/api/livestock', {
        method: 'POST', headers,
        body: JSON.stringify({ id: badId, breed: 'x', sex: 'male', sourceType: 'purchased', pastureId: 'P-A-01', purchaseDate: '2026-06-01' }),
      })
      assert.deepEqual([invalidId.status, invalidId.body.details.id], [400, '耳标号仅支持字母、数字和短横线'], label)
    }

    const normalized = await call('/api/livestock', {
      method: 'POST', headers,
      body: JSON.stringify({ id: '  sc-2026-91001  ', breed: '高原山羊', sex: 'male', sourceType: 'purchased', pastureId: 'P-A-01', purchaseDate: '2026-06-01' }),
    })
    assert.deepEqual([normalized.status, normalized.body.data.id], [201, 'SC-2026-91001'])

    const badPasture = await call('/api/livestock', {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'SC-2026-90002', breed: '九龙牦牛', sex: 'female', sourceType: 'purchased', pastureId: 'P-Z-99', purchaseDate: '2026-05-01' }),
    })
    assert.deepEqual([badPasture.status, badPasture.body.details.pastureId], [400, '请选择所属草场'])

    const mothers = await call('/api/livestock/mothers', { headers })
    assert.deepEqual(Object.keys(mothers.body.data[0]).sort(),
      ['birthDate', 'breed', 'id', 'owner', 'pastureId', 'pastureName', 'species', 'status'])

    const motherId = mothers.body.data[0].id
    const born = await call('/api/livestock', {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'SC-2026-90003', breed: '藏绵羊', sex: 'female', sourceType: 'born', motherId, birthDate: '2026-03-01', pastureId: 'P-A-01' }),
    })
    assert.deepEqual([born.status, born.body.data.motherId], [201, motherId])

    const badMother = await call('/api/livestock', {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'SC-2026-90004', breed: '藏绵羊', sex: 'female', sourceType: 'born', motherId: 'SC-9999-99999', birthDate: '2026-03-01', pastureId: 'P-A-01' }),
    })
    assert.deepEqual([badMother.status, badMother.body.details.motherId], [400, '未找到所选母畜'])

    const patched = await call('/api/livestock/SC-2026-90001', {
      method: 'PATCH', headers, body: JSON.stringify({ status: 'attention', temperature: 39.8, heartRate: 70 }),
    })
    assert.deepEqual(
      [patched.body.message, patched.body.data.status, patched.body.data.temperature, patched.body.data.purchasePrice],
      ['牲畜档案已更新', 'attention', 39.8, 8200],
    )

    const putAlias = await call('/api/livestock/SC-2026-90001', {
      method: 'PUT', headers, body: JSON.stringify({ notes: '通过 PUT 别名更新' }),
    })
    assert.deepEqual([putAlias.status, putAlias.body.data.notes], [200, '通过 PUT 别名更新'])

    const filtered = await call('/api/livestock?q=90001&status=attention&sourceType=purchased', { headers })
    assert.deepEqual([filtered.body.data.length, filtered.body.data[0].id], [1, 'SC-2026-90001'])

    const byPastureName = await call(`/api/livestock?q=${encodeURIComponent('河谷')}`, { headers })
    assert.equal(byPastureName.body.data.every((record) => record.pastureName === '河谷草场'), true)

    const missing = await call('/api/livestock/SC-0000-00000', { headers })
    assert.deepEqual([missing.status, missing.body.message], [404, '未找到该牲畜档案'])

    const stats = await call('/api/livestock/stats', { headers })
    assert.deepEqual(Object.keys(stats.body.data).sort(),
      ['abnormal', 'attention', 'born', 'female', 'male', 'normal', 'offline', 'online', 'purchased', 'total'])

    const ordered = (await call('/api/livestock', { headers })).body.data
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]
      const current = ordered[index]
      // Mirrors the query's ORDER BY datetime(updated_at) DESC, id DESC:
      // datetime() drops sub-second precision, so compare whole seconds.
      const previousSecond = Math.floor(Date.parse(previous.updatedAt) / 1000)
      const currentSecond = Math.floor(Date.parse(current.updatedAt) / 1000)
      assert.ok(
        previousSecond > currentSecond
        || (previousSecond === currentSecond && previous.id >= current.id),
        'livestock must be ordered by updatedAt DESC then id DESC',
      )
    }

    // Static segments must not be swallowed by /livestock/:id.
    assert.deepEqual([stats.status, stats.body.message], [200, 'ok'])
    assert.deepEqual([mothers.status, mothers.body.message], [200, 'ok'])

    // --- todos ---
    const todo = await call('/api/todos', {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'inspection', date: '2026-10-01', time: '09:30', title: '巡查东沟草场', detail: '记录草场情况', status: '已完成', tone: 'ok' }),
    })
    assert.deepEqual(
      [todo.status, todo.body.message, todo.body.data.status, todo.body.data.tone],
      [201, '待办事项已创建', '待办', 'warn'],
    )

    const todoValidations = [
      [{ type: 'inspection', date: '2026-02-30', time: '09:30', title: 'x', detail: '' }, 'date', '日期格式不正确'],
      [{ type: 'custom', date: '2026-10-01', time: '24:00', title: 'x', detail: '' }, 'time', '时间格式不正确'],
      [{ type: 'custom', date: '2026-10-01', time: '09:00', title: 'x'.repeat(61), detail: '' }, 'title', '事项名称不能超过 60 个字符'],
      [{ type: 'custom', date: '2026-10-01', time: '09:00', title: 'x', detail: 'x'.repeat(241) }, 'detail', '备注不能超过 240 个字符'],
      [{ type: 'nope', date: '2026-10-01', time: '09:00', title: 'x', detail: '' }, 'type', '请选择有效的待办类型'],
    ]
    for (const [payload, field, message] of todoValidations) {
      const invalid = await call('/api/todos', { method: 'POST', headers, body: JSON.stringify(payload) })
      assert.deepEqual([invalid.status, invalid.body.details[field]], [400, message], field)
    }

    const todosByDate = await call('/api/todos?date=2026-10-01', { headers })
    assert.deepEqual([todosByDate.body.data.length, todosByDate.body.data[0].id], [1, todo.body.data.id])

    const updatedTodo = await call(`/api/todos/${todo.body.data.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ type: 'custom', date: '2026-10-02', time: '10:00', title: '改期', detail: '类型不应改变' }),
    })
    assert.deepEqual(
      [updatedTodo.body.message, updatedTodo.body.data.type, updatedTodo.body.data.date],
      ['待办事项已更新', 'inspection', '2026-10-02'],
    )

    const completed = await call(`/api/todos/${todo.body.data.id}/complete`, { method: 'PATCH', headers })
    assert.deepEqual([completed.body.message, completed.body.data.status, completed.body.data.tone], ['待办事项已完成', '已完成', 'ok'])
    const completedAgain = await call(`/api/todos/${todo.body.data.id}/complete`, { method: 'PATCH', headers })
    assert.deepEqual([completedAgain.status, completedAgain.body.data.status], [200, '已完成'])

    const removed = await call(`/api/todos/${todo.body.data.id}`, { method: 'DELETE', headers })
    assert.deepEqual([removed.body.message, removed.body.data], ['待办事项已删除', { id: todo.body.data.id }])
    const removedAgain = await call(`/api/todos/${todo.body.data.id}`, { method: 'DELETE', headers })
    assert.deepEqual([removedAgain.status, removedAgain.body.message], [404, '未找到该待办事项'])

    // --- request guards ---
    const csrf = await call('/api/todos', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'inspection', date: '2026-10-01', time: '09:30', title: 'x', detail: '' }),
    })
    assert.deepEqual([csrf.status, csrf.body.message], [403, '请求来源校验失败'])

    const unknownAuth = await call('/api/nope', { headers })
    assert.deepEqual([unknownAuth.status, unknownAuth.body.message], [404, '接口不存在'])

    const tooLarge = await fetch(`${base}/api/livestock`, {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'SC-2026-90010', breed: 'x'.repeat(1_200_000), sex: 'female', sourceType: 'purchased', pastureId: 'P-A-01', purchaseDate: '2026-06-01' }),
    })
    assert.deepEqual([tooLarge.status, (await tooLarge.json()).message], [413, '请求体超过 1MB 限制'])

    const brokenJson = await fetch(`${base}/api/todos`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{"type":',
    })
    assert.deepEqual([brokenJson.status, (await brokenJson.json()).message], [400, '请求体不是有效的 JSON'])

    const preflight = await call('/api/health', { method: 'OPTIONS' })
    assert.equal(preflight.status, 204)

    // --- users ---
    const operator = await call('/api/users', {
      method: 'POST', headers,
      body: JSON.stringify({ username: 'herder1', displayName: '牧户一', password: 'HerderPass123!', role: 'operator' }),
    })
    assert.deepEqual(
      [operator.status, operator.body.message, operator.body.data.mustChangePassword, operator.body.data.role],
      [201, '用户已创建', true, 'operator'],
    )

    const operatorToken = await login('herder1', 'HerderPass123!')
    const readyGuard = await call('/api/livestock', { headers: { Authorization: `Bearer ${operatorToken}` } })
    assert.deepEqual([readyGuard.status, readyGuard.body.message], [403, '首次登录请先修改密码'])
    assert.equal('password_hash' in operator.body.data, false)

    const shortPassword = await call('/api/auth/password', {
      method: 'POST', headers: { Authorization: `Bearer ${operatorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'HerderPass123!', newPassword: 'short' }),
    })
    assert.deepEqual([shortPassword.status, shortPassword.body.details.newPassword], [400, '密码长度需为 6–128 个字符'])

    const rotated = await call('/api/auth/password', {
      method: 'POST', headers: { Authorization: `Bearer ${operatorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'HerderPass123!', newPassword: 'HerderPass456!' }),
    })
    assert.deepEqual([rotated.status, rotated.body.message, typeof rotated.body.data.token], [200, '密码已更新', 'string'])
    assert.equal((await call('/api/auth/me', { headers: { Authorization: `Bearer ${operatorToken}` } })).status, 401)

    const operatorHeaders = { Authorization: `Bearer ${rotated.body.data.token}`, 'Content-Type': 'application/json' }
    assert.equal((await call('/api/livestock', { headers: operatorHeaders })).body.data.length, 0)
    const operatorUsers = await call('/api/users', { headers: operatorHeaders })
    assert.deepEqual([operatorUsers.status, operatorUsers.body.message], [403, '只有管理员可以执行此操作'])

    const operatorCreate = await call('/api/livestock', {
      method: 'POST', headers: operatorHeaders,
      body: JSON.stringify({ id: 'SC-2026-90009', breed: '高原山羊', sex: 'male', sourceType: 'purchased', pastureId: 'P-A-03', purchaseDate: '2026-06-01' }),
    })
    assert.equal(operatorCreate.status, 201)
    assert.equal((await call('/api/livestock/SC-2026-90001', { headers: operatorHeaders })).status, 404)
    assert.equal((await call('/api/livestock/stats', { headers: operatorHeaders })).body.data.total, 1)

    const deactivated = await call(`/api/users/${operator.body.data.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ isActive: false }),
    })
    assert.deepEqual([deactivated.status, deactivated.body.message, deactivated.body.data.isActive], [200, '用户信息已更新', false])
    assert.equal((await call('/api/auth/me', { headers: operatorHeaders })).status, 401)

    const reactivated = await call(`/api/users/${operator.body.data.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ isActive: true }),
    })
    assert.equal(reactivated.body.data.isActive, true)

    const reset = await call(`/api/users/${operator.body.data.id}/reset-password`, { method: 'POST', headers })
    assert.deepEqual(
      [reset.status, reset.body.message, typeof reset.body.data.temporaryPassword, reset.body.data.user.mustChangePassword],
      [200, '已重置密码，请将临时密码交给用户', 'string', true],
    )

    const selfReset = await call(`/api/users/${me.body.data.id}/reset-password`, { method: 'POST', headers })
    assert.deepEqual([selfReset.status, selfReset.body.message], [400, '请使用修改密码功能更改自己的密码'])

    const selfDeactivate = await call(`/api/users/${me.body.data.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ isActive: false }),
    })
    assert.deepEqual([selfDeactivate.status, selfDeactivate.body.message], [400, '不能停用当前登录的管理员'])

    const usersList = await call('/api/users', { headers })
    assert.deepEqual([usersList.body.data[0].role, usersList.body.data.some((user) => 'password_hash' in user)], ['admin', false])

    // --- logout ---
    const logout = await call('/api/auth/logout', { method: 'POST', headers })
    assert.deepEqual([logout.body.message, logout.body.data.loggedOut], ['已退出登录', true])
    assert.equal((await call('/api/auth/me', { headers })).status, 401)
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    store?.closeDatabase()
    delete process.env.LIVESTOCK_DB_FILE
    delete process.env.LIVESTOCK_SEED_FILE
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
