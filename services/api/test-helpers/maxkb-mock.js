import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export function installMaxKBMock() {
  const originalFetch = globalThis.fetch
  const previousBaseUrl = process.env.MAXKB_BASE_URL
  const previousApiKey = process.env.MAXKB_API_KEY
  process.env.MAXKB_BASE_URL = 'http://maxkb.test/chat/api/test-application'
  process.env.MAXKB_API_KEY = 'agent-test-key'
  const calls = []
  const chatIds = []
  let failNext = false

  globalThis.fetch = async (resource, options) => {
    if (String(resource) !== 'http://maxkb.test/chat/api/test-application/chat/completions') {
      return originalFetch(resource, options)
    }
    assert.equal(options.headers.Authorization, 'Bearer agent-test-key')
    const body = JSON.parse(options.body)
    assert.equal(typeof body.stream, 'boolean')
    assert.equal(body.messages.length, 1)
    assert.equal(body.messages[0].role, 'user')
    calls.push(body)
    if (failNext) {
      failNext = false
      return new Response('upstream unavailable', { status: 503 })
    }
    const chatId = body.chat_id || randomUUID()
    chatIds.push(chatId)
    if (body.stream) {
      const encoder = new TextEncoder()
      const frames = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'AI 测试', chat_id: chatId } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: `回复 ${calls.length}`, chat_id: chatId }, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ]
      const bytes = encoder.encode(frames.join(''))
      const split = bytes.findIndex((byte) => byte >= 0x80) + 1
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, split))
          setTimeout(() => { controller.enqueue(bytes.slice(split)); controller.close() }, 15)
        },
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }
    return new Response(JSON.stringify({ choices: [{
      message: { role: 'assistant', content: `AI 测试回复 ${calls.length}` },
      chat_id: chatId,
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  return {
    calls,
    chatIds,
    failOnce() { failNext = true },
    restore() {
      globalThis.fetch = originalFetch
      if (previousBaseUrl === undefined) delete process.env.MAXKB_BASE_URL
      else process.env.MAXKB_BASE_URL = previousBaseUrl
      if (previousApiKey === undefined) delete process.env.MAXKB_API_KEY
      else process.env.MAXKB_API_KEY = previousApiKey
    },
  }
}
