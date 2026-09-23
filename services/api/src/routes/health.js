import { Router } from 'express'
import path from 'node:path'
import {
  breedOptions,
  databaseFile,
  pastureOptions,
  sourceTypeOptions,
  statusOptions,
} from '../store.js'

const router = Router()

router.get('/health', (request, response) => {
  response.json({
    code: 0,
    message: 'ok',
    data: {
      status: 'ok',
      service: 'tiansun-livestock-backend',
      storage: 'sqlite',
      database: path.basename(databaseFile),
      time: new Date().toISOString(),
    },
  })
})

router.get('/meta/options', (request, response) => {
  response.json({
    code: 0,
    message: 'ok',
    data: {
      sourceTypes: sourceTypeOptions,
      statuses: statusOptions,
      pastures: pastureOptions,
      breeds: breedOptions,
      sexes: [
        { value: 'female', label: '母' },
        { value: 'male', label: '公' },
      ],
    },
  })
})

export default router
