import type { IncomingMessage } from 'node:http'
import type { DaysConfig } from './config'
import { readCookies } from './http'
import { isSessionRevoked, sessionFromRequest } from './session'

export type Caller = {
  key: string
  sub: string
  name: string
  email: string
  avatarUrl: string
  source: 'rishi' | 'www'
  legacyId: string | null
}

const wwwCache = new Map<string, { user: Caller | null; expires: number }>()

async function resolveWwwUser(config: DaysConfig, cookie: string | undefined): Promise<Caller | null> {
  if (!cookie) return null
  const { createHash } = await import('node:crypto')
  const key = createHash('sha256').update(cookie).digest('hex')
  const cached = wwwCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.user
  let response: Response
  try {
    response = await fetch(config.wwwSessionUrl, {
      headers: { cookie, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new Error('SESSION_UNAVAILABLE')
  }
  if (!response.ok) throw new Error('SESSION_UNAVAILABLE')
  const body = (await response.json().catch(() => ({}))) as { user?: { id?: string; name?: string; avatarUrl?: string } | null }
  const user = body.user?.id
    ? {
        key: String(body.user.id),
        sub: String(body.user.id),
        name: body.user.name || '我',
        email: '',
        avatarUrl: body.user.avatarUrl || '',
        source: 'www' as const,
        legacyId: String(body.user.id),
      }
    : null
  wwwCache.set(key, { user, expires: Date.now() + 10_000 })
  if (wwwCache.size > 500) wwwCache.clear()
  return user
}

export async function resolveCaller(req: IncomingMessage, config: DaysConfig): Promise<Caller | null> {
  const session = sessionFromRequest(req, config)
  if (session) {
    if (await isSessionRevoked(config, session.sid)) return null
    let legacyId: string | null = null
    try {
      const www = await resolveWwwUser(config, req.headers.cookie)
      legacyId = www?.legacyId || null
    } catch {
      legacyId = null
    }
    return {
      key: session.sub,
      sub: session.sub,
      name: session.name,
      email: session.email,
      avatarUrl: session.avatarUrl,
      source: 'rishi',
      legacyId,
    }
  }
  return resolveWwwUser(config, req.headers.cookie)
}

export function cookieHeaderValue(req: IncomingMessage): string | undefined {
  return req.headers.cookie
}

export { readCookies }
