import { closeDatabase, databaseFile, db, seedFile } from './db.js'
import {
  ApiError,
  actorScope,
  cleanText,
  localDateValue,
  normalizeId,
  numberOrNull,
} from './shared.js'

export { closeDatabase, databaseFile, seedFile, ApiError }

export const sourceTypeOptions = [
  { value: 'purchased', label: '购入' },
  { value: 'born', label: '生产' },
]

export const statusOptions = [
  { value: 'normal', label: '正常' },
  { value: 'attention', label: '需关注' },
  { value: 'abnormal', label: '异常' },
  { value: 'offline', label: '离线' },
]

// Pasture units are owned by the `pastures` table so the API can report
// carrying load. `pastureOptions` keeps its historical shape (id + name) for
// /api/meta/options, whose output must not change.
export function listPastureOptions() {
  return db.prepare('SELECT id, name FROM pastures ORDER BY sort_order ASC, id ASC').all()
}

export const breedOptions = ['九龙牦牛', '麦洼牦牛', '藏绵羊', '高原山羊']

const allowedSourceTypes = new Set(sourceTypeOptions.map((item) => item.value))
const allowedStatuses = new Set(statusOptions.map((item) => item.value))
const allowedSexes = new Set(['female', 'male'])
const minMotherAgeMonths = 24

const baseSelect = `
  SELECT
    id,
    user_id AS userId,
    (SELECT display_name FROM users WHERE users.id = livestock.user_id) AS accountName,
    species,
    breed,
    sex,
    source_type AS sourceType,
    mother_id AS motherId,
    birth_date AS birthDate,
    purchase_date AS purchaseDate,
    supplier,
    purchase_price AS purchasePrice,
    pasture_id AS pastureId,
    pasture_name AS pastureName,
    owner,
    status,
    temperature,
    heart_rate AS heartRate,
    steps,
    rumination,
    last_report_at AS lastReportAt,
    notes,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM livestock
`

function findRecord(id, actor) {
  const normalized = normalizeId(id)
  if (!normalized) return undefined
  const scope = actorScope(actor)
  const suffix = scope.sql ? ` AND ${scope.sql}` : ''
  return db.prepare(`${baseSelect} WHERE id = ?${suffix}`).get(normalized, ...scope.parameters) || undefined
}

function motherCutoffDate() {
  const threshold = new Date()
  threshold.setMonth(threshold.getMonth() - minMotherAgeMonths)
  return localDateValue(threshold)
}

function isMatureMother(record) {
  return Boolean(record?.sex === 'female' && record.birthDate && record.birthDate <= motherCutoffDate())
}

function validateDate(value, fieldLabel, errors) {
  if (!value || Number.isNaN(Date.parse(value))) errors[fieldLabel] = `${fieldLabel}格式不正确`
}

