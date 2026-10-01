import { db } from './db.js'
import { evaluateLivestockSample } from './alerts-store.js'
import { getLivestock, getStats } from './store.js'
import { ApiError, actorScope, cleanText, localDateValue, numberOrNull, readPagination, toIso } from './shared.js'

const healthStatuses = new Set(['normal', 'attention', 'abnormal'])
const metricColumns = {
  temperature: 'temperature',
  heartRate: 'heart_rate',
  steps: 'steps',
  rumination: 'rumination',
}
const defaultWindowMs = 24 * 60 * 60 * 1000
const maxWindowMs = 31 * 24 * 60 * 60 * 1000
const maxHistoryLimit = 1000

const sampleSelect = `
  SELECT
    livestock_id AS livestockId,
    recorded_at AS recordedAt,
    longitude,
    latitude,
    temperature,
    heart_rate AS heartRate,
    steps,
    rumination,
    health_status AS healthStatus,
    source
  FROM livestock_telemetry
`

function minutesSince(isoTimestamp, now = new Date()) {
  const elapsed = now.getTime() - Date.parse(isoTimestamp)
  return Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed / 60000)) : null
}

function validateSample(payload) {
  const errors = {}
  const livestockId = cleanText(payload.livestockId).toUpperCase()
  const recordedAt = toIso(payload.recordedAt)
  const longitude = numberOrNull(payload.longitude)
  const latitude = numberOrNull(payload.latitude)
  const healthStatus = cleanText(payload.healthStatus)

  if (!livestockId) errors.livestockId = '请填写牲畜耳标号'
  if (!recordedAt) errors.recordedAt = '上报时间格式不正确'
  if (longitude === null || longitude < -180 || longitude > 180) errors.longitude = '经度需在 -180 到 180 之间'
  if (latitude === null || latitude < -90 || latitude > 90) errors.latitude = '纬度需在 -90 到 90 之间'
  if (healthStatus && !healthStatuses.has(healthStatus)) errors.healthStatus = '请选择有效的健康状态'

  if (Object.keys(errors).length) throw new ApiError(400, '遥测数据校验失败', errors)

  return {
    livestockId,
    recordedAt,
    longitude,
    latitude,
    temperature: numberOrNull(payload.temperature),
    heartRate: numberOrNull(payload.heartRate),
    steps: numberOrNull(payload.steps),
    rumination: numberOrNull(payload.rumination),
    healthStatus: healthStatus || null,
    source: cleanText(payload.source) || 'device',
  }
}

