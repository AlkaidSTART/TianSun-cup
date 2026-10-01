import { Router, json } from 'express'
import { requireAuth, requireReady } from '../auth-middleware.js'
import {
  getAlertRules,
  getAlertSummary,
  handleAlert,
  listAlerts,
} from '../alerts-store.js'

const router = Router()
const parseJson = json({ limit: '1mb', strict: false })
const success = (response, data, message = 'ok', statusCode = 200) => {
  response.status(statusCode).json({ code: 0, message, data })
}

router.get('/alerts', requireAuth, requireReady, async (request, response) => {
  success(response, await listAlerts(request.query, request.authUser))
})

router.get('/alerts/summary', requireAuth, requireReady, async (request, response) => {
  success(response, await getAlertSummary(request.query, request.authUser))
})

router.get('/alerts/rules', requireAuth, requireReady, async (request, response) => {
  success(response, await getAlertRules())
})

router.patch('/alerts/:id/handle', parseJson, requireAuth, requireReady, async (request, response) => {
  const result = await handleAlert(request.params.id, request.body || {}, request.authUser)
  success(response, result.alert, result.message)
})

export default router
