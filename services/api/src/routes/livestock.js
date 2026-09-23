import { Router, json } from 'express'
import {
  createLivestock,
  getLivestock,
  getStats,
  listLivestock,
  listMothers,
  updateLivestock,
} from '../store.js'

const router = Router()
const parseJson = json({ limit: '1mb', strict: false })
const success = (response, data, message = 'ok', statusCode = 200) => {
  response.status(statusCode).json({ code: 0, message, data })
}

router.get('/livestock', async (request, response) => {
  const records = await listLivestock({
    q: request.query.q || '',
    status: request.query.status || '',
    sourceType: request.query.sourceType || '',
  })
  success(response, records)
})

router.get('/livestock/stats', async (request, response) => {
  success(response, await getStats())
})

router.get('/livestock/mothers', async (request, response) => {
  success(response, await listMothers())
})

router.post('/livestock', parseJson, async (request, response) => {
  const record = await createLivestock(request.body || {})
  success(response, record, '牲畜档案已创建', 201)
})

router.get('/livestock/:id', async (request, response) => {
  success(response, await getLivestock(request.params.id))
})

const update = async (request, response) => {
  success(response, await updateLivestock(request.params.id, request.body || {}), '牲畜档案已更新')
}
router.patch('/livestock/:id', parseJson, update)
router.put('/livestock/:id', parseJson, update)

export default router
