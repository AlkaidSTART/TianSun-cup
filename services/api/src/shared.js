// Normalised id / text helpers, the ownership scope used by every business
// query, and pagination parsing. Kept separate from store.js so routers,
// auth-store and the alert rule engine can share it without an import cycle.

export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.details = details
  }
}

export function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeId(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, '-')
}

export function isIsoTimestamp(value) {
  const text = cleanText(value)
  if (!text) return false
  const date = new Date(text)
  return !Number.isNaN(date.getTime())
}

export function toIso(value) {
  const date = new Date(cleanText(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// Business data is owned by the account that created it; admins see every
// account. Returns a SQL fragment plus its parameters so callers can append it
// to an existing WHERE clause.
export function actorScope(actor, column = 'user_id') {
  if (!actor?.id || !['admin', 'operator'].includes(actor.role)) throw new ApiError(401, '请先登录')
  return actor.role === 'admin' ? { sql: '', parameters: [] } : { sql: `${column} = ?`, parameters: [actor.id] }
}

export function localDateValue(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isCalendarDate(value) {
  const text = cleanText(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

export function readPagination(query = {}) {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1)
  const requested = Math.trunc(Number(query.pageSize)) || 50
  const pageSize = Math.min(200, Math.max(1, requested))
  return { page, pageSize, offset: (page - 1) * pageSize }
}
