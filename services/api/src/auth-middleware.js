import { ApiError } from './store.js'
import { getUserForSession } from './auth-store.js'

export const sessionCookieName = 'tiansun_session'

export function readBearerToken(request) {
  const value = request.get('authorization') || ''
  const match = value.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function readCookieToken(request) {
  const header = request.get('cookie') || ''
  const cookie = header.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`))
  return cookie ? cookie.slice(sessionCookieName.length + 1) : ''
}

export function requireAuth(request, response, next) {
  const bearer = readBearerToken(request)
  const token = bearer || readCookieToken(request)
  const user = getUserForSession(token)
  if (!user) {
    next(new ApiError(401, '请先登录'))
    return
  }
  if (!bearer && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    && request.get('x-requested-with') !== 'TianSun') {
    next(new ApiError(403, '请求来源校验失败'))
    return
  }
  request.authToken = token
  request.authSource = bearer ? 'bearer' : 'cookie'
  request.authUser = user
  next()
}

export function requireReady(request, response, next) {
  if (request.authUser?.mustChangePassword) {
    next(new ApiError(403, '首次登录请先修改密码'))
    return
  }
  next()
}

export function requireAdmin(request, response, next) {
  if (request.authUser?.role !== 'admin') {
    next(new ApiError(403, '只有管理员可以执行此操作'))
    return
  }
  next()
}