// Writes the sample, refreshes the livestock record's current values, and
// re-evaluates the alert rules -- all in one transaction so a failure cannot
// leave the archive updated without its alerts (or the reverse).
export async function recordSample(payload, actor) {
  const sample = validateSample(payload)
  const livestock = await getLivestock(sample.livestockId, actor)

  const now = new Date()
  const nowIso = now.toISOString()
  const previousReportAt = livestock.lastReportAt ? Date.parse(livestock.lastReportAt) : Number.NaN
  const isNewer = !Number.isFinite(previousReportAt) || Date.parse(sample.recordedAt) > previousReportAt

  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`
      INSERT INTO livestock_telemetry (
        livestock_id, recorded_at, longitude, latitude, temperature,
        heart_rate, steps, rumination, health_status, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sample.livestockId, sample.recordedAt, sample.longitude, sample.latitude, sample.temperature,
      sample.heartRate, sample.steps, sample.rumination, sample.healthStatus, sample.source, nowIso,
    )

    if (isNewer) {
      db.prepare(`
        UPDATE livestock SET
          temperature = ?, heart_rate = ?, steps = ?, rumination = ?,
          last_report_at = ?, status = COALESCE(?, status), updated_at = ?
        WHERE id = ?
      `).run(
        sample.temperature, sample.heartRate, sample.steps, sample.rumination,
        sample.recordedAt, sample.healthStatus, nowIso, sample.livestockId,
      )
    }

    evaluateLivestockSample({ ...livestock, userId: livestock.userId }, sample, now)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return db.prepare(`${sampleSelect} WHERE livestock_id = ? AND recorded_at = ?`).get(sample.livestockId, sample.recordedAt)
}

export async function listLatestSamples(query = {}, actor) {
  const scope = actorScope(actor, 'l.user_id')
  const clauses = []
  const parameters = []
  if (scope.sql) { clauses.push(scope.sql); parameters.push(...scope.parameters) }

  const pastureId = cleanText(query.pastureId).toUpperCase()
  if (pastureId) { clauses.push('l.pasture_id = ?'); parameters.push(pastureId) }
  const status = cleanText(query.status)
  if (status) { clauses.push('l.status = ?'); parameters.push(status) }

  const { pageSize, offset } = readPagination({ pageSize: 200, ...query })
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db.prepare(`
    SELECT
      l.id AS livestockId,
      l.status,
      l.owner,
      l.pasture_id AS pastureId,
      l.pasture_name AS pastureName,
      t.longitude, t.latitude, t.temperature,
      t.heart_rate AS heartRate, t.steps, t.rumination,
      t.recorded_at AS recordedAt
    FROM livestock l
    INNER JOIN livestock_telemetry t ON t.id = (
      SELECT id FROM livestock_telemetry
      WHERE livestock_id = l.id
      ORDER BY datetime(recorded_at) DESC, id DESC
      LIMIT 1
    )
    ${where}
    ORDER BY datetime(t.recorded_at) DESC, l.id ASC
    LIMIT ? OFFSET ?
  `).all(...parameters, pageSize, offset)

  const statusLabels = { normal: '正常', attention: '需关注', abnormal: '异常', offline: '离线' }
  return rows.map((row) => ({ ...row, statusLabel: statusLabels[row.status] || row.status, staleMinutes: minutesSince(row.recordedAt) }))
}

export async function listSampleHistory(livestockId, query = {}, actor) {
  const livestock = await getLivestock(livestockId, actor)
  const now = new Date()
  const from = query.from ? toIso(query.from) : new Date(now.getTime() - defaultWindowMs).toISOString()
  const to = query.to ? toIso(query.to) : now.toISOString()
  if (!from || !to) throw new ApiError(400, '查询时间格式不正确', { from: '时间需为 ISO 格式，例如 2026-10-01T00:00:00.000Z' })
  if (Date.parse(to) - Date.parse(from) > maxWindowMs) throw new ApiError(400, '查询区间不能超过 31 天')
  if (Date.parse(from) > Date.parse(to)) throw new ApiError(400, '查询起始时间不能晚于结束时间')

  const limit = Math.min(maxHistoryLimit, Math.max(1, Math.trunc(Number(query.limit)) || 200))
  const metric = cleanText(query.metric)
  const column = metric ? metricColumns[metric] : undefined
  if (metric && !column) {
    throw new ApiError(400, '不支持该指标', { metric: '可选 temperature、heartRate、steps、rumination' })
  }

  if (column) {
    // Return the requested metric under its own name so the client can chart it
    // without knowing the column layout.
    const alias = metric === 'heartRate' ? 'heart_rate' : metric
    const rows = db.prepare(`
      SELECT recorded_at AS recordedAt, ${alias} AS ${metric}
      FROM livestock_telemetry
      WHERE livestock_id = ? AND datetime(recorded_at) BETWEEN datetime(?) AND datetime(?)
      ORDER BY datetime(recorded_at) DESC, id DESC
      LIMIT ?
    `).all(livestock.id, from, to, limit)
    return rows.reverse()
  }

  const rows = db.prepare(`
    ${sampleSelect}
    WHERE livestock_id = ? AND datetime(recorded_at) BETWEEN datetime(?) AND datetime(?)
    ORDER BY datetime(recorded_at) DESC, id DESC
    LIMIT ?
  `).all(livestock.id, from, to, limit)
  return rows.reverse()
}

export async function getTelemetrySummary(actor) {
  const stats = await getStats(actor)
  const scope = actorScope(actor)
  const where = scope.sql ? `WHERE ${scope.sql}` : ''
  const rows = db.prepare(`SELECT id, status, last_report_at AS lastReportAt FROM livestock ${where}`).all(...scope.parameters)

  const now = new Date()
  const staleLimit = 30
  let offline = 0
  for (const record of rows) {
    const staleMinutes = record.lastReportAt ? minutesSince(record.lastReportAt, now) : null
    if (record.status === 'offline' || staleMinutes === null || staleMinutes > staleLimit) offline += 1
  }

  const total = Number(stats.total)
  return {
    total,
    online: total - offline,
    offline,
    normal: Number(stats.normal),
    attention: Number(stats.attention),
    abnormal: Number(stats.abnormal),
    onlineRate: total === 0 ? 0 : Math.round(((total - offline) / total) * 100) / 100,
    healthRate: total === 0 ? 0 : Math.round((Number(stats.normal) / total) * 1000) / 1000,
    reportingWithinMinutes: staleLimit,
    date: localDateValue(now),
  }
}
