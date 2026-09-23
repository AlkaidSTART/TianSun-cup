import { Router, json } from 'express'
import {
  completeTodo,
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
} from '../store.js'

const router = Router()
const parseJson = json({ limit: '1mb', strict: false })
const success = (response, data, message = 'ok', statusCode = 200) => {
  response.status(statusCode).json({ code: 0, message, data })
}

router.get('/todos', async (request, response) => {
  success(response, await listTodos({ date: request.query.date || '' }))
})

router.post('/todos', parseJson, async (request, response) => {
  success(response, await createTodo(request.body || {}), '待办事项已创建', 201)
})

router.patch('/todos/:id/complete', async (request, response) => {
  success(response, await completeTodo(request.params.id), '待办事项已完成')
})

router.patch('/todos/:id', parseJson, async (request, response) => {
  success(response, await updateTodo(request.params.id, request.body || {}), '待办事项已更新')
})

router.delete('/todos/:id', async (request, response) => {
  success(response, await deleteTodo(request.params.id), '待办事项已删除')
})

export default router
