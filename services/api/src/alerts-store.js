import { db } from './db.js'
import { ApiError, actorScope, cleanText, isCalendarDate, localDateValue, readPagination } from './shared.js'

export const alertRuleConfig = {
  temperatureAbove: 40.0,
  pressureAbove: 0.80,
  reportTimeoutMinutes: 30,
}

const statusLabels = { pending: '待处理', handling: '处理中', resolved: '已处理' }

// Pasture alerts have no owning account, so they are attributed to this
// sentinel. The `alerts` unique index needs a non-NULL owner to collapse
// repeats, and the visibility rule lets every account see system alerts.
const systemOwnerId = 'system'

const alertSelect = `
  SELECT
    id,
    user_id AS userId,
    type,
    severity,
    target_type AS targetType,
    target_id AS targetId,
    title,
    detail,
    status,
    triggered_at AS triggeredAt,
    handled_by_name AS handledByName,
    handled_at AS handledAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM alerts
`

function normalizeAlert(row) {
  if (!row) return undefined
  return {
    ...row,
    id: String(row.id),
    statusLabel: statusLabels[row.status] || row.status,
  }
}

// Operators see their own alerts plus system-wide pasture alerts; admins see
// everything.
function alertScope(actor) {
  if (!actor?.id || !['admin', 'operator'].includes(actor.role)) throw new ApiError(401, '请先登录')
  if (actor.role === 'admin') return { sql: '', parameters: [] }
  return { sql: '(user_id = ? OR user_id = ?)', parameters: [actor.id, systemOwnerId] }
}

function findOpenAlert(ownerId, targetType, targetId, ruleKey) {
  return db.prepare(`
    SELECT * FROM alerts
    WHERE user_id = ? AND target_type = ? AND target_id = ? AND rule_key = ? AND resolved_at IS NULL
  `).get(ownerId, targetType, targetId, ruleKey)
}

function openAlert({ ownerId, type, severity, targetType, targetId, title, detail, ruleKey, triggeredAt }) {
  const existing = findOpenAlert(ownerId, targetType, targetId, ruleKey)
  if (existing) {
    // Condition still holds: refresh the copy without resetting the trigger
    // time, so "已持续 N 分钟" keeps counting from the original onset.
    db.prepare('UPDATE alerts SET title = ?, detail = ?, updated_at = ? WHERE id = ?')
      .run(title, detail, triggeredAt, existing.id)
    return normalizeAlert({ ...existing, title, detail, updatedAt: triggeredAt })
  }
  const now = triggeredAt
  const result = db.prepare(`
    INSERT INTO alerts (
      user_id, type, severity, target_type, target_id, title, detail, status,
      rule_key, resolved_at, triggered_at, handled_by, handled_by_name, handled_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, NULL, NULL, NULL, ?, ?)
  `).run(ownerId, type, severity, targetType, targetId, title, detail, ruleKey, now, now, now)
  return normalizeAlert(db.prepare(`${alertSelect} WHERE id = ?`).get(result.lastInsertRowid))
}

function resolveAlert({ ownerId, targetType, targetId, ruleKey, at }) {
  const existing = findOpenAlert(ownerId, targetType, targetId, ruleKey)
  if (!existing) return undefined
  db.prepare("UPDATE alerts SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?")
    .run(at, at, existing.id)
  return normalizeAlert({ ...existing, status: 'resolved', resolvedAt: at, updatedAt: at })
}

function formatNumber(value, digits = 1) {
  return Number(value).toFixed(digits)
}

function minutesSince(isoTimestamp, now = new Date()) {
  const elapsed = now.getTime() - Date.parse(isoTimestamp)
  return Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed / 60000)) : null
}

// Called from inside the telemetry write transaction, so it must not open one.
export function evaluateLivestockSample(livestock, sample, now = new Date()) {
  const triggeredAt = now.toISOString()
  const owner = livestock.userId
  const temperature = sample.temperature
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    if (temperature > alertRuleConfig.temperatureAbove) {
      openAlert({
        ownerId: owner,
        type: 'temperature',
        severity: 'bad',
        targetType: 'livestock',
        targetId: livestock.id,
        title: `${livestock.id} · 体温偏高`,
        detail: `${formatNumber(temperature)}℃ · ${livestock.pastureName} ${livestock.pastureId} · 当前采样 ${sample.recordedAt}`,
        ruleKey: 'temperature_high',
        triggeredAt,
      })
    } else {
      resolveAlert({ ownerId: owner, targetType: 'livestock', targetId: livestock.id, ruleKey: 'temperature_high', at: triggeredAt })
    }
  }

  // A fresh sample proves the device is reporting, so any offline alert closes.
  const staleMinutes = minutesSince(sample.recordedAt, now)
  if (staleMinutes !== null && staleMinutes <= alertRuleConfig.reportTimeoutMinutes) {
    resolveAlert({ ownerId: owner, targetType: 'livestock', targetId: livestock.id, ruleKey: 'device_offline', at: triggeredAt })
  }
}

// Called from inside the pressure snapshot transaction.
export function evaluatePasturePressure(pasture, now = new Date()) {
  const triggeredAt = now.toISOString()
  const scope = { ownerId: systemOwnerId, targetType: 'pasture', targetId: pasture.id, ruleKey: 'pressure_high' }
  if (pasture.overloaded) {
    openAlert({
      ...scope,
      type: 'pressure',
      severity: 'warn',
      title: `${pasture.name} · 载畜压力偏高`,
      detail: `压力指数 ${pasture.pressure} · 载畜 ${pasture.currentLoad} / ${pasture.capacity} 头`,
      triggeredAt,
    })
  } else {
    resolveAlert({ ...scope, at: triggeredAt })
  }
}

