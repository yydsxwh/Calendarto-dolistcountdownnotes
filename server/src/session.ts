import type { IncomingMessage } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DaysConfig } from './config'
import { randomToken, sha256Hex, signPayload, verifyPayload } from './crypto'
import { bearerToken, readCookies } from './http'

export const SESSION_COOKIE = 'rishi_session'
export const OIDC_COOKIE = 'rishi_oidc'

export type RishiSession = {
  sid: string
  sub: string
  name: string
  email: string
  avatarUrl: string
  exp: number
  iat: number
}

export type OidcStart = {
  state: string
  nonce: string
  verifier: string
  returnTo: string
  native: boolean
}

export function publicUser(session: RishiSession) {
  return {
    id: session.sub,
    sub: session.sub,
    name: session.name || '我',
    email: session.email || '',
    avatarUrl: session.avatarUrl || '',
  }
}

export function issueSession(input: Omit<RishiSession, 'sid' | 'exp' | 'iat'>, config: DaysConfig): { token: string; session: RishiSession } {
  const now = Math.floor(Date.now() / 1000)
  const session: RishiSession = {
    ...input,
    sid: randomToken(18),
    iat: now,
    exp: now + config.sessionTtlSec,
  }
  return { token: signPayload(session, config.sessionSecret), session }
}

export function readSessionToken(token: string | undefined, config: DaysConfig): RishiSession | null {
  const session = verifyPayload<RishiSession>(token, config.sessionSecret)
  if (!session?.sub || !session.sid || !session.exp) return null
  if (session.exp * 1000 <= Date.now()) return null
  return session
}

export function sessionFromRequest(req: IncomingMessage, config: DaysConfig): RishiSession | null {
  const fromHeader = readSessionToken(bearerToken(req), config)
  if (fromHeader) return fromHeader
  return readSessionToken(readCookies(req)[SESSION_COOKIE], config)
}

export function signOidcStart(start: OidcStart, config: DaysConfig): string {
  return signPayload({ ...start, exp: Math.floor(Date.now() / 1000) + 10 * 60 }, config.sessionSecret)
}

export function readOidcStart(token: string | undefined, config: DaysConfig): OidcStart | null {
  const start = verifyPayload<OidcStart & { exp?: number }>(token, config.sessionSecret)
  if (!start?.state || !start.nonce || !start.verifier) return null
  if ((start.exp || 0) * 1000 <= Date.now()) return null
  return start
}

async function revokeFile(config: DaysConfig, sid: string) {
  return join(config.dataDir, 'revoked', `${sha256Hex(sid)}.json`)
}

export async function persistSession(config: DaysConfig, session: RishiSession): Promise<void> {
  await mkdir(join(config.dataDir, 'sessions'), { recursive: true })
  await writeFile(
    join(config.dataDir, 'sessions', `${sha256Hex(session.sid)}.json`),
    JSON.stringify({ sub: session.sub, exp: session.exp, createdAt: new Date().toISOString() }),
  )
}

export async function revokeSession(config: DaysConfig, sid: string): Promise<void> {
  await mkdir(join(config.dataDir, 'revoked'), { recursive: true })
  await writeFile(await revokeFile(config, sid), JSON.stringify({ sid, revokedAt: new Date().toISOString() }))
}

export async function isSessionRevoked(config: DaysConfig, sid: string): Promise<boolean> {
  try {
    await readFile(await revokeFile(config, sid))
    return true
  } catch {
    return false
  }
}
