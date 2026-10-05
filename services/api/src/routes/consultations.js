import { Router, json } from 'express'
import { requireAuth, requireReady } from '../auth-middleware.js'
import { ApiError, cleanText } from '../shared.js'
import { askMaxKB, requireMaxKBConfig, streamMaxKB } from '../maxkb-client.js'
import {
  createConsultation,
  createMessage,
  getConsultation,
  getPendingAIQuestion,
  listConsultations,
  saveAIReply,
  updateConsultation,
} from '../consultations-store.js'

const router = Router()
const parseJson = json({ limit: '1mb', strict: false })
const success = (response, data, message = 'ok', statusCode = 200) => {
  response.status(statusCode).json({ code: 0, message, data })
}
const repliesInFlight = new Set()

async function replyWithAI(id, actor, options = {}) {
  const pending = getPendingAIQuestion(id, actor)
  if (repliesInFlight.has(pending.id)) throw new ApiError(409, 'AI 正在回复，请稍候')
  repliesInFlight.add(pending.id)
  try {
    const reply = options.onDelta
      ? await streamMaxKB(pending.question, pending.chatId, options.onDelta, options.signal)
      : await askMaxKB(pending.question, pending.chatId)
    saveAIReply(pending.id, pending.messageId, reply.answer, reply.chatId, actor)
    return getConsultation(pending.id, actor)
  } finally {
    repliesInFlight.delete(pending.id)
  }
}

function validateChatText(value) {
  const text = cleanText(value)
  if (!text) throw new ApiError(400, '请输入消息内容')
  if (text.length > 1000) throw new ApiError(400, '消息不能超过 1000 个字符')
  return text
}

async function streamReply(response, id, actor, detail) {
  const abort = new AbortController()
  const onClose = () => { if (!response.writableEnded) abort.abort() }
  response.on('close', onClose)
  response.status(200).set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })
  response.flushHeaders()
  const write = (event) => {
    if (!response.destroyed) response.write(`${JSON.stringify(event)}\n`)
  }
  write({ type: 'conversation', detail })
  try {
    const completed = await replyWithAI(id, actor, {
      onDelta: (text) => write({ type: 'delta', text }),
      signal: abort.signal,
    })
    write({ type: 'done', detail: completed })
  } catch (error) {
    if (!abort.signal.aborted) {
      if (!(error instanceof ApiError)) console.error('AI stream failed:', error)
      write({ type: 'error', message: error instanceof ApiError ? error.message : 'AI 暂时无法回复，请稍后重试' })
    }
  } finally {
    response.off('close', onClose)
    if (!response.destroyed) response.end()
  }
}

router.post('/consultations/stream', parseJson, requireAuth, requireReady, async (request, response) => {
  requireMaxKBConfig()
  const text = validateChatText(request.body?.text)
  const created = await createConsultation({ symptoms: [], description: text }, request.authUser)
  await streamReply(response, created.id, request.authUser, created)
})

router.post('/consultations/:id/messages/stream', parseJson, requireAuth, requireReady, async (request, response) => {
  requireMaxKBConfig()
  await createMessage(request.params.id, { text: validateChatText(request.body?.text) }, request.authUser)
  const detail = await getConsultation(request.params.id, request.authUser)
  await streamReply(response, detail.id, request.authUser, detail)
})

router.post('/consultations/:id/retry/stream', requireAuth, requireReady, async (request, response) => {
  requireMaxKBConfig()
  getPendingAIQuestion(request.params.id, request.authUser)
  const detail = await getConsultation(request.params.id, request.authUser)
  await streamReply(response, detail.id, request.authUser, detail)
})

router.get('/consultations', requireAuth, requireReady, async (request, response) => {
  success(response, await listConsultations(request.query, request.authUser))
})

router.post('/consultations', parseJson, requireAuth, requireReady, async (request, response) => {
  requireMaxKBConfig()
  const created = await createConsultation(request.body || {}, request.authUser)
  let aiError = false
  try {
    await replyWithAI(created.id, request.authUser)
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 502) throw error
    aiError = true // The saved question remains available through the retry endpoint.
  }
  success(response, { ...await getConsultation(created.id, request.authUser), aiError }, 'AI 问诊已创建', 201)
})

router.get('/consultations/:id', requireAuth, requireReady, async (request, response) => {
  success(response, await getConsultation(request.params.id, request.authUser))
})

router.post('/consultations/:id/messages', parseJson, requireAuth, requireReady, async (request, response) => {
  requireMaxKBConfig()
  const message = await createMessage(request.params.id, request.body || {}, request.authUser)
  let aiError = false
  try {
    await replyWithAI(request.params.id, request.authUser)
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 502) throw error
    aiError = true
  }
  success(response, { ...message, aiError }, '已发送', 201)
})

router.post('/consultations/:id/retry', requireAuth, requireReady, async (request, response) => {
  requireMaxKBConfig()
  await replyWithAI(request.params.id, request.authUser)
  success(response, await getConsultation(request.params.id, request.authUser), 'AI 已回复')
})

router.patch('/consultations/:id', parseJson, requireAuth, requireReady, async (request, response) => {
  success(response, await updateConsultation(request.params.id, request.body || {}, request.authUser), '问诊已关闭')
})

export default router