// Cheap sweep used when alerts are read: a device that stopped reporting must
// surface even though nothing writes on its behalf. Rows already stale keep
// their original trigger time via openAlert's repeat path.
export function sweepStaleDevices(actor, now = new Date()) {
  const scope = actorScope(actor)
  const where = scope.sql ? `WHERE ${scope.sql}` : ''
  const stale = db.prepare(`
    SELECT id, user_id AS userId, pasture_id AS pastureId, pasture_name AS pastureName, last_report_at AS lastReportAt
    FROM livestock ${where}
  `).all(...scope.parameters)
  const triggeredAt = now.toISOString()
  for (const record of stale) {
    const staleMinutes = record.lastReportAt ? minutesSince(record.lastReportAt, now) : null
    const isStale = staleMinutes === null || staleMinutes > alertRuleConfig.reportTimeoutMinutes
    if (isStale) {
      openAlert({
        ownerId: record.userId,
        type: 'device',
        severity: 'off',
        targetType: 'livestock',
        targetId: record.id,
        title: `${record.id} · 设备离线`,
        detail: record.lastReportAt
          ? `最后上报 ${staleMinutes} 分钟前 · ${record.pastureName} ${record.pastureId}`
          : `尚无上报记录 · ${record.pastureName} ${record.pastureId}`,
        ruleKey: 'device_offline',
        triggeredAt,
      })
    } else {
      resolveAlert({ ownerId: record.userId, targetType: 'livestock', targetId: record.id, ruleKey: 'device_offline', at: triggeredAt })
    }
  }
}

export async function listAlerts(query = {}, actor) {
  sweepStaleDevices(actor)
  const scope = alertScope(actor)
  const clauses = []
  const parameters = []
  if (scope.sql) { clauses.push(scope.sql); parameters.push(...scope.parameters) }

  const type = cleanText(query.type)
  if (type) { clauses.push('type = ?'); parameters.push(type) }
  const severity = cleanText(query.severity)
  if (severity) { clauses.push('severity = ?'); parameters.push(severity) }
  const targetId = cleanText(query.targetId)
  if (targetId) { clauses.push('target_id = ?'); parameters.push(targetId) }

  const status = cleanText(query.status)
  if (status === 'open') clauses.push("status IN ('pending', 'handling')")
  else if (status) { clauses.push('status = ?'); parameters.push(status) }

  const date = cleanText(query.date)
  if (date) {
    if (!isCalendarDate(date)) throw new ApiError(400, '日期格式不正确')
    clauses.push('date(triggered_at) = ?'); parameters.push(date)
  }

  const { pageSize, offset } = readPagination(query)
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db.prepare(`${alertSelect} ${where} ORDER BY datetime(triggered_at) DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...parameters, pageSize, offset)
    .map(normalizeAlert)
}

export async function getAlertSummary(query = {}, actor) {
  sweepStaleDevices(actor)
  const scope = alertScope(actor)
  const clauses = []
  const parameters = [...scope.parameters]
  if (scope.sql) clauses.push(scope.sql)
  const date = cleanText(query.date) || localDateValue()
  if (!isCalendarDate(date)) throw new ApiError(400, '日期格式不正确')
  clauses.push('date(triggered_at) = ?')
  parameters.push(date)
  const where = `WHERE ${clauses.join(' AND ')}`

  const rows = db.prepare(`
    SELECT status, severity, COUNT(*) AS count FROM alerts ${where} GROUP BY status, severity
  `).all(...parameters)

  const summary = { total: 0, pending: 0, handling: 0, resolved: 0, resolvedRate: 0, bySeverity: { bad: 0, warn: 0, off: 0 }, date }
  for (const row of rows) {
    const count = Number(row.count)
    summary.total += count
    summary[row.status] = (summary[row.status] || 0) + count
    summary.bySeverity[row.severity] = (summary.bySeverity[row.severity] || 0) + count
  }
  summary.resolvedRate = summary.total === 0 ? 0 : Math.round((summary.resolved / summary.total) * 100) / 100
  return summary
}

export async function getAlertRules() {
  return {
    temperatureAbove: alertRuleConfig.temperatureAbove,
    pressureAbove: alertRuleConfig.pressureAbove,
    reportTimeoutMinutes: alertRuleConfig.reportTimeoutMinutes,
    units: { temperature: '℃', pressure: '', reportTimeoutMinutes: 'min' },
  }
}

export async function handleAlert(id, payload = {}, actor) {
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) throw new ApiError(404, '未找到该告警')
  const scope = alertScope(actor)
  const suffix = scope.sql ? ` AND ${scope.sql}` : ''
  const record = db.prepare(`SELECT * FROM alerts WHERE id = ?${suffix}`).get(numericId, ...scope.parameters)
  if (!record) throw new ApiError(404, '未找到该告警')

  const status = cleanText(payload.status)
  if (!['handling', 'resolved'].includes(status)) {
    throw new ApiError(400, '告警状态不正确', { status: '只能标记为处理中或已处理' })
  }
  const now = new Date().toISOString()
  if (status === 'resolved') {
    db.prepare(`
      UPDATE alerts SET status = 'resolved', resolved_at = ?, handled_by = ?, handled_by_name = ?, handled_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, actor.id, actor.displayName, now, now, numericId)
    return { alert: normalizeAlert(db.prepare(`${alertSelect} WHERE id = ?`).get(numericId)), message: '告警已处理' }
  }
  db.prepare("UPDATE alerts SET status = 'handling', updated_at = ? WHERE id = ?").run(now, numericId)
  return { alert: normalizeAlert(db.prepare(`${alertSelect} WHERE id = ?`).get(numericId)), message: '告警已标记为处理中' }
}
