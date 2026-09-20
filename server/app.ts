import express, { type NextFunction, type Request, type Response } from 'express'
import type { AppContext } from './context.js'
import { ApiError, apiError, toErrorBody } from './errors.js'
import { authRouter } from './auth/routes.js'
import { attachSession } from './auth/middleware.js'
import { dataRouter, healthRouter } from './data/routes.js'
import { baseSecurityHeaders, corsForAllowedOrigins, originGuard } from './http/security.js'
import { MAX_PAYLOAD_BYTES } from './data/store.js'
import { pruneExpired } from './db/index.js'

export function createApp(ctx: AppContext): express.Express {
  const app = express()

  app.disable('x-powered-by')
  if (ctx.config.trustProxy) app.set('trust proxy', 1)

  app.use(baseSecurityHeaders)
  app.use(corsForAllowedOrigins(ctx.config.web.allowedOrigins))
  app.use(express.json({ limit: MAX_PAYLOAD_BYTES }))

  app.use(attachSession(ctx))
  app.use(
    originGuard({
      allowedOrigins: ctx.config.web.allowedOrigins,
      isCookieAuthenticated: (req) => req.auth?.via === 'cookie',
    }),
  )

  app.use('/api', healthRouter(ctx))
  app.use('/api/auth', authRouter(ctx))
  app.use('/api', dataRouter(ctx))

  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(apiError('not_found', `no route for ${req.method} ${req.path}`))
  })

  app.use(errorHandler(ctx))
  return app
}

function errorHandler(ctx: AppContext) {
  return function handle(error: unknown, req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
      next(error)
      return
    }

    if (error instanceof ApiError) {
      // `internal` is for operators only; the client sees a stable code.
      // The field is `errorCode`, not `code`: a bare `code` is redacted
      // because that is what an OAuth authorization code is called.
      ctx.logger.warn('http.error', {
        errorCode: error.code,
        status: error.status,
        method: req.method,
        path: req.path,
        detail: error.internal,
      })
      res.status(error.status).json(toErrorBody(error))
      return
    }

    if (isBodyParserError(error)) {
      const mapped = apiError(error.type === 'entity.too.large' ? 'payload_too_large' : 'invalid_payload')
      res.status(mapped.status).json(toErrorBody(mapped))
      return
    }

    // Anything unrecognised is a bug: log it server-side, tell the user nothing.
    ctx.logger.error('http.unhandled', {
      method: req.method,
      path: req.path,
      error: error instanceof Error ? error : String(error),
    })
    const fallback = apiError('server_error')
    res.status(fallback.status).json(toErrorBody(fallback))
  }
}

function isBodyParserError(error: unknown): error is { type: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof (error as { type: unknown }).type === 'string'
  )
}

/** Periodic cleanup of expired sessions, transactions and handoff codes. */
export function startMaintenance(ctx: AppContext, intervalMs = 15 * 60 * 1000): NodeJS.Timeout {
  const timer = setInterval(() => {
    try {
      pruneExpired(ctx.db)
    } catch (error) {
      ctx.logger.warn('db.prune.failed', { error: error instanceof Error ? error : String(error) })
    }
  }, intervalMs)
  timer.unref()
  return timer
}
