import app from './src/app.js'
import { closeDatabase } from './src/store.js'

const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'
const server = app.listen(port, host, () => {
  console.log(`TianSun Express service listening at http://${host}:${port}`)
  console.log(`Admin console: http://localhost:${port}/`)
})

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down gracefully`)
  server.close(() => {
    closeDatabase()
    process.exit(0)
  })
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
