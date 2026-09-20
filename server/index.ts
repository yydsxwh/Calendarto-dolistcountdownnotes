/**
 * 颗秒日事 BFF entry point.
 *
 * Run in development with `npm run dev:server` (tsx) and in production with
 * `npm run build:server && node dist-server/server/index.js`.
 */
import { createApp, startMaintenance } from './app.js'
import { describeConfig, loadConfig, ConfigError } from './config.js'
import { createContext } from './context.js'
import { createLogger } from './logger.js'

function main(): void {
  const logger = createLogger()

  let context
  try {
    const config = loadConfig()
    context = createContext({ config, logger })
    logger.info('server.config.loaded', describeConfig(config))
  } catch (error) {
    if (error instanceof ConfigError) {
      // Configuration problems name the variable but never print its value.
      logger.error('server.config.invalid', { reason: error.message })
      process.exitCode = 1
      return
    }
    throw error
  }

  const app = createApp(context)
  startMaintenance(context)

  const server = app.listen(context.config.port, () => {
    logger.info('server.listening', { port: context.config.port })
  })

  const shutdown = (signal: string) => {
    logger.info('server.shutdown', { signal })
    server.close(() => {
      context.db.close()
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main()
