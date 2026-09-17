import { closeDatabase, databaseFile, db, seedFile } from './db.js'

export { closeDatabase, databaseFile, seedFile }

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

export const pastureOptions = [
  { id: 'P-A-01', name: '东沟草场' },
  { id: 'P-A-02', name: '北坡草场' },
  { id: 'P-A-03', name: '河谷草场' },
]

export const breedOptions = ['九龙牦牛', '麦洼牦牛', '藏绵羊', '高原山羊']

const allowedSourceTypes = new Set(sourceTypeOptions.map((item) => item.value))
const allowedStatuses = new Set(statusOptions.map((item) => item.value))
const allowedSexes = new Set(['female', 'male'])
const minMotherAgeMonths = 24

const baseSelect = `
  SELECT
    id,
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

export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.details = details
  }
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeId(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, '-')
}

function findRecord(id) {
  const normalized = normalizeId(id)
  if (!normalized) return undefined
  return db.prepare(`${baseSelect} WHERE id = ?`).get(normalized) || undefined
}

function localDateValue(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
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

function validatePayload(payload, editingId = undefined) {
  const errors = {}
  const id = normalizeId(payload.id)
  const sourceType = cleanText(payload.sourceType)
  const breed = cleanText(payload.breed)
  const species = cleanText(payload.species) || '牦牛'
  const sex = cleanText(payload.sex)
  const pastureId = cleanText(payload.pastureId)
  const pasture = pastureOptions.find((item) => item.id === pastureId)
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
      const mother = findRecord(motherId)
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
      heart_rate, steps, rumination, last_report_at, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.species,
    record.breed,
    record.sex,
    record.sourceType,
    record.motherId,
    record.birthDate,
    record.purchaseDate,
    record.supplier,
    record.purchasePrice,
    record.pastureId,
    record.pastureName,
    record.owner,
    record.status,
    record.temperature,
    record.heartRate,
    record.steps,
    record.rumination,
    record.lastReportAt,
    record.notes,
    record.createdAt,
    record.updatedAt,
  )
}

export async function listLivestock(filters = {}) {
  const query = cleanText(filters.q).toLowerCase()
  const status = cleanText(filters.status)
  const sourceType = cleanText(filters.sourceType)
  const clauses = []
  const parameters = []

  if (status) {
    clauses.push('status = ?')
    parameters.push(status)
  }
  if (sourceType) {
    clauses.push('source_type = ?')
    parameters.push(sourceType)
  }
  if (query) {
    clauses.push(`LOWER(
      COALESCE(id, '') || ' ' || COALESCE(breed, '') || ' ' || COALESCE(species, '') || ' ' ||
      COALESCE(owner, '') || ' ' || COALESCE(pasture_name, '') || ' ' || COALESCE(mother_id, '')
    ) LIKE ?`)
    parameters.push(`%${query}%`)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  return db.prepare(`${baseSelect} ${where} ORDER BY datetime(updated_at) DESC, id DESC`).all(...parameters)
}

export async function getLivestock(id) {
  const record = findRecord(id)
  if (!record) throw new ApiError(404, '未找到该牲畜档案')
  return record
}

export async function listMothers() {
  return db.prepare(`
    ${baseSelect}
    WHERE sex = 'female'
      AND birth_date IS NOT NULL
      AND birth_date <= ?
    ORDER BY id ASC
  `).all(motherCutoffDate()).map(summarizeMother)
}

export async function createLivestock(payload) {
  const normalized = validatePayload(payload)
  const now = new Date().toISOString()
  const record = {
    ...normalized,
    createdAt: now,
    updatedAt: now,
  }
  insertRecord(record)
  return record
}

export async function updateLivestock(id, payload) {
  const previous = await getLivestock(id)
  const normalized = validatePayload({ ...previous, ...payload, id: previous.id }, previous.id)
  const record = {
    ...previous,
    ...normalized,
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt: new Date().toISOString(),
  }

  db.prepare(`
    UPDATE livestock SET
      species = ?, breed = ?, sex = ?, source_type = ?, mother_id = ?, birth_date = ?,
      purchase_date = ?, supplier = ?, purchase_price = ?, pasture_id = ?, pasture_name = ?,
      owner = ?, status = ?, temperature = ?, heart_rate = ?, steps = ?, rumination = ?,
      last_report_at = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    record.species,
    record.breed,
    record.sex,
    record.sourceType,
    record.motherId,
    record.birthDate,
    record.purchaseDate,
    record.supplier,
    record.purchasePrice,
    record.pastureId,
    record.pastureName,
    record.owner,
    record.status,
    record.temperature,
    record.heartRate,
    record.steps,
    record.rumination,
    record.lastReportAt,
    record.notes,
    record.updatedAt,
    record.id,
  )

  return record
}

export async function getStats() {
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
    FROM livestock
  `).get()

  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]))
}