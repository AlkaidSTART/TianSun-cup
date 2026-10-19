import { ApiError } from './shared.js'

const DEFAULT_TIMEOUT_MS = 45_000

export function requireMaxKBConfig() {
  const baseUrl = process.env.MAXKB_BASE_URL?.trim()
  const apiKey = process.env.MAXKB_API_KEY?.trim()
  if (!baseUrl || !apiKey) throw new ApiError(503, 'AI 问诊服务尚未配置')

  let url
  try {
    url = new URL(`${baseUrl.replace(/\/+$/, '')}/chat/completions`)
  } catch {
    throw new ApiError(503, 'AI 问诊服务地址无效')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiError(503, 'AI 问诊服务地址无效')
  return { url, apiKey }
}

export async function askMaxKB(question, chatId = null) {
  const { url, apiKey } = requireMaxKBConfig()
  const timeout = Number(process.env.MAXKB_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.MAXKB_MODEL || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: question }],
        stream: false,
        ...(chatId ? { chat_id: chatId } : {}),
      }),
      signal: AbortSignal.timeout(Math.min(Math.max(timeout, 1000), 55_000)),
    })
  } catch (error) {
    console.error('MaxKB request failed:', error?.name || 'network error')
    throw new ApiError(502, 'AI 暂时无法回复，请稍后重试')
  }

  if (!response.ok) {
    console.error('MaxKB returned HTTP', response.status)
    throw new ApiError(502, 'AI 暂时无法回复，请稍后重试')
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new ApiError(502, 'AI 返回内容无效，请稍后重试')
  }
  const choice = payload?.choices?.[0]
  const answer = choice?.message?.content
  const returnedChatId = choice?.chat_id || payload?.chat_id || chatId
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new ApiError(502, 'AI 返回内容为空，请稍后重试')
  }
  return { answer: answer.trim(), chatId: returnedChatId || null }
}

// MaxKB v2 uses OpenAI-compatible SSE frames when stream=true. A frame can
// cross arbitrary TCP/UTF-8 boundaries, so parse lines incrementally.
async function* readSSE(body) {
  if (!body) throw new ApiError(502, 'AI 未返回流式内容，请稍后重试')
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let dataLines = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      let newline
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, '')
        pending = pending.slice(newline + 1)
        if (!line) {
          if (dataLines.length) yield dataLines.join('\n')
          dataLines = []
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart())
        }
      }
      if (pending.length > 1_000_000) throw new ApiError(502, 'AI 流式响应异常，请稍后重试')
    }
    pending += decoder.decode()
    if (pending.startsWith('data:')) dataLines.push(pending.replace(/\r$/, '').slice(5).trimStart())
    if (dataLines.length) yield dataLines.join('\n')
  } finally {
    reader.releaseLock()
  }
}

export async function streamMaxKB(question, chatId, onDelta, clientSignal) {
  const { url, apiKey } = requireMaxKBConfig()
  const timeout = Number(process.env.MAXKB_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  const timeoutSignal = AbortSignal.timeout(Math.min(Math.max(timeout, 1000), 55_000))
  const signal = clientSignal ? AbortSignal.any([timeoutSignal, clientSignal]) : timeoutSignal
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.MAXKB_MODEL || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: question }],
        stream: true,
        ...(chatId ? { chat_id: chatId } : {}),
      }),
      signal,
    })
  } catch (error) {
    console.error('MaxKB stream request failed:', error?.name || 'network error')
    throw new ApiError(502, 'AI 暂时无法回复，请稍后重试')
  }
  if (!response.ok) {
    console.error('MaxKB stream returned HTTP', response.status)
    throw new ApiError(502, 'AI 暂时无法回复，请稍后重试')
  }

  let answer = ''
  let returnedChatId = chatId
  try {
    for await (const frame of readSSE(response.body)) {
      if (frame === '[DONE]') break
      let payload
      try { payload = JSON.parse(frame) } catch { continue }
      if (payload.error) throw new ApiError(502, 'AI 暂时无法回复，请稍后重试')
      const choice = payload.choices?.[0]
      returnedChatId = choice?.delta?.chat_id || choice?.chat_id || payload.chat_id || returnedChatId
      const delta = choice?.delta?.content
      if (typeof delta === 'string' && delta) {
        answer += delta
        onDelta(delta)
      }
    }
  } catch (error) {
    if (clientSignal?.aborted) throw new ApiError(499, '客户端已取消接收')
    if (error instanceof ApiError) throw error
    console.error('MaxKB stream interrupted:', error?.name || 'stream error')
    throw new ApiError(502, 'AI 回复中断，请稍后重试')
  }
  if (!answer.trim()) throw new ApiError(502, 'AI 返回内容为空，请稍后重试')
  return { answer: answer.trim(), chatId: returnedChatId || null }
}
