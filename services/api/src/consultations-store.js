import { db } from './db.js'
import { ApiError, actorScope, cleanText, localDateValue, readPagination } from './shared.js'

// No dedicated veterinarian accounts exist yet, so consultations are assigned to
// this display name. An admin replying takes the doctor role; a real roster
// would replace this constant.
const defaultDoctorName = '张医生'

const statusLabels = { open: '待接诊', answered: '已回复', closed: '已关闭' }
const allowedStatuses = new Set(['open', 'answered', 'closed'])

const consultationSelect = `
  SELECT
    id,
    code,
    user_id AS userId,
    livestock_id AS livestockId,
    pasture_id AS pastureId,
    symptoms,
    description,
    title,
    status,
    doctor_name AS doctorName,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM consultations
`

function parseSymptoms(value) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function isDoctor(actor) {
  return actor?.role === 'admin'
}

function summarize(row, lastText, messageCount) {
  return {
    ...row,
    id: String(row.id),
    symptoms: parseSymptoms(row.symptoms),
    statusLabel: statusLabels[row.status] || row.status,
    messageCount: Number(messageCount || 0),
    summary: lastText ? lastText.slice(0, 60) : '',
  }
}

function listMessages(consultationId) {
  return db.prepare(`
    SELECT id, role, author_name AS authorName, text, created_at AS createdAt
    FROM consultation_messages
    WHERE consultation_id = ?
    ORDER BY datetime(created_at) ASC, id ASC
  `).all(consultationId).map((row) => ({ ...row, id: String(row.id) }))
}

function findByCode(code) {
  return db.prepare('SELECT * FROM consultations WHERE code = ?').get(cleanText(code))
}

// Both the id and the human-readable code address a consultation; the code is
// what the mobile screen shows (VC-20261001-014), the id is what links to
// messages.
function findConsultation(idOrCode, actor) {
  const raw = cleanText(idOrCode)
  if (!raw) return undefined
  const numericId = Number(raw)
  const row = Number.isInteger(numericId) && numericId > 0
    ? db.prepare('SELECT * FROM consultations WHERE id = ?').get(numericId)
    : findByCode(raw)
  if (!row) return undefined
  if (!isDoctor(actor) && row.user_id !== actor.id) return undefined
  return row
}

function visibleOr404(idOrCode, actor) {
  const row = findConsultation(idOrCode, actor)
  if (!row) throw new ApiError(404, '未找到该问诊')
  return row
}

function nextCode(now = new Date()) {
  const stamp = localDateValue(now).replace(/-/g, '')
  const prefix = `VC-${stamp}-`
  const latest = db.prepare('SELECT code FROM consultations WHERE code LIKE ? ORDER BY code DESC LIMIT 1')
    .get(`${prefix}%`)
  const sequence = latest ? Number(String(latest.code).slice(prefix.length)) + 1 : 1
  return `${prefix}${String(sequence).padStart(3, '0')}`
}

function buildTitle({ livestockId, pastureId, symptoms }) {
  const subject = livestockId || pastureId || '未指定对象'
  const first = symptoms[0]
  return first ? `${subject} · ${first}` : subject
}

