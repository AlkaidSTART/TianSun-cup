import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installMaxKBMock } from '../test-helpers/maxkb-mock.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const seedFile = path.resolve(currentDir, '..', 'data', 'livestock.seed.json')
const adminPassword = 'StrongAdminPass123!'

// Covers docs/api-contract.md chapter 9: pasture zones, alerts, telemetry and
// consultations -- the four groups added on top of the migrated baseline.
test('contract: pasture, alert, telemetry and consultation endpoints', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiansun-features-'))
  process.env.LIVESTOCK_DB_FILE = path.join(tempDir, 'features.sqlite')
  process.env.LIVESTOCK_SEED_FILE = seedFile
  const maxkb = installMaxKBMock()
  let store
  let server
  try {
    const [{ default: app }, importedStore, auth, { db }] = await Promise.all([
      import('../src/app.js'), import('../src/store.js'),
      import('../src/auth-store.js'), import('../src/db.js'),
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
      return { status: response.status, body }
    }
    async function login(username, password) {
      const response = await call('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'mp-weixin' },
        body: JSON.stringify({ username, password }),
      })
      assert.equal(response.body.code, 0, JSON.stringify(response.body))
      return response.body.data.token
    }
    async function createOperator(username, displayName) {
      const created = await call('/api/users', {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({ username, displayName, password: 'InitialOperatorPass123!', role: 'operator' }),
      })
      assert.equal(created.status, 201, JSON.stringify(created.body))
      const token = await login(username, 'InitialOperatorPass123!')
      const rotated = await call('/api/auth/password', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'InitialOperatorPass123!', newPassword: 'RotatedOperatorPass123!' }),
      })
      assert.equal(rotated.status, 200, JSON.stringify(rotated.body))
      return { id: created.body.data.id, headers: { Authorization: `Bearer ${rotated.body.data.token}`, 'Content-Type': 'application/json' } }
    }

    auth.bootstrapInitialAdmin({ username: 'admin', displayName: '管理员', password: adminPassword })
    const adminToken = await login('admin', adminPassword)
    const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }

    // --- 9.1 pastures ---
    assert.equal(
      Number(db.prepare('SELECT COUNT(*) AS count FROM pastures').get().count), 3,
      'pasture units must be seeded once',
    )

    const pastures = await call('/api/pastures', { headers: adminHeaders })
    assert.deepEqual(pastures.body.data.map((pasture) => pasture.id), ['P-A-01', 'P-A-02', 'P-A-03'])
    const donggou = pastures.body.data.find((pasture) => pasture.id === 'P-A-01')
    assert.deepEqual(
      [donggou.name, donggou.quality, donggou.qualityLabel, donggou.areaSize, donggou.capacity, typeof donggou.pressure, donggou.tone],
      ['东沟草场', 'excellent', '优良', 320, 60, 'number', 'ok'],
    )
    // Seed data puts 5 non-offline animals on P-A-01 (6 minus one offline),
    // out of a capacity of 60.
    assert.equal(donggou.currentLoad, 5)
    assert.equal(donggou.pressure, 0.08)
    assert.equal(donggou.overloaded, false)

    const single = await call('/api/pastures/P-A-01', { headers: adminHeaders })
    assert.deepEqual(Object.keys(single.body.data.metrics).sort(), ['coverage', 'grassHeight', 'soilMoisture'])
    const pastureMissing = await call('/api/pastures/P-Z-99', { headers: adminHeaders })
    assert.deepEqual([pastureMissing.status, pastureMissing.body.message], [404, '未找到该草场'])

    const capacity = await call('/api/pastures/carrying-capacity', { headers: adminHeaders })
    assert.deepEqual(
      Object.keys(capacity.body.data).sort(),
      ['averagePressure', 'overloadedCount', 'peakPastureId', 'peakPastureName', 'peakPressure', 'zoneCount'],
    )
    assert.equal(capacity.body.data.zoneCount, 3)

    // Static segments must win over /pastures/:id.
    assert.equal((await call('/api/pastures/pressure', { headers: adminHeaders })).status, 200)
    assert.equal(capacity.status, 200)

    const history = await call('/api/pastures/pressure?days=7', { headers: adminHeaders })
    assert.equal(history.body.data.length, 1, 'only today has a snapshot on a fresh database')
    assert.deepEqual(
      Object.keys(history.body.data[0]).sort(),
      ['averagePressure', 'date', 'zones'],
    )
    assert.equal(history.body.data[0].zones.length, 3)

    // Repeated reads must upsert one row per pasture per day, not append.
    await call('/api/pastures', { headers: adminHeaders })
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM pasture_pressure_daily').get().count), 3)

    // Pushing P-A-03 over its capacity raises a system-owned pressure alert.
    for (let index = 0; index < 56; index += 1) {
      await call('/api/livestock', {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({
          id: `SC-2026-7${String(index).padStart(4, '0')}`, breed: '九龙牦牛', sex: 'female',
          sourceType: 'purchased', pastureId: 'P-A-03', purchaseDate: '2026-06-01',
        }),
      })
    }
    const overloadedPastures = await call('/api/pastures', { headers: adminHeaders })
    const hegu = overloadedPastures.body.data.find((pasture) => pasture.id === 'P-A-03')
    // One seeded animal plus the 56 added above = 57 against a capacity of 55.
    assert.deepEqual([hegu.currentLoad, hegu.capacity, hegu.overloaded, hegu.tone], [57, 55, true, 'warn'])
    assert.equal(hegu.pressure, 1.04)

    // --- 9.2 alerts ---
    const pressureAlerts = await call('/api/alerts?type=pressure', { headers: adminHeaders })
    assert.equal(pressureAlerts.body.data.length, 1)
    const pressureAlert = pressureAlerts.body.data[0]
    assert.deepEqual(
      [pressureAlert.severity, pressureAlert.targetType, pressureAlert.targetId, pressureAlert.status, pressureAlert.statusLabel],
      ['warn', 'pasture', 'P-A-03', 'pending', '待处理'],
    )

    // Reading again must refresh the copy, not open a duplicate.
    await call('/api/alerts', { headers: adminHeaders })
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE rule_key = 'pressure_high'").get().count), 1)

    // Every seeded animal reported days ago, so the stale sweep flags them.
    const deviceAlerts = await call('/api/alerts?type=device&pageSize=100', { headers: adminHeaders })
    assert.equal(deviceAlerts.body.data.length, 7 + 56)
    assert.equal(deviceAlerts.body.data[0].severity, 'off')

    // The sweep is idempotent too.
    const deviceAlertsAgain = await call('/api/alerts?type=device&pageSize=100', { headers: adminHeaders })
    assert.equal(deviceAlertsAgain.body.data.length, deviceAlerts.body.data.length)

    const openAlerts = await call('/api/alerts?status=open&pageSize=200', { headers: adminHeaders })
    assert.equal(openAlerts.body.data.length, 7 + 56 + 1)
    assert.equal(openAlerts.body.data.every((alert) => alert.status !== 'resolved'), true)

    const rules = await call('/api/alerts/rules', { headers: adminHeaders })
    assert.deepEqual(
      [rules.body.data.temperatureAbove, rules.body.data.pressureAbove, rules.body.data.reportTimeoutMinutes],
      [40.0, 0.80, 30],
    )

    const handled = await call(`/api/alerts/${pressureAlert.id}/handle`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'handling' }),
    })
    assert.deepEqual([handled.status, handled.body.message, handled.body.data.status], [200, '告警已标记为处理中', 'handling'])
    const handledAgain = await call(`/api/alerts/${pressureAlert.id}/handle`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'handling' }),
    })
    assert.equal(handledAgain.body.data.status, 'handling')

    const resolved = await call(`/api/alerts/${pressureAlert.id}/handle`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'resolved' }),
    })
    assert.deepEqual(
      [resolved.body.message, resolved.body.data.status, resolved.body.data.handledByName, typeof resolved.body.data.handledAt],
      ['告警已处理', 'resolved', '管理员', 'string'],
    )

    const badStatus = await call(`/api/alerts/${pressureAlert.id}/handle`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'deleted' }),
    })
    assert.deepEqual([badStatus.status, badStatus.body.message], [400, '告警状态不正确'])

    const missingAlert = await call('/api/alerts/999999/handle', {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'resolved' }),
    })
    assert.deepEqual([missingAlert.status, missingAlert.body.message], [404, '未找到该告警'])

    const summary = await call('/api/alerts/summary', { headers: adminHeaders })
    // 63 device alerts (7 seeded + 56 added) plus one pasture pressure alert.
    assert.equal(summary.body.data.total, 64)
    assert.equal(summary.body.data.resolved, 1)
    assert.equal(summary.body.data.resolvedRate, Math.round((1 / 64) * 100) / 100)
    assert.deepEqual(Object.keys(summary.body.data.bySeverity).sort(), ['bad', 'off', 'warn'])
    assert.equal(summary.body.data.bySeverity.off, 63)
    assert.equal(summary.body.data.bySeverity.warn, 1)

    // --- 9.3 telemetry ---
    const newLivestockId = 'SC-2026-90001'
    await call('/api/livestock', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ id: newLivestockId, breed: '九龙牦牛', sex: 'female', sourceType: 'purchased', pastureId: 'P-A-01', purchaseDate: '2026-06-01' }),
    })

    const badSample = await call('/api/telemetry', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ livestockId: newLivestockId, recordedAt: 'not-a-time', longitude: 999, latitude: 999 }),
    })
    assert.deepEqual(
      [badSample.status, badSample.body.message, Object.keys(badSample.body.details).sort()],
      [400, '遥测数据校验失败', ['latitude', 'longitude', 'recordedAt']],
    )

    const unknownAnimal = await call('/api/telemetry', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ livestockId: 'SC-9999-99999', recordedAt: '2026-10-01T06:30:00.000Z', longitude: 102, latitude: 33 }),
    })
    assert.deepEqual([unknownAnimal.status, unknownAnimal.body.message], [404, '未找到该牲畜档案'])

    // A rejected sample must leave both the archive and the alert table alone.
    const beforeStatus = (await call('/api/livestock/' + newLivestockId, { headers: adminHeaders })).body.data.status
    assert.equal(beforeStatus, 'normal')

    const sample = await call('/api/telemetry', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        livestockId: newLivestockId, recordedAt: '2026-10-01T06:30:00.000Z',
        longitude: 102.013, latitude: 33.028, temperature: 40.7, heartRate: 62,
        steps: 2340, rumination: 42, healthStatus: 'abnormal',
      }),
    })
    assert.deepEqual([sample.status, sample.body.message, sample.body.data.livestockId], [201, '遥测数据已接收', newLivestockId])

    const afterSample = (await call('/api/livestock/' + newLivestockId, { headers: adminHeaders })).body.data
    assert.deepEqual(
      [afterSample.status, afterSample.temperature, afterSample.heartRate, afterSample.steps, afterSample.rumination, afterSample.lastReportAt],
      ['abnormal', 40.7, 62, 2340, 42, '2026-10-01T06:30:00.000Z'],
    )

    const temperatureAlerts = await call('/api/alerts?type=temperature', { headers: adminHeaders })
    assert.equal(temperatureAlerts.body.data.length, 1)
    assert.deepEqual(
      [temperatureAlerts.body.data[0].severity, temperatureAlerts.body.data[0].targetId, temperatureAlerts.body.data[0].status],
      ['bad', newLivestockId, 'pending'],
    )
    // The sample's timestamp is 06:30Z, which is already outside the 30-minute
    // reporting window by the time the test runs, so the read-time stale sweep
    // keeps the offline alert open. The fresh sample also resolved it inline.
    const offlineHistory = await call(`/api/alerts?type=device&targetId=${newLivestockId}`, { headers: adminHeaders })
    assert.deepEqual(
      [offlineHistory.body.data.length, offlineHistory.body.data[0].status],
      [1, 'pending'],
      'the device alert exists for this animal',
    )

    // An older sample must not roll the archive back.
    await call('/api/telemetry', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        livestockId: newLivestockId, recordedAt: '2026-10-01T05:00:00.000Z',
        longitude: 102.010, latitude: 33.020, temperature: 41.5, healthStatus: 'abnormal',
      }),
    })
    const notRolledBack = (await call('/api/livestock/' + newLivestockId, { headers: adminHeaders })).body.data
    assert.deepEqual([notRolledBack.temperature, notRolledBack.lastReportAt, notRolledBack.status], [40.7, '2026-10-01T06:30:00.000Z', 'abnormal'])

    // The archive status follows the newest sample (abnormal), so the
    // live-position feed reports it as such.
    const abnormalLive = await call('/api/telemetry/latest?status=abnormal', { headers: adminHeaders })
    assert.deepEqual(abnormalLive.body.data.map((item) => item.livestockId), [newLivestockId])

    const latestAll = await call('/api/telemetry/latest', { headers: adminHeaders })
    assert.equal(latestAll.body.data.length, 1, 'only animals with samples appear')
    assert.deepEqual(
      [latestAll.body.data[0].livestockId, latestAll.body.data[0].pastureId, latestAll.body.data[0].statusLabel, typeof latestAll.body.data[0].staleMinutes],
      [newLivestockId, 'P-A-01', '异常', 'number'],
    )
    const latestByPasture = await call('/api/telemetry/latest?pastureId=P-A-02', { headers: adminHeaders })
    assert.equal(latestByPasture.body.data.length, 0)

    // A reading back inside the threshold resolves the temperature alert, and
    // this one is recent enough that the offline alert stays resolved.
    await call('/api/telemetry', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        livestockId: newLivestockId, recordedAt: new Date().toISOString(),
        longitude: 102.014, latitude: 33.029, temperature: 39.1, healthStatus: 'normal',
      }),
    })
    const closedTemperature = await call('/api/alerts?type=temperature&status=open', { headers: adminHeaders })
    assert.equal(closedTemperature.body.data.length, 0)
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE rule_key = 'temperature_high'").get().count), 1)
    assert.equal(
      (await call(`/api/alerts?type=device&targetId=${newLivestockId}&status=open`, { headers: adminHeaders })).body.data.length,
      0,
      'a recent normal reading leaves the device alert resolved',
    )

    // Explicit window keeps this assertion independent of the wall clock.
    // The newest sample is written with the current time, so it only shows up
    // when "now" happens to fall inside this fixed window.
    const fullWindow = 'from=2026-10-01T00:00:00.000Z&to=2026-10-01T08:00:00.000Z'
    const historyWindow = await call(`/api/telemetry/${newLivestockId}?${fullWindow}`, { headers: adminHeaders })
    // One sample is written with the real current time, so assert ordering and
    // membership rather than an exact array.
    const allStamps = historyWindow.body.data.map((sample) => sample.recordedAt)
    assert.ok(allStamps.includes('2026-10-01T05:00:00.000Z'), 'the older sample is in range')
    assert.ok(allStamps.includes('2026-10-01T06:30:00.000Z'), 'the 06:30 sample is in range')
    assert.deepEqual([...allStamps].sort(), allStamps, 'history is ascending by recordedAt')

    // The default window is the last 24 hours and never includes future timestamps.
    const nowIso = new Date().toISOString()
    const defaultWindow = await call(`/api/telemetry/${newLivestockId}`, { headers: adminHeaders })
    assert.ok(defaultWindow.body.data.length > 0)
    assert.equal(defaultWindow.body.data.every((sample) => sample.recordedAt <= nowIso), true)
    assert.equal(defaultWindow.body.data.every((sample) => sample.recordedAt >= new Date(Date.now() - 86_400_000).toISOString()), true)

    const metricOnly = await call(`/api/telemetry/${newLivestockId}?${fullWindow}&metric=temperature`, { headers: adminHeaders })
    assert.deepEqual(Object.keys(metricOnly.body.data[0]).sort(), ['recordedAt', 'temperature'])

    const limited = await call(`/api/telemetry/${newLivestockId}?${fullWindow}&limit=1`, { headers: adminHeaders })
    assert.equal(limited.body.data.length, 1, 'limit caps the number of samples returned')
    assert.equal(
      limited.body.data[0].recordedAt,
      allStamps[allStamps.length - 1],
      'limit keeps the newest sample',
    )

    const badMetric = await call(`/api/telemetry/${newLivestockId}?metric=weight`, { headers: adminHeaders })
    assert.deepEqual([badMetric.status, badMetric.body.message], [400, '不支持该指标'])

    const wideWindow = await call(`/api/telemetry/${newLivestockId}?from=2026-01-01T00:00:00.000Z&to=2026-06-01T00:00:00.000Z`, { headers: adminHeaders })
    assert.deepEqual([wideWindow.status, wideWindow.body.message], [400, '查询区间不能超过 31 天'])

    const backwardsWindow = await call(`/api/telemetry/${newLivestockId}?from=2026-10-02T00:00:00.000Z&to=2026-10-01T00:00:00.000Z`, { headers: adminHeaders })
    assert.deepEqual([backwardsWindow.status, backwardsWindow.body.message], [400, '查询起始时间不能晚于结束时间'])

    const telemetryStats = await call('/api/telemetry/summary', { headers: adminHeaders })
    assert.deepEqual(
      [telemetryStats.body.data.total, telemetryStats.body.data.reportingWithinMinutes, typeof telemetryStats.body.data.healthRate],
      [64, 30, 'number'],
    )
    assert.equal(telemetryStats.body.data.online + telemetryStats.body.data.offline, telemetryStats.body.data.total)

    // --- 9.4 consultations ---
    const emptyConsultation = await call('/api/consultations', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ symptoms: [], description: '' }),
    })
    assert.deepEqual([emptyConsultation.status, emptyConsultation.body.message], [400, '请至少选择一项症状或填写描述'])

    const consultation = await call('/api/consultations', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ symptoms: ['体温偏高', '反刍减少'], description: 'SC-2026-90001 今天体温 40.7℃', livestockId: newLivestockId }),
    })
    assert.deepEqual(
      [consultation.status, consultation.body.message, consultation.body.data.statusLabel, consultation.body.data.title, consultation.body.data.messageCount],
      [201, 'AI 问诊已创建', 'AI 已回复', `${newLivestockId} · 体温偏高`, 2],
    )
    assert.match(consultation.body.data.code, /^VC-\d{8}-\d{3}$/)
    const consultationId = consultation.body.data.id

    const listed = await call('/api/consultations', { headers: adminHeaders })
    assert.deepEqual([listed.body.data.length, listed.body.data[0].id], [1, consultationId])

    const detail = await call(`/api/consultations/${consultationId}`, { headers: adminHeaders })
    assert.equal(detail.body.data.messages.length, 2)
    assert.deepEqual(detail.body.data.messages.map((message) => message.role), ['user', 'assistant'])
    assert.match(maxkb.calls[0].messages[0].content, /体温偏高/)

    const reply = await call(`/api/consultations/${consultationId}/messages`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ text: '请先隔离观察，明早复测体温。' }),
    })
    assert.deepEqual([reply.status, reply.body.message, reply.body.data.role], [201, '已发送', 'user'])

    const afterReply = await call(`/api/consultations/${consultationId}`, { headers: adminHeaders })
    assert.deepEqual([afterReply.body.data.status, afterReply.body.data.statusLabel, afterReply.body.data.messages.length], ['answered', 'AI 已回复', 4])
    assert.equal(afterReply.body.data.summary, 'AI 测试回复 2')
    assert.equal(maxkb.calls[1].chat_id, maxkb.chatIds[0])
    assert.equal(maxkb.calls[1].messages[0].content, '请先隔离观察，明早复测体温。')

    maxkb.failOnce()
    const failedFollowup = await call(`/api/consultations/${consultationId}/messages`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ text: '补充：精神不振' }),
    })
    assert.deepEqual([failedFollowup.status, failedFollowup.body.data.aiError], [201, true])
    const pendingFollowup = await call(`/api/consultations/${consultationId}`, { headers: adminHeaders })
    assert.deepEqual([pendingFollowup.body.data.status, pendingFollowup.body.data.messages.at(-1).role], ['open', 'user'])
    const retriedFollowup = await call(`/api/consultations/${consultationId}/retry`, { method: 'POST', headers: adminHeaders })
    assert.deepEqual([retriedFollowup.status, retriedFollowup.body.data.status], [200, 'answered'])
    assert.equal(maxkb.calls.at(-1).chat_id, maxkb.chatIds[1], 'retry keeps the existing MaxKB conversation')

    const closed = await call(`/api/consultations/${consultationId}`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'closed' }),
    })
    assert.deepEqual([closed.status, closed.body.message, closed.body.data.statusLabel], [200, '问诊已关闭', '已关闭'])

    const sendAfterClose = await call(`/api/consultations/${consultationId}/messages`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ text: '还能说话吗' }),
    })
    assert.deepEqual([sendAfterClose.status, sendAfterClose.body.message], [400, '该问诊已关闭'])

    maxkb.failOnce()
    const failedAI = await call('/api/consultations', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ symptoms: ['跛行'] }),
    })
    assert.equal(failedAI.status, 201)
    assert.equal(failedAI.body.data.aiError, true)
    assert.deepEqual(failedAI.body.data.messages.map((message) => message.role), ['user'])
    const duplicate = await call(`/api/consultations/${failedAI.body.data.id}/messages`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ text: '再问一次' }),
    })
    assert.equal(duplicate.status, 409)
    const retried = await call(`/api/consultations/${failedAI.body.data.id}/retry`, {
      method: 'POST', headers: adminHeaders,
    })
    assert.deepEqual([retried.status, retried.body.data.status, retried.body.data.messages.length], [200, 'answered', 2])

    // Direct chat streams a saved user turn, incremental AI deltas, and a final detail.
    async function callStream(url, data) {
      const response = await fetch(`${base}${url}`, {
        method: 'POST', headers: adminHeaders, ...(data ? { body: JSON.stringify(data) } : {}),
      })
      assert.equal(response.headers.get('content-type').startsWith('application/x-ndjson'), true)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const first = await reader.read()
      assert.equal(first.done, false)
      let text = decoder.decode(first.value, { stream: true })
      assert.match(text, /"type":"conversation"/)
      assert.doesNotMatch(text, /"type":"done"/, 'the first chunk arrives before AI finishes')
      while (true) {
        const part = await reader.read()
        if (part.done) break
        text += decoder.decode(part.value, { stream: true })
      }
      text += decoder.decode()
      return { status: response.status, events: text.trim().split('\n').map((line) => JSON.parse(line)) }
    }
    const firstStream = await callStream('/api/consultations/stream', { text: '牦牛咳嗽两天' })
    assert.deepEqual(firstStream.events.map((event) => event.type), ['conversation', 'delta', 'delta', 'done'])
    assert.equal(firstStream.events[0].detail.messages[0].text, '牦牛咳嗽两天')
    assert.equal(firstStream.events.at(-1).detail.status, 'answered')
    assert.equal(firstStream.events.at(-1).detail.messages.at(-1).text, firstStream.events.filter((event) => event.type === 'delta').map((event) => event.text).join(''))
    const streamedId = firstStream.events[0].detail.id
    const streamChatId = maxkb.chatIds.at(-1)
    const followupStream = await callStream(`/api/consultations/${streamedId}/messages/stream`, { text: '还有流涕' })
    assert.equal(followupStream.events.at(-1).detail.messages.length, 4)
    assert.equal(maxkb.calls.at(-1).chat_id, streamChatId)
    maxkb.failOnce()
    const failedStream = await callStream('/api/consultations/stream', { text: '羊跛行' })
    assert.deepEqual(failedStream.events.map((event) => event.type), ['conversation', 'error'])
    const recovered = await callStream(`/api/consultations/${failedStream.events[0].detail.id}/retry/stream`)
    assert.equal(recovered.events.at(-1).type, 'done')
    assert.equal(recovered.events.at(-1).detail.messages.length, 2)

    // --- ownership isolation across the new endpoints ---
    const alice = await createOperator('alice', '甲')
    const bob = await createOperator('bob', '乙')

    const aliceAnimal = 'SC-2026-60001'
    await call('/api/livestock', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ id: aliceAnimal, breed: '九龙牦牛', sex: 'female', sourceType: 'purchased', pastureId: 'P-A-01', purchaseDate: '2026-06-01' }),
    })
    await call('/api/telemetry', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ livestockId: aliceAnimal, recordedAt: new Date().toISOString(), longitude: 102, latitude: 33, temperature: 39.0, healthStatus: 'normal' }),
    })

    const bobLatest = await call('/api/telemetry/latest', { headers: bob.headers })
    assert.equal(bobLatest.body.data.length, 0, 'operators only see telemetry for their own animals')
    const bobHistory = await call(`/api/telemetry/${aliceAnimal}`, { headers: bob.headers })
    assert.deepEqual([bobHistory.status, bobHistory.body.message], [404, '未找到该牲畜档案'])
    const bobSample = await call('/api/telemetry', {
      method: 'POST', headers: bob.headers,
      body: JSON.stringify({ livestockId: aliceAnimal, recordedAt: new Date().toISOString(), longitude: 102, latitude: 33 }),
    })
    assert.deepEqual([bobSample.status, bobSample.body.message], [404, '未找到该牲畜档案'])

    const aliceConsultation = await call('/api/consultations', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ symptoms: ['食欲下降'], description: '' }),
    })
    assert.equal(aliceConsultation.status, 201)
    assert.equal(maxkb.calls.at(-1).chat_id, undefined, 'a different consultation opens a new MaxKB conversation')
    const bobRead = await call(`/api/consultations/${aliceConsultation.body.data.id}`, { headers: bob.headers })
    assert.deepEqual([bobRead.status, bobRead.body.message], [404, '未找到该问诊'])
    const bobStream = await call(`/api/consultations/${aliceConsultation.body.data.id}/messages/stream`, {
      method: 'POST', headers: bob.headers, body: JSON.stringify({ text: '越权提问' }),
    })
    assert.equal(bobStream.status, 404)
    const bobClose = await call(`/api/consultations/${aliceConsultation.body.data.id}`, {
      method: 'PATCH', headers: bob.headers, body: JSON.stringify({ status: 'closed' }),
    })
    assert.deepEqual([bobClose.status, bobClose.body.message], [403, '只有管理员可以更新问诊状态'])

    const aliceList = await call('/api/consultations', { headers: alice.headers })
    assert.deepEqual(aliceList.body.data.map((item) => item.id), [aliceConsultation.body.data.id])
    const bobRetry = await call(`/api/consultations/${aliceConsultation.body.data.id}/retry`, { method: 'POST', headers: bob.headers })
    assert.equal(bobRetry.status, 404)
    const adminReplyToAlice = await call(`/api/consultations/${aliceConsultation.body.data.id}/messages`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ text: '人工回复' }),
    })
    assert.equal(adminReplyToAlice.status, 403)
    const bobList = await call('/api/consultations', { headers: bob.headers })
    assert.equal(bobList.body.data.length, 0)

    const beforeUnconfigured = (await call('/api/consultations', { headers: adminHeaders })).body.data.length
    delete process.env.MAXKB_API_KEY
    const unconfigured = await call('/api/consultations', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ symptoms: ['咳嗽'] }),
    })
    assert.equal(unconfigured.status, 503)
    assert.equal((await call('/api/consultations', { headers: adminHeaders })).body.data.length, beforeUnconfigured)
    process.env.MAXKB_API_KEY = 'agent-test-key'

    // System-owned pressure alerts stay visible to every account.
    const bobAlerts = await call('/api/alerts?type=pressure', { headers: bob.headers })
    assert.equal(bobAlerts.body.data.length, 1, 'pasture alerts are visible to all accounts')
    const bobDeviceAlerts = await call('/api/alerts?type=device', { headers: bob.headers })
    assert.equal(bobDeviceAlerts.body.data.every((alert) => alert.targetId === aliceAnimal), true)

    const bobHandlesSystemAlert = await call(`/api/alerts/${bobAlerts.body.data[0].id}/handle`, {
      method: 'PATCH', headers: bob.headers, body: JSON.stringify({ status: 'handling' }),
    })
    assert.equal(bobHandlesSystemAlert.status, 200, 'operators may act on system pasture alerts')

    // Pagination clamps to the documented maximum.
    const clamped = await call('/api/alerts?pageSize=100000', { headers: adminHeaders })
    assert.ok(clamped.body.data.length <= 200)
    const badPage = await call('/api/alerts?page=not-a-number&pageSize=-5', { headers: adminHeaders })
    assert.equal(badPage.status, 200)
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    store?.closeDatabase()
    maxkb.restore()
    delete process.env.LIVESTOCK_DB_FILE
    delete process.env.LIVESTOCK_SEED_FILE
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
