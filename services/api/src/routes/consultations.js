import { Router, json } from 'express'
import { requireAuth, requireReady } from '../auth-middleware.js'
import {
  createConsultation,
  createMessage,
  getConsultation,
  listConsultations,
  updateConsultation,
} from '../consultations-store.js'

const router = Router()
const parseJson = json({ limit: '1mb', strict: false })
const success = (response, data, message = 'ok', statusCode = 200) => {
  response.status(statusCode).json({ code: 0, message, data })
}

router.get('/consultations', requireAuth, requireReady, async (request, response) => {
  success(response, await listConsultations(request.query, request.authUser))
})

router.post('/consultations', parseJson, requireAuth, requireReady, async (request, response) => {
  success(response, await createConsultation(request.body || {}, request.authUser), '问诊已提交', 201)
})

router.get('/consultations/:id', requireAuth, requireReady, async (request, response) => {
  success(response, await getConsultation(request.params.id, request.authUser))
})

router.post('/consultations/:id/messages', parseJson, requireAuth, requireReady, async (request, response) => {
  success(response, await createMessage(request.params.id, request.body || {}, request.authUser), '已发送', 201)
})

router.patch('/consultations/:id', parseJson, requireAuth, requireReady, async (request, response) => {
  success(response, await updateConsultation(request.params.id, request.body || {}, request.authUser), '问诊已关闭')
})

export default router
