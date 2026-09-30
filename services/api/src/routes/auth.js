import { Router, json } from 'express'
import {
  changePassword,
  createUser,
  listUsers,
  loginUser,
  resetUserPassword,
  revokeSession,
  updateUser,
} from '../auth-store.js'
import { requireAdmin, requireAuth, requireReady, sessionCookieName } from '../auth-middleware.js'

const cookieLifetimeSeconds = 7 * 24 * 60 * 60

function secureCookie(request) {
  const forwarded = (request.get('x-forwarded-proto') || '').split(',')[0].trim()
  return request.secure || forwarded === 'https' ? '; Secure' : ''
}

function setSessionCookie(request, response, token) {
  response.setHeader('Set-Cookie', `${sessionCookieName}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${cookieLifetimeSeconds}${secureCookie(request)}`)
}

function clearSessionCookie(request, response) {
  response.setHeader('Set-Cookie', `${sessionCookieName}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secureCookie(request)}`)
}

function isMiniProgram(request) {
  return request.get('x-client-platform') === 'mp-weixin'
}

const router = Router()
const parseJson = json({ limit: '1mb', strict: false })
const success = (response, data, message = 'ok', statusCode = 200) => {
  response.status(statusCode).json({ code: 0, message, data })
}

router.post('/auth/login', parseJson, (request, response, next) => {
  try {
    const result = loginUser({
      username: request.body?.username,
      password: request.body?.password,
      clientAddress: request.ip,
    })
    if (isMiniProgram(request)) success(response, result, '登录成功')
    else {
      setSessionCookie(request, response, result.token)
      success(response, { expiresAt: result.expiresAt, user: result.user }, '登录成功')
    }
  } catch (error) {
    next(error)
  }
})

router.get('/auth/me', requireAuth, (request, response) => {
  success(response, request.authUser)
})

router.post('/auth/logout', requireAuth, (request, response) => {
  revokeSession(request.authToken)
  clearSessionCookie(request, response)
  success(response, { loggedOut: true }, '已退出登录')
})

router.post('/auth/password', parseJson, requireAuth, (request, response, next) => {
  try {
    const result = changePassword(request.authUser.id, {
      currentPassword: request.body?.currentPassword,
      newPassword: request.body?.newPassword,
    })
    if (request.authSource === 'bearer') success(response, result, '密码已更新')
    else {
      setSessionCookie(request, response, result.token)
      success(response, { expiresAt: result.expiresAt, user: result.user }, '密码已更新')
    }
  } catch (error) {
    next(error)
  }
})

router.get('/users', requireAuth, requireReady, requireAdmin, (request, response) => {
  success(response, listUsers())
})

router.post('/users', parseJson, requireAuth, requireReady, requireAdmin, (request, response, next) => {
  try {
    success(response, createUser(request.body || {}), '用户已创建', 201)
  } catch (error) {
    next(error)
  }
})

router.patch('/users/:id', parseJson, requireAuth, requireReady, requireAdmin, (request, response, next) => {
  try {
    success(response, updateUser(request.params.id, request.body || {}, request.authUser.id), '用户信息已更新')
  } catch (error) {
    next(error)
  }
})

router.post('/users/:id/reset-password', requireAuth, requireReady, requireAdmin, (request, response, next) => {
  try {
    success(response, resetUserPassword(request.params.id, request.authUser.id), '已重置密码，请将临时密码交给用户')
  } catch (error) {
    next(error)
  }
})

export default router
