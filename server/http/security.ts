/**
 * Cross-origin and redirect-target defences.
 *
 * Two distinct problems are handled here:
 *
 * 1. **CSRF** — cookie-authenticated state changes must originate from a
 *    trusted origin. `SameSite=Lax` already blocks cross-site form posts; the
 *    explicit `Origin` check closes the remaining gaps. Bearer-authenticated
 *    requests are exempt because a browser will not attach the header for an
 *    attacker.
 * 2. **Open redirect** — `returnTo` reaches us from a query string, so only
 *    same-site relative paths are ever honoured.
 */
import type { Request, Response, NextFunction } from 'express'
import { apiError } from '../errors.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase())
}

/**
 * Accepts only site-relative paths. Protocol-relative (`//host`), backslash
 * (`/\host`) and absolute URLs are rejected, as is anything that parses to a
 * different origin.
 */
export function sanitizeReturnTo(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const candidate = value.trim()
  if (candidate.length === 0 || candidate.length > 512) return fallback
  if (!candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback
  if (hasControlCharacter(candidate)) return fallback

  try {
    const resolved = new URL(candidate, 'https://rishi.invalid')
    if (resolved.origin !== 'https://rishi.invalid') return fallback
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return fallback
  }
}

/** Guards against header/redirect splitting via CR, LF, NUL and friends. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function originOf(value: string | undefined): string | null {
  if (!value || value === 'null') return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export interface OriginGuardOptions {
  allowedOrigins: string[]
  /**
   * Whether this request was authenticated by an *ambient* credential — a
   * cookie the browser attaches on its own.
   */
  isCookieAuthenticated: (req: Request) => boolean
}

/**
 * The check applies only to requests that ride on an ambient credential.
 *
 * CSRF is the ability to make a victim's browser spend a credential it
 * attaches automatically. A bearer token is not attached automatically, and a
 * request carrying no accepted credential has nothing to spend — an attacker
 * gains no authority by forcing one. Guarding those cases would buy no safety
 * and would break the native login handoff, which legitimately arrives from a
 * `capacitor://` origin with no cookie.
 */
export function originGuard({ allowedOrigins, isCookieAuthenticated }: OriginGuardOptions) {
  const allowed = new Set(allowedOrigins)
  return function guard(req: Request, _res: Response, next: NextFunction): void {
    if (isSafeMethod(req.method) || !isCookieAuthenticated(req)) {
      next()
      return
    }

    const origin = originOf(req.headers.origin)
    if (origin !== null) {
      if (allowed.has(origin)) {
        next()
        return
      }
      next(apiError('csrf_origin_rejected', 'Origin header is not on the allow list'))
      return
    }

    // No Origin header at all: only same-origin non-browser clients get here,
    // and SameSite=Lax already stops a cross-site browser from sending cookies.
    const referer = originOf(req.headers.referer)
    if (referer !== null && !allowed.has(referer)) {
      next(apiError('csrf_origin_rejected', 'Referer header is not on the allow list'))
      return
    }
    next()
  }
}

/**
 * CORS for the Capacitor/Electron shells, which run on their own origins.
 * Credentials are allowed only for explicitly listed origins; there is no
 * wildcard path.
 */
export function corsForAllowedOrigins(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins)
  return function cors(req: Request, res: Response, next: NextFunction): void {
    const origin = originOf(req.headers.origin)
    if (origin !== null && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      res.setHeader('Access-Control-Max-Age', '600')
    }
    res.setHeader('Vary', appendVary(res.getHeader('Vary'), 'Origin'))

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  }
}

function appendVary(existing: string | number | string[] | undefined, value: string): string {
  const current = Array.isArray(existing) ? existing.join(', ') : existing ? String(existing) : ''
  const parts = current
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (!parts.some((part) => part.toLowerCase() === value.toLowerCase())) parts.push(value)
  return parts.join(', ')
}

/** Conservative headers for a JSON API that is never framed. */
export function baseSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  // Auth responses carry redirects tied to one browser; never let a cache hold them.
  if (req.path.startsWith('/api/auth')) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Pragma', 'no-cache')
  }
  next()
}
