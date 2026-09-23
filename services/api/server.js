import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ApiError,
  breedOptions,
  completeTodo,
  createLivestock,
  createTodo,
  databaseFile,
  deleteTodo,
  getLivestock,
  getStats,
  listLivestock,
  listMothers,
  listTodos,
  pastureOptions,
  sourceTypeOptions,
  statusOptions,
  updateLivestock,
  updateTodo,
} from './src/store.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(currentDir, 'public')
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  response.setHeader('Access-Control-Max-Age', '86400')
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  response.end(body)
}

function sendSuccess(response, data, message = 'ok', statusCode = 200) {
  sendJson(response, statusCode, { code: 0, message, data })
}

function sendError(response, error) {
  const statusCode = error instanceof ApiError ? error.statusCode : 500
  const message = error instanceof ApiError ? error.message : '服务器内部错误'
  if (statusCode >= 500) console.error(error)
  sendJson(response, statusCode, {
    code: statusCode,
    message,
    data: null,
    ...(error?.details ? { details: error.details } : {}),
  })
}

async function readJsonBody(request) {
  const chunks = []
  let totalSize = 0
  for await (const chunk of request) {
    totalSize += chunk.length
    if (totalSize > 1024 * 1024) throw new ApiError(413, '请求体超过 1MB 限制')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ApiError(400, '请求体不是有效的 JSON')
  }
}

async function handleApi(request, response, url) {
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method === 'GET' && pathname === '/api/health') {
    sendSuccess(response, {
      status: 'ok',
      service: 'tiansun-livestock-backend',
      storage: 'sqlite',
      database: path.basename(databaseFile),
      time: new Date().toISOString(),
    })
    return
  }

  if (request.method === 'GET' && pathname === '/api/meta/options') {
    sendSuccess(response, {
      sourceTypes: sourceTypeOptions,
      statuses: statusOptions,
      pastures: pastureOptions,
      breeds: breedOptions,
      sexes: [
        { value: 'female', label: '母' },
        { value: 'male', label: '公' },
      ],
    })
    return
  }

  if (request.method === 'GET' && pathname === '/api/todos') {
    const records = await listTodos({ date: url.searchParams.get('date') || '' })
    sendSuccess(response, records)
    return
  }

  if (request.method === 'POST' && pathname === '/api/todos') {
    const payload = await readJsonBody(request)
    const record = await createTodo(payload)
    sendSuccess(response, record, '待办事项已创建', 201)
    return
  }

  const todoCompleteMatch = pathname.match(/^\/api\/todos\/([^/]+)\/complete$/)
  if (todoCompleteMatch && request.method === 'PATCH') {
    const id = decodeURIComponent(todoCompleteMatch[1])
    const record = await completeTodo(id)
    sendSuccess(response, record, '待办事项已完成')
    return
  }

  const todoMatch = pathname.match(/^\/api\/todos\/([^/]+)$/)
  if (todoMatch && request.method === 'PATCH') {
    const id = decodeURIComponent(todoMatch[1])
    const payload = await readJsonBody(request)
    const record = await updateTodo(id, payload)
    sendSuccess(response, record, '待办事项已更新')
    return
  }

  if (todoMatch && request.method === 'DELETE') {
    const id = decodeURIComponent(todoMatch[1])
    sendSuccess(response, await deleteTodo(id), '待办事项已删除')
    return
  }

  if (request.method === 'GET' && pathname === '/api/livestock') {
    const records = await listLivestock({
      q: url.searchParams.get('q') || '',
      status: url.searchParams.get('status') || '',
      sourceType: url.searchParams.get('sourceType') || '',
    })
    sendSuccess(response, records)
    return
  }

  if (request.method === 'GET' && pathname === '/api/livestock/stats') {
    sendSuccess(response, await getStats())
    return
  }

  if (request.method === 'GET' && pathname === '/api/livestock/mothers') {
    sendSuccess(response, await listMothers())
    return
  }

  if (request.method === 'POST' && pathname === '/api/livestock') {
    const payload = await readJsonBody(request)
    const record = await createLivestock(payload)
    sendSuccess(response, record, '牲畜档案已创建', 201)
    return
  }

  const recordMatch = pathname.match(/^\/api\/livestock\/([^/]+)$/)
  if (recordMatch) {
    const id = decodeURIComponent(recordMatch[1])
    if (request.method === 'GET') {
      sendSuccess(response, await getLivestock(id))
      return
    }
    if (request.method === 'PATCH' || request.method === 'PUT') {
      const payload = await readJsonBody(request)
      sendSuccess(response, await updateLivestock(id, payload), '牲畜档案已更新')
      return
    }
  }

  throw new ApiError(404, '接口不存在')
}

async function serveStatic(response, url) {
  let requestPath
  try {
    requestPath = decodeURIComponent(url.pathname)
  } catch {
    throw new ApiError(400, '请求路径格式不正确')
  }

  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
  const resolved = path.resolve(publicDir, relativePath)
  if (resolved !== publicDir && !resolved.startsWith(`${publicDir}${path.sep}`)) {
    throw new ApiError(403, '禁止访问该路径')
  }

  let filePath = resolved
  try {
    const fileStat = await fs.stat(filePath)
    if (fileStat.isDirectory()) filePath = path.join(filePath, 'index.html')
    const body = await fs.readFile(filePath)
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=300',
      'Content-Length': body.length,
    })
    response.end(body)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw new ApiError(404, '页面不存在')
    }
    throw error
  }
}

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response)
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url)
    } else {
      await serveStatic(response, url)
    }
  } catch (error) {
    sendError(response, error)
  }
})

server.listen(port, host, () => {
  console.log(`Livestock backend running at http://localhost:${port}`)
  console.log(`Admin console: http://localhost:${port}/`)
})