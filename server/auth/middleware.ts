/**
 * Session resolution for incoming requests.
 *
 * `attachSession` is the single place a request acquires an identity. Handlers
 * read `req.auth.user.id`; they must never derive a user from the body, the
 * query string or a header the client controls.
 */
import type { NextFunction, Request, Response } from 'express'
import type { AppContext } from '../context.js'
import { apiError } from '../errors.js'
import { getCookie } from '../http/cookies.js'
import { findUserById } from './users.js'

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || null
}

export function presentedToken(req: Request, cookieName: string): { token: string; via: 'cookie' | 'bearer' } | null {
  const bearer = bearerToken(req)
  if (bearer !== null) return { token: bearer, via: 'bearer' }
  const cookie = getCookie(req, cookieName)
  if (typeof cookie === 'string' && cookie.length > 0) return { token: cookie, via: 'cookie' }
  return null
}

export function attachSession(ctx: AppContext) {
  return function attach(req: Request, _res: Response, next: NextFunction): void {
    const presented = presentedToken(req, ctx.config.session.cookieName)
    if (presented === null) {
      next()
      return
    }

    const record = ctx.sessions.read(presented.token)
    if (record === null) {
      next()
      return
    }

    const user = findUserById(ctx.db, record.userId)
    if (user === null) {
      // The user row is gone; the session is meaningless, so drop it.
      ctx.sessions.destroy(presented.token)
      next()
      return
    }

    req.auth = { session: record, user, via: presented.via }
    next()
  }
}

/** 401 for "we do not know who you are". Never 403 — that means "not yours". */
export function requireSession(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth === undefined) {
    next(apiError('unauthenticated', `${req.method} ${req.path} requires a 日事 session`))
    return
  }
  next()
}

/** Identity of the caller. Throws rather than returning a guessable default. */
export function currentUserId(req: Request): string {
  const id = req.auth?.user.id
  if (id === undefined) throw apiError('unauthenticated', 'currentUserId called without a session')
  return id
}
