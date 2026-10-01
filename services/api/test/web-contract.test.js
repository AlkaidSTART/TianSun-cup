import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const seedFile = path.resolve(currentDir, '..', 'data', 'livestock.seed.json')

// The H5/mobile client (apps/pasture-web) reads these fields directly. This
// guards the front-end contract: renaming or nulling any of them would break
// the dashboard map, the alert list and the consultation thread silently.
test('contract: responses keep the fields the mobile client renders', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiansun-webcontract-'))
  process.env.LIVESTOCK_DB_FILE = path.join(tempDir, 'web.sqlite')
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
      return { status: response.status, body: await response.json().catch(() => null) }
    }

    auth.bootstrapInitialAdmin({ username: 'admin', displayName: '管理员', password: 'StrongAdminPass123!' })
    const login = await call('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'mp-weixin' },
      body: JSON.stringify({ username: 'admin', password: 'StrongAdminPass123!' }),
    })
    const headers = { Authorization: `Bearer ${login.body.data.token}`, 'Content-Type': 'application/json' }

    const expectKeys = (actual, expected, label) => {
      for (const key of expected) {
        assert.ok(key in actual, `${label} is missing "${key}"; mobile client reads it`)
      }
    }

    // pastureApi.list / detail
    const pastures = await call('/api/pastures', { headers })
    expectKeys(pastures.body.data[0], [
      'id', 'name', 'quality', 'qualityLabel', 'areaSize', 'capacity',
      'currentLoad', 'pressure', 'coverage', 'overloaded', 'tone',
    ], 'pasture zone')
    const detail = await call('/api/pastures/P-A-01', { headers })
    expectKeys(detail.body.data.metrics, ['coverage', 'grassHeight', 'soilMoisture'], 'pasture metrics')
    const carrying = await call('/api/pastures/carrying-capacity', { headers })
    expectKeys(carrying.body.data, [
      'averagePressure', 'peakPressure', 'peakPastureId', 'peakPastureName', 'overloadedCount', 'zoneCount',
    ], 'carrying capacity')
    const pressure = await call('/api/pastures/pressure?days=7', { headers })
    expectKeys(pressure.body.data[0], ['date', 'averagePressure', 'zones'], 'pressure day')

    // alertApi.list / summary / rules
    const alerts = await call('/api/alerts', { headers })
    expectKeys(alerts.body.data[0], [
      'id', 'type', 'severity', 'targetType', 'targetId', 'title', 'detail',
      'status', 'statusLabel', 'triggeredAt', 'handledByName', 'handledAt',
    ], 'alert record')
    const summary = await call('/api/alerts/summary', { headers })
    expectKeys(summary.body.data, ['total', 'pending', 'handling', 'resolved', 'resolvedRate', 'bySeverity', 'date'], 'alert summary')
    const rules = await call('/api/alerts/rules', { headers })
    expectKeys(rules.body.data, ['temperatureAbove', 'pressureAbove', 'reportTimeoutMinutes', 'units'], 'alert rules')

    // telemetryApi.report / latest / summary / history
    const sample = await call('/api/telemetry', {
      method: 'POST', headers,
      body: JSON.stringify({
        livestockId: 'SC-2026-00286', recordedAt: new Date().toISOString(),
        longitude: 102.013, latitude: 33.028, temperature: 40.7, heartRate: 62, steps: 2340, rumination: 42,
      }),
    })
    assert.equal(sample.status, 201, JSON.stringify(sample.body))
    const latest = await call('/api/telemetry/latest', { headers })
    expectKeys(latest.body.data[0], [
      'livestockId', 'status', 'statusLabel', 'owner', 'pastureId', 'pastureName',
      'longitude', 'latitude', 'temperature', 'heartRate', 'steps', 'rumination',
      'recordedAt', 'staleMinutes',
    ], 'latest position')
    const telemetrySummary = await call('/api/telemetry/summary', { headers })
    expectKeys(telemetrySummary.body.data, [
      'total', 'online', 'offline', 'normal', 'attention', 'abnormal',
      'onlineRate', 'healthRate', 'reportingWithinMinutes', 'date',
    ], 'telemetry summary')
    const history = await call('/api/telemetry/SC-2026-00286', { headers })
    expectKeys(history.body.data[0], [
      'livestockId', 'recordedAt', 'longitude', 'latitude',
      'temperature', 'heartRate', 'steps', 'rumination', 'healthStatus', 'source',
    ], 'telemetry sample')

    // consultationApi.list / detail / create / sendMessage
    const created = await call('/api/consultations', {
      method: 'POST', headers,
      body: JSON.stringify({ symptoms: ['体温偏高'], description: '体温 40.7' }),
    })
    expectKeys(created.body.data, [
      'id', 'code', 'userId', 'livestockId', 'pastureId', 'symptoms', 'description', 'title',
      'status', 'statusLabel', 'doctorName', 'messageCount', 'summary', 'createdAt', 'updatedAt', 'messages',
    ], 'consultation detail')
    expectKeys(created.body.data.messages[0], ['id', 'role', 'authorName', 'text', 'createdAt'], 'consultation message')
    const sent = await call(`/api/consultations/${created.body.data.id}/messages`, {
      method: 'POST', headers, body: JSON.stringify({ text: '补充：饮水正常' }),
    })
    expectKeys(sent.body.data, ['id', 'role', 'authorName', 'text', 'createdAt'], 'sent message')
    const list = await call('/api/consultations', { headers })
    expectKeys(list.body.data[0], [
      'id', 'code', 'title', 'summary', 'status', 'statusLabel', 'doctorName', 'messageCount', 'createdAt',
    ], 'consultation summary')

    // meta/options must keep feeding the livestock form Selects.
    const meta = await call('/api/meta/options')
    assert.deepEqual(
      meta.body.data.pastures.map((item) => item.id), ['P-A-01', 'P-A-02', 'P-A-03'],
      'the livestock form binds pasture options by id',
    )
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    store?.closeDatabase()
    delete process.env.LIVESTOCK_DB_FILE
    delete process.env.LIVESTOCK_SEED_FILE
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