export async function listConsultations(query = {}, actor) {
  const scope = actorScope(actor)
  const clauses = []
  const parameters = []
  if (scope.sql) { clauses.push(scope.sql); parameters.push(...scope.parameters) }

  const status = cleanText(query.status)
  if (status) {
    if (!allowedStatuses.has(status)) throw new ApiError(400, '问诊状态不正确')
    clauses.push('status = ?')
    parameters.push(status)
  }
  const days = Math.min(365, Math.max(1, Math.trunc(Number(query.days)) || 30))
  clauses.push("datetime(created_at) >= datetime('now', ?)")
  parameters.push(`-${days} days`)

  const { pageSize, offset } = readPagination({ pageSize: 20, ...query })
  const where = `WHERE ${clauses.join(' AND ')}`
  const rows = db.prepare(`
    ${consultationSelect} ${where}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...parameters, pageSize, offset)

  const lastMessage = db.prepare(`
    SELECT text FROM consultation_messages
    WHERE consultation_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
  `)
  const countMessages = db.prepare('SELECT COUNT(*) AS count FROM consultation_messages WHERE consultation_id = ?')

  return rows.map((row) => summarize(
    row,
    lastMessage.get(row.id)?.text || '',
    countMessages.get(row.id)?.count,
  ))
}

export async function getConsultation(idOrCode, actor) {
  const row = visibleOr404(idOrCode, actor)
  return { ...summarize(row, '', listMessages(row.id).length), messages: listMessages(row.id) }
}

export async function createConsultation(payload = {}, actor) {
  const scope = actorScope(actor)
  if (scope.sql) throw new ApiError(403, '只有管理员可以代牧户发起问诊')

  const symptoms = Array.isArray(payload.symptoms)
    ? payload.symptoms.map((item) => cleanText(item)).filter(Boolean)
    : []
  const description = cleanText(payload.description)
  if (symptoms.length === 0 && !description) {
    throw new ApiError(400, '请至少选择一项症状或填写描述', { symptoms: '请至少选择一项症状或填写描述' })
  }

  const livestockId = cleanText(payload.livestockId).toUpperCase() || null
  const pastureId = cleanText(payload.pastureId).toUpperCase() || null
  if (livestockId) {
    const owned = db.prepare('SELECT id FROM livestock WHERE id = ? AND user_id = ?').get(livestockId, actor.id)
    if (!owned) throw new ApiError(400, '未找到该牲畜', { livestockId: '未找到该牲畜' })
  }
  if (pastureId) {
    const pasture = db.prepare('SELECT id FROM pastures WHERE id = ?').get(pastureId)
    if (!pasture) throw new ApiError(400, '未找到该草场', { pastureId: '未找到该草场' })
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const code = nextCode(now)
  const title = buildTitle({ livestockId, pastureId, symptoms })

  db.exec('BEGIN IMMEDIATE')
  try {
    const result = db.prepare(`
      INSERT INTO consultations (
        code, user_id, livestock_id, pasture_id, symptoms, description,
        title, status, doctor_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `).run(code, actor.id, livestockId, pastureId, JSON.stringify(symptoms), description, title, defaultDoctorName, nowIso, nowIso)

    db.prepare(`
      INSERT INTO consultation_messages (consultation_id, role, author_name, text, created_at)
      VALUES (?, 'doctor', ?, ?, ?)
    `).run(result.lastInsertRowid, defaultDoctorName, '你好，我是张医生。请先告诉我牲畜耳标号、体温和症状持续时间。', nowIso)

    db.exec('COMMIT')
    return getConsultation(String(result.lastInsertRowid), actor)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export async function createMessage(idOrCode, payload = {}, actor) {
  const row = visibleOr404(idOrCode, actor)
  if (row.status === 'closed') throw new ApiError(400, '该问诊已关闭')

  const text = cleanText(payload.text)
  if (!text) throw new ApiError(400, '请输入消息内容', { text: '请输入消息内容' })
  if (text.length > 1000) throw new ApiError(400, '消息不能超过 1000 个字符', { text: '消息不能超过 1000 个字符' })

  const role = isDoctor(actor) ? 'doctor' : 'user'
  const nowIso = new Date().toISOString()
  const nextStatus = role === 'doctor' ? 'answered' : row.status

  db.exec('BEGIN IMMEDIATE')
  try {
    const result = db.prepare(`
      INSERT INTO consultation_messages (consultation_id, role, author_name, text, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(row.id, role, actor.displayName, text, nowIso)
    db.prepare('UPDATE consultations SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, nowIso, row.id)
    db.exec('COMMIT')
    const message = db.prepare(`
      SELECT id, role, author_name AS authorName, text, created_at AS createdAt
      FROM consultation_messages WHERE id = ?
    `).get(result.lastInsertRowid)
    return { ...message, id: String(message.id) }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export async function updateConsultation(idOrCode, payload = {}, actor) {
  if (!isDoctor(actor)) throw new ApiError(403, '只有管理员可以更新问诊状态')
  const row = visibleOr404(idOrCode, actor)
  const status = cleanText(payload.status)
  if (status !== 'closed') throw new ApiError(400, '问诊状态不正确', { status: '只支持关闭问诊' })
  const nowIso = new Date().toISOString()
  db.prepare("UPDATE consultations SET status = 'closed', updated_at = ? WHERE id = ?").run(nowIso, row.id)
  return getConsultation(String(row.id), actor)
}
