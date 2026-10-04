import { Router, json } from 'express'
import { requireAuth, requireReady } from '../auth-middleware.js'
import {
  getTelemetrySummary,
  listLatestSamples,
  listSampleHistory,
  recordSample,
} from '../telemetry-store.js'

const router = Router()
const parseJson = json({ limit: '1mb', strict: false })
const success = (response, data, message = 'ok', statusCode = 200) => {
  response.status(statusCode).json({ code: 0, message, data })
}

router.post('/telemetry', parseJson, requireAuth, requireReady, async (request, response) => {
  success(response, await recordSample(request.body || {}, request.authUser), '遥测数据已接收', 201)
})

router.get('/telemetry/latest', requireAuth, requireReady, async (request, response) => {
  success(response, await listLatestSamples(request.query, request.authUser))
})

router.get('/telemetry/summary', requireAuth, requireReady, async (request, response) => {
  success(response, await getTelemetrySummary(request.authUser))
})

router.get('/telemetry/:livestockId', requireAuth, requireReady, async (request, response) => {
  success(response, await listSampleHistory(request.params.livestockId, request.query, request.authUser))
})

export default router
