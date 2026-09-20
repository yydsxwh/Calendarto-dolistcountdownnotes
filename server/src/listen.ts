import { mkdir } from 'node:fs/promises'
import { loadConfig } from './config'
import { createDaysServer } from './index'
import { log } from './http'

const config = loadConfig()
await mkdir(config.dataDir, { recursive: true })
const server = createDaysServer(config)
server.listen(config.port, config.host, () => {
  log('info', 'days sync listening', { host: config.host, port: config.port, dataDir: config.dataDir })
})
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log('info', 'shutting down', { signal })
    server.close(() => process.exit(0))
  })
}