function validatePayload(payload, editingId = undefined, actor) {
  const errors = {}
  const id = normalizeId(payload.id)
  const sourceType = cleanText(payload.sourceType)
  const breed = cleanText(payload.breed)
  const species = cleanText(payload.species) || '牦牛'
  const sex = cleanText(payload.sex)
  const pastureId = cleanText(payload.pastureId)
  const pasture = db.prepare('SELECT id, name FROM pastures WHERE id = ?').get(pastureId)
  const owner = cleanText(payload.owner) || '未分配'
  const motherId = normalizeId(payload.motherId)
  const purchaseDate = cleanText(payload.purchaseDate)
  const birthDate = cleanText(payload.birthDate)

  if (!id) errors.id = '请填写牲畜耳标号'
  else if (!/^[A-Z0-9-]{4,32}$/.test(id)) errors.id = '耳标号仅支持字母、数字和短横线'
  else {
    const duplicate = db.prepare('SELECT id FROM livestock WHERE id = ?').get(id)
    if (duplicate && duplicate.id !== normalizeId(editingId)) errors.id = '该耳标号已存在'
  }

  if (!allowedSourceTypes.has(sourceType)) errors.sourceType = '请选择购入或生产'
  if (!breed) errors.breed = '请选择或填写品种'
  if (!allowedSexes.has(sex)) errors.sex = '请选择性别'
  if (!pasture) errors.pastureId = '请选择所属草场'

  if (sourceType === 'born') {
    if (!motherId) errors.motherId = '生产来源必须选择母亲'
    else {
      const mother = findRecord(motherId, actor)
      if (!mother) errors.motherId = '未找到所选母畜'
      else if (mother.sex !== 'female') errors.motherId = '所选母畜性别不正确'
      else if (!isMatureMother(mother)) errors.motherId = '所选母畜未达到适繁月龄'
    }
    validateDate(birthDate, '出生日期', errors)
  }

  if (sourceType === 'purchased') {
    validateDate(purchaseDate, '购入日期', errors)
  }

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, '牲畜档案校验失败', errors)
  }

  return {
    id,
    species,
    breed,
    sex,
    sourceType,
    motherId: sourceType === 'born' ? motherId : null,
    birthDate: birthDate || null,
    purchaseDate: sourceType === 'purchased' ? purchaseDate : null,
    supplier: sourceType === 'purchased' ? cleanText(payload.supplier) || null : null,
    purchasePrice: sourceType === 'purchased' ? numberOrNull(payload.purchasePrice) : null,
    pastureId: pasture.id,
    pastureName: pasture.name,
    owner,
    status: allowedStatuses.has(cleanText(payload.status)) ? cleanText(payload.status) : 'normal',
    temperature: numberOrNull(payload.temperature),
    heartRate: numberOrNull(payload.heartRate),
    steps: numberOrNull(payload.steps),
    rumination: numberOrNull(payload.rumination),
    lastReportAt: cleanText(payload.lastReportAt) || null,
    notes: cleanText(payload.notes) || '',
  }
}

function summarizeMother(record) {
  return {
    id: record.id,
    species: record.species,
    breed: record.breed,
    birthDate: record.birthDate,
    pastureId: record.pastureId,
    pastureName: record.pastureName,
    owner: record.owner,
    status: record.status,
  }
}

