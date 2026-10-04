import { db } from './db.js'
import { evaluatePasturePressure } from './alerts-store.js'
import { ApiError, actorScope, cleanText, localDateValue } from './shared.js'

export const pressureThreshold = 0.80
const coverageSnapshots = new Map()

const qualityLabels = {
  excellent: '优良',
  fair: '一般',
  poor: '较差',
  closed: '禁牧',
}

export const pastureQualityOptions = Object.entries(qualityLabels)
  .map(([value, label]) => ({ value, label }))

function rowToPasture(row, load) {
  const capacity = Number(row.capacity)
  // A closed pasture has no carrying capacity, so no pressure can be derived.
  // Reporting 0 (rather than Infinity or null) keeps the field numeric for the
  // client's chart and pressure formatting.
  const pressure = capacity > 0 ? Math.round((load / capacity) * 100) / 100 : 0
  const overloaded = capacity > 0 && pressure > pressureThreshold
  return {
    id: row.id,
    name: row.name,
    quality: row.quality,
    qualityLabel: qualityLabels[row.quality] || row.quality,
    areaSize: Number(row.area_size),
    capacity,
    currentLoad: load,
    pressure,
    coverage: Number(row.coverage),
    overloaded,
    tone: overloaded || row.quality === 'poor' || row.quality === 'closed' ? 'warn' : 'ok',
  }
}

function loadByPasture(actor) {
  const scope = actorScope(actor)
  const where = scope.sql ? `WHERE ${scope.sql} AND status <> 'offline'` : `WHERE status <> 'offline'`
  const rows = db.prepare(`
    SELECT pasture_id AS pastureId, COUNT(*) AS load
    FROM livestock ${where}
    GROUP BY pasture_id
  `).all(...scope.parameters)
  return new Map(rows.map((row) => [row.pastureId, Number(row.load)]))
}

function selectPastures(actor, id = undefined) {
  const rows = id
    ? db.prepare('SELECT * FROM pastures WHERE id = ?').all(cleanText(id).toUpperCase())
    : db.prepare('SELECT * FROM pastures ORDER BY sort_order ASC, id ASC').all()
  const loads = loadByPasture(actor)
  return rows.map((row) => rowToPasture(row, loads.get(row.id) || 0))
}

export async function listPastures(actor) {
  const pastures = selectPastures(actor)
  recordPressureSnapshot()
  return pastures
}

export async function getPasture(id, actor) {
  const [pasture] = selectPastures(actor, id)
  if (!pasture) throw new ApiError(404, '未找到该草场')
  const row = db.prepare('SELECT grass_height, soil_moisture FROM pastures WHERE id = ?').get(pasture.id)
  return {
    ...pasture,
    metrics: {
      coverage: pasture.coverage,
      grassHeight: row?.grass_height ?? null,
      soilMoisture: row?.soil_moisture ?? null,
    },
  }
}

// Snapshots are always computed with global scope: the trend chart must show
// the pasture's real pressure, not whatever subset the requesting account can
// see, otherwise an operator's request would overwrite the shared row.
export function recordPressureSnapshot(now = new Date()) {
  const snapshotDate = localDateValue(now)
  const pastures = selectPastures({ id: 'system', role: 'admin' })
  const timestamp = now.toISOString()
  const upsert = db.prepare(`
    INSERT INTO pasture_pressure_daily (pasture_id, snapshot_date, pressure, current_load, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(pasture_id, snapshot_date) DO UPDATE SET
      pressure = excluded.pressure,
      current_load = excluded.current_load,
      updated_at = excluded.updated_at
  `)
  db.exec('BEGIN')
  try {
    for (const pasture of pastures) {
      upsert.run(pasture.id, snapshotDate, pasture.pressure, pasture.currentLoad, timestamp, timestamp)
      // Alerts live in the same transaction as the snapshot, so a pressure
      // spike cannot be persisted without its alert (or the reverse).
      evaluatePasturePressure(pasture, now)
    }
    db.exec('COMMIT')
    return { snapshotDate, recorded: pastures.length }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export async function getPressureHistory(query = {}) {
  const requested = Math.trunc(Number(query.days)) || 7
  const days = Math.min(30, Math.max(1, requested))
  const rows = db.prepare(`
    SELECT pasture_id AS pastureId, snapshot_date AS date, pressure
    FROM pasture_pressure_daily
    WHERE snapshot_date >= date('now', ?)
    ORDER BY snapshot_date ASC, pasture_id ASC
  `).all(`-${days - 1} days`)

  const byDate = new Map()
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date).push({ pastureId: row.pastureId, pressure: Number(row.pressure) })
  }

  return [...byDate.entries()].map(([date, zones]) => ({
    date,
    averagePressure: Math.round((zones.reduce((sum, zone) => sum + zone.pressure, 0) / zones.length) * 100) / 100,
    zones,
  }))
}

export async function getCarryingCapacity(actor) {
  const pastures = selectPastures(actor)
  const zoneCount = pastures.length
  const average = zoneCount === 0
    ? 0
    : Math.round((pastures.reduce((sum, pasture) => sum + pasture.pressure, 0) / zoneCount) * 100) / 100
  const peak = pastures.reduce((highest, pasture) => (
    !highest || pasture.pressure > highest.pressure ? pasture : highest
  ), null)
  return {
    averagePressure: average,
    peakPressure: peak ? peak.pressure : 0,
    peakPastureId: peak ? peak.id : null,
    peakPastureName: peak ? peak.name : null,
    overloadedCount: pastures.filter((pasture) => pasture.overloaded).length,
    zoneCount,
  }
}
