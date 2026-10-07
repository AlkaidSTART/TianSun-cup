import { apiBaseUrl } from './http'
import { clearAuthSession, getAuthToken, goToLogin } from './session'
import type { ConsultationDetail } from './consultationApi'

export type ConsultationStreamEvent =
  | { type: 'conversation'; detail: ConsultationDetail }
  | { type: 'delta'; text: string }
  | { type: 'done'; detail: ConsultationDetail }
  | { type: 'error'; message: string }

// App's JS engine does not necessarily provide the browser TextDecoder API.
// Keep incomplete UTF-8 characters between network chunks (including Chinese).
class Utf8Chunks {
  private pending: number[] = []

  decode(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = [...this.pending, ...new Uint8Array(buffer)]
    let output = ''
    let index = 0
    while (index < bytes.length) {
      const first = bytes[index]
      const size = first < 0x80 ? 1 : first >= 0xc2 && first < 0xe0 ? 2 : first >= 0xe0 && first < 0xf0 ? 3 : first >= 0xf0 && first < 0xf5 ? 4 : 1
      if (index + size > bytes.length) break
      if (size === 1) {
        output += first < 0x80 ? String.fromCharCode(first) : '\ufffd'
      } else {
        let point = first & (0x7f >> size)
        let valid = true
        for (let offset = 1; offset < size; offset += 1) {
          const next = bytes[index + offset]
          if ((next & 0xc0) !== 0x80) { valid = false; break }
          point = (point << 6) | (next & 0x3f)
        }
        output += valid ? String.fromCodePoint(point) : '\ufffd'
      }
      index += size
    }
    this.pending = bytes.slice(index)
    return output
  }

  finish(): string {
    const tail = this.pending.length ? '\ufffd' : ''
    this.pending = []
    return tail
  }
}

type ChunkedTask = { onChunkReceived?: (listener: (result: { data: ArrayBuffer | Uint8Array }) => void) => void }

export function streamConsultation(
  path: string,
  data: Record<string, unknown> | undefined,
  onEvent: (event: ConsultationStreamEvent) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    if (!/^https?:\/\//i.test(apiBaseUrl)) {
      reject(new Error('请配置手机可访问的完整后端 API 地址'))
      return
    }
    // #endif
    const token = getAuthToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    // #ifdef H5
    headers['X-Requested-With'] = 'TianSun'
    // #endif
    // #ifdef APP-PLUS
    headers['X-Client-Platform'] = 'app-plus'
    // #endif

    let lineBuffer = ''
    let receivedChunk = false
    let ended = false
    let streamError = ''
    const decoder = new Utf8Chunks()
    const consume = (text: string, flush = false) => {
      lineBuffer += text
      let newline
      while ((newline = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, newline).trim()
        lineBuffer = lineBuffer.slice(newline + 1)
        if (!line) continue
        const event = JSON.parse(line) as ConsultationStreamEvent
        if (event.type === 'done') ended = true
        if (event.type === 'error') streamError = event.message
        onEvent(event)
      }
      if (flush && lineBuffer.trim()) {
        const event = JSON.parse(lineBuffer.trim()) as ConsultationStreamEvent
        if (event.type === 'done') ended = true
        if (event.type === 'error') streamError = event.message
        onEvent(event)
        lineBuffer = ''
      }
    }
    const options: UniApp.RequestOptions = {
      url: `${apiBaseUrl}${path}`,
      method: 'POST',
      data,
      dataType: 'text',
      responseType: 'text',
      timeout: 120_000,
      header: headers,
      success: (response) => {
        try {
          if (response.statusCode === 401) { clearAuthSession(); goToLogin() }
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
            reject(new Error((body as { message?: string })?.message || 'AI 请求失败'))
            return
          }
          if (receivedChunk) consume(decoder.finish(), true)
          else consume(typeof response.data === 'string' ? response.data : String(response.data || ''), true)
          if (streamError) reject(new Error(streamError))
          else if (!ended) reject(new Error('AI 回复中断，请重试'))
          else resolve()
        } catch {
          reject(new Error('AI 流式响应解析失败，请重试'))
        }
      },
      fail: (error) => reject(new Error(error.errMsg || '无法连接 AI 问诊服务')),
    };
    // H5's uni.request switches from XHR to fetch streaming only with this flag.
    (options as UniApp.RequestOptions & { enableChunked: boolean }).enableChunked = true
    const task = uni.request(options) as unknown as ChunkedTask
    task.onChunkReceived?.((result) => {
      try {
        receivedChunk = true
        consume(decoder.decode(result.data))
      } catch {
        streamError = 'AI 流式响应解析失败，请重试'
      }
    })
  })
}
