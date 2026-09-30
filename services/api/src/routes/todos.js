import { Router, json } from 'express'
import { requireAuth, requireReady } from '../auth-middleware.js'
import {
  completeTodo,
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
} from '../store.js'

const router = Router()
const parseJson = json({ limit: '1mb', strict: false })
router.use(requireAuth, requireReady)
const success = (response, data, message = 'ok', statusCode = 200) => {
  response.status(statusCode).json({ code: 0, message, data })
}

router.get('/todos', async (request, response) => {
  success(response, await listTodos({ date: request.query.date || '' }, request.authUser))
})

router.post('/todos', parseJson, async (request, response) => {
  success(response, await createTodo(request.body || {}, request.authUser), '待办事项已创建', 201)
})

router.patch('/todos/:id/complete', async (request, response) => {
  success(response, await completeTodo(request.params.id, request.authUser), '待办事项已完成')
})

router.patch('/todos/:id', parseJson, async (request, response) => {
  success(response, await updateTodo(request.params.id, request.body || {}, request.authUser), '待办事项已更新')
})

router.delete('/todos/:id', async (request, response) => {
  success(response, await deleteTodo(request.params.id, request.authUser), '待办事项已删除')
})

export default router
