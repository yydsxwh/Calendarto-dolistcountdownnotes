import { mkdir } from 'node:fs/promises'
import { loadConfig } from './config'
import { createDaysServer } from './index'
import { hydrateIntegrations } from './integration-store'
import { log } from './http'

async function main() {
  const config = loadConfig()
  await mkdir(config.dataDir, { recursive: true })
  await hydrateIntegrations(config)
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
}

main().catch((error) => {
  log('error', 'days sync failed to start', { reason: error instanceof Error ? error.message : 'error' })
  process.exit(1)
})