function insertRecord(record) {
  db.prepare(`
    INSERT INTO livestock (
      id, species, breed, sex, source_type, mother_id, birth_date, purchase_date,
      supplier, purchase_price, pasture_id, pasture_name, owner, status, temperature,
      heart_rate, steps, rumination, last_report_at, notes, created_at, updated_at, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id, record.species, record.breed, record.sex, record.sourceType,
    record.motherId, record.birthDate, record.purchaseDate, record.supplier,
    record.purchasePrice, record.pastureId, record.pastureName, record.owner,
    record.status, record.temperature, record.heartRate, record.steps, record.rumination,
    record.lastReportAt, record.notes, record.createdAt, record.updatedAt, record.userId,
  )
}
export async function listLivestock(filters = {}, actor) {
  const scope = actorScope(actor)
  const query = cleanText(filters.q).toLowerCase()
  const status = cleanText(filters.status)
  const sourceType = cleanText(filters.sourceType)
  const clauses = []
  const parameters = []

  if (scope.sql) { clauses.push(scope.sql); parameters.push(...scope.parameters) }
  if (status) { clauses.push('status = ?'); parameters.push(status) }
  if (sourceType) { clauses.push('source_type = ?'); parameters.push(sourceType) }
  if (query) {
    clauses.push(`LOWER(
      COALESCE(id, '') || ' ' || COALESCE(breed, '') || ' ' || COALESCE(species, '') || ' ' ||
      COALESCE(owner, '') || ' ' || COALESCE(pasture_name, '') || ' ' || COALESCE(mother_id, '')
    ) LIKE ?`)
    parameters.push(`%${query}%`)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db.prepare(`${baseSelect} ${where} ORDER BY datetime(updated_at) DESC, id DESC`).all(...parameters)
}
export async function getLivestock(id, actor) {
  const record = findRecord(id, actor)
  if (!record) throw new ApiError(404, '未找到该牲畜档案')
  return record
}
export async function listMothers(actor) {
  const scope = actorScope(actor)
  const clauses = ["sex = 'female'", 'birth_date IS NOT NULL', 'birth_date <= ?']
  const parameters = [motherCutoffDate()]
  if (scope.sql) { clauses.push(scope.sql); parameters.push(...scope.parameters) }
  return db.prepare(`${baseSelect} WHERE ${clauses.join(' AND ')} ORDER BY id ASC`)
    .all(...parameters)
    .map(summarizeMother)
}
export async function createLivestock(payload, actor) {
  actorScope(actor)
  const normalized = validatePayload(payload, undefined, actor)
  const now = new Date().toISOString()
  const record = { ...normalized, userId: actor.id, createdAt: now, updatedAt: now }
  insertRecord(record)
  return getLivestock(record.id, actor)
}
export async function updateLivestock(id, payload, actor) {
  const previous = await getLivestock(id, actor)
  const normalized = validatePayload({ ...previous, ...payload, id: previous.id }, previous.id, actor)
  const record = {
    ...previous,
    ...normalized,
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt: new Date().toISOString(),
  }
  const scope = actorScope(actor)
  const where = scope.sql ? `id = ? AND ${scope.sql}` : 'id = ?'
  const parameters = [
    record.species, record.breed, record.sex, record.sourceType, record.motherId,
    record.birthDate, record.purchaseDate, record.supplier, record.purchasePrice,
    record.pastureId, record.pastureName, record.owner, record.status,
    record.temperature, record.heartRate, record.steps, record.rumination,
    record.lastReportAt, record.notes, record.updatedAt, record.id,
    ...scope.parameters,
  ]
  db.prepare(`
    UPDATE livestock SET
      species = ?, breed = ?, sex = ?, source_type = ?, mother_id = ?, birth_date = ?,
      purchase_date = ?, supplier = ?, purchase_price = ?, pasture_id = ?, pasture_name = ?,
      owner = ?, status = ?, temperature = ?, heart_rate = ?, steps = ?, rumination = ?,
      last_report_at = ?, notes = ?, updated_at = ?
    WHERE ${where}
  `).run(...parameters)
  return getLivestock(id, actor)
}
export async function getStats(actor) {
  const scope = actorScope(actor)
  const where = scope.sql ? `WHERE ${scope.sql}` : ''
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status <> 'offline' THEN 1 ELSE 0 END), 0) AS online,
      COALESCE(SUM(CASE WHEN status = 'normal' THEN 1 ELSE 0 END), 0) AS normal,
      COALESCE(SUM(CASE WHEN status = 'attention' THEN 1 ELSE 0 END), 0) AS attention,
      COALESCE(SUM(CASE WHEN status = 'abnormal' THEN 1 ELSE 0 END), 0) AS abnormal,
      COALESCE(SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END), 0) AS offline,
      COALESCE(SUM(CASE WHEN source_type = 'born' THEN 1 ELSE 0 END), 0) AS born,
      COALESCE(SUM(CASE WHEN source_type = 'purchased' THEN 1 ELSE 0 END), 0) AS purchased,
      COALESCE(SUM(CASE WHEN sex = 'female' THEN 1 ELSE 0 END), 0) AS female,
      COALESCE(SUM(CASE WHEN sex = 'male' THEN 1 ELSE 0 END), 0) AS male
    FROM livestock ${where}
  `).get(...scope.parameters)
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]))
}

const todoTypeMeta = {
  rotation: { status: '待办', tone: 'warn' },
  inspection: { status: '待办', tone: 'warn' },
  vaccination: { status: '待办', tone: 'warn' },
  maintenance: { status: '待办', tone: 'warn' },
  device: { status: '待办', tone: 'warn' },
  custom: { status: '待办', tone: 'warn' },
}

const allowedTodoTypes = new Set(Object.keys(todoTypeMeta))
const todoSelect = `
  SELECT
    id,
    user_id AS userId,
    (SELECT display_name FROM users WHERE users.id = todos.user_id) AS accountName,
    type,
    todo_date AS date,
    todo_time AS time,
    title,
    detail,
    status,
    tone,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM todos
`

function isTodoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function normalizeTodo(row) {
  return row ? { ...row, id: String(row.id) } : undefined
}

function validateTodoPayload(payload = {}) {
  const errors = {}
  const type = cleanText(payload.type)
  const date = cleanText(payload.date)
  const time = cleanText(payload.time)
  const title = cleanText(payload.title)
  const detail = cleanText(payload.detail)

  if (!allowedTodoTypes.has(type)) errors.type = '请选择有效的待办类型'
  if (!isTodoDate(date)) errors.date = '日期格式不正确'
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = '时间格式不正确'
  if (!title) errors.title = '请填写事项名称'
  else if (title.length > 60) errors.title = '事项名称不能超过 60 个字符'
  if (detail.length > 240) errors.detail = '备注不能超过 240 个字符'

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, '待办事项校验失败', errors)
  }

  const meta = todoTypeMeta[type]
  return { type, date, time, title, detail, status: meta.status, tone: meta.tone }
}

export async function listTodos(filters = {}, actor) {
  const scope = actorScope(actor)
  const date = cleanText(filters.date)
  if (date && !isTodoDate(date)) throw new ApiError(400, '日期格式不正确')
  const clauses = []
  const parameters = []
  if (scope.sql) { clauses.push(scope.sql); parameters.push(...scope.parameters) }
  if (date) { clauses.push('todo_date = ?'); parameters.push(date) }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db.prepare(`${todoSelect} ${where} ORDER BY todo_date ASC, todo_time ASC, id ASC`)
    .all(...parameters)
    .map(normalizeTodo)
}
export async function createTodo(payload, actor) {
  actorScope(actor)
  const todo = validateTodoPayload(payload)
  const now = new Date().toISOString()
  const result = db.prepare(`
    INSERT INTO todos (type, todo_date, todo_time, title, detail, status, tone, created_at, updated_at, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(todo.type, todo.date, todo.time, todo.title, todo.detail, todo.status, todo.tone, now, now, actor.id)
  return findTodo(result.lastInsertRowid, actor)
}
function findTodo(id, actor) {
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) return undefined
  const scope = actorScope(actor)
  const suffix = scope.sql ? ` AND ${scope.sql}` : ''
  return normalizeTodo(db.prepare(`${todoSelect} WHERE id = ?${suffix}`).get(numericId, ...scope.parameters))
}
export async function completeTodo(id, actor) {
  const todo = findTodo(id, actor)
  if (!todo) throw new ApiError(404, '未找到该待办事项')
  const scope = actorScope(actor)
  const where = scope.sql ? `id = ? AND ${scope.sql}` : 'id = ?'
  db.prepare(`UPDATE todos SET status = '已完成', tone = 'ok', updated_at = ? WHERE ${where}`)
    .run(new Date().toISOString(), Number(id), ...scope.parameters)
  return findTodo(id, actor)
}
export async function updateTodo(id, payload, actor) {
  const previous = findTodo(id, actor)
  if (!previous) throw new ApiError(404, '未找到该待办事项')
  const todo = validateTodoPayload({ ...previous, ...payload, type: previous.type })
  const scope = actorScope(actor)
  const where = scope.sql ? `id = ? AND ${scope.sql}` : 'id = ?'
  db.prepare(`
    UPDATE todos
    SET type = ?, todo_date = ?, todo_time = ?, title = ?, detail = ?, updated_at = ?
    WHERE ${where}
  `).run(todo.type, todo.date, todo.time, todo.title, todo.detail, new Date().toISOString(), Number(id), ...scope.parameters)
  return findTodo(id, actor)
}
export async function deleteTodo(id, actor) {
  const todo = findTodo(id, actor)
  if (!todo) throw new ApiError(404, '未找到该待办事项')
  const scope = actorScope(actor)
  const where = scope.sql ? `id = ? AND ${scope.sql}` : 'id = ?'
  db.prepare(`DELETE FROM todos WHERE ${where}`).run(Number(id), ...scope.parameters)
  return { id: todo.id }
}
