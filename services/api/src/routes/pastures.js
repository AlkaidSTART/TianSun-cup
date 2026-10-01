import { Router } from 'express'
import { requireAuth, requireReady } from '../auth-middleware.js'
import {
  getCarryingCapacity,
  getPasture,
  getPressureHistory,
  listPastures,
} from '../pastures-store.js'

const router = Router()
const success = (response, data, message = 'ok', statusCode = 200) => {
  response.status(statusCode).json({ code: 0, message, data })
}

// Static segments must be registered before `/pastures/:id`, otherwise
// "pressure" and "carrying-capacity" would be read as a pasture id.
router.get('/pastures', requireAuth, requireReady, async (request, response) => {
  success(response, await listPastures(request.authUser))
})

router.get('/pastures/pressure', requireAuth, requireReady, async (request, response) => {
  success(response, await getPressureHistory(request.query))
})

router.get('/pastures/carrying-capacity', requireAuth, requireReady, async (request, response) => {
  success(response, await getCarryingCapacity(request.authUser))
})

router.get('/pastures/:id', requireAuth, requireReady, async (request, response) => {
  success(response, await getPasture(request.params.id, request.authUser))
})

export default router
