import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ApiError } from './store.js'
import healthRoutes from './routes/health.js'
import livestockRoutes from './routes/livestock.js'
import todoRoutes from './routes/todos.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = path.resolve(currentDir, '..')
const adminDir = path.join(serviceDir, 'public')
const threeDir = path.resolve(serviceDir, '../../apps/pasture-3d/dist')
const webDistDir = path.resolve(serviceDir, '../../apps/pasture-web/dist')
const webDir = fs.existsSync(path.join(webDistDir, 'build', 'h5', 'index.html'))
  ? path.join(webDistDir, 'build', 'h5')
  : webDistDir

export const app = express()
app.disable('x-powered-by')

app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  response.setHeader('Access-Control-Max-Age', '86400')

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  if (request.path === '/api' || request.path.startsWith('/api/')) {
    response.setHeader('Cache-Control', 'no-store')
  }
  next()
})

app.use('/api', healthRoutes)
app.use('/api', livestockRoutes)
app.use('/api', todoRoutes)

// Keep the existing management UI available at / while also exposing its
// explicit monorepo URL. Its API requests remain rooted at /api.
app.get('/', (request, response, next) => response.sendFile(path.join(adminDir, 'index.html'), (error) => error && next(error)))
app.use('/admin', express.static(adminDir, { index: 'index.html', fallthrough: true }))
app.use('/3d', express.static(threeDir, { index: 'index.html', fallthrough: true }))
app.use('/app', express.static(webDir, { index: 'index.html', fallthrough: true }))

app.use((request, response, next) => {
  const message = request.path === '/api' || request.path.startsWith('/api/')
    ? '接口不存在'
    : '页面不存在'
  next(new ApiError(404, message))
})

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error)

  let statusCode = error instanceof ApiError ? error.statusCode : 500
  let message = error instanceof ApiError ? error.message : '服务器内部错误'
  let details = error instanceof ApiError ? error.details : undefined

  if (error?.type === 'entity.too.large') {
    statusCode = 413
    message = '请求体超过 1MB 限制'
    details = undefined
  } else if (error?.type === 'entity.parse.failed') {
    statusCode = 400
    message = '请求体不是有效的 JSON'
    details = undefined
  } else if (error instanceof URIError) {
    statusCode = 400
    message = '请求路径格式不正确'
    details = undefined
  }

  if (statusCode >= 500) console.error(error)
  response.status(statusCode).json({
    code: statusCode,
    message,
    data: null,
    ...(details ? { details } : {}),
  })
})

export default app
