import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { DaysConfig } from './config'
import { createPkcePair, randomToken } from './crypto'
import type { OidcStart } from './session'

export type IdTokenClaims = {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat: number
  nonce?: string
  name?: string
  picture?: string
  email?: string
  email_verified?: boolean
  preferred_username?: string
  role?: string
  roles?: string[] | string
}

export class OidcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'OidcError'
  }
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function jwksFor(issuer: string) {
  const url = `${issuer}/.well-known/jwks.json`
  const cached = jwksCache.get(url)
  if (cached) return cached
  // 登录时才拉 JWKS。缓存命中后 Account 短暂不可用，不影响已签发且未过期的 ID Token 校验；
  // 已建立的 rishi_session 根本不走这里。
  const jwks = createRemoteJWKSet(new URL(url), {
    timeoutDuration: 2_500,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  })
  jwksCache.set(url, jwks)
  return jwks
}

export function buildAuthorizeUrl(config: DaysConfig, start: OidcStart, challenge: string): string {
  const authorize = new URL('/api/oauth/authorize', config.accountIssuer)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', config.accountClientId)
  authorize.searchParams.set('redirect_uri', config.accountRedirectUri)
  authorize.searchParams.set('scope', config.accountScopes)
  authorize.searchParams.set('state', start.state)
  authorize.searchParams.set('nonce', start.nonce)
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 'S256')
  return authorize.toString()
}

export function startOidc(returnTo: string, native: boolean): { start: OidcStart; challenge: string } {
  const { verifier, challenge } = createPkcePair()
  return {
    start: {
      state: randomToken(16),
      nonce: randomToken(16),
      verifier,
      returnTo,
      native,
    },
    challenge,
  }
}

export async function exchangeAuthorizationCode(
  config: DaysConfig,
  input: { code: string; codeVerifier: string },
): Promise<{ id_token?: string; access_token?: string; refresh_token?: string; error?: string; error_description?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: config.accountRedirectUri,
    code_verifier: input.codeVerifier,
    client_id: config.accountClientId,
    client_secret: config.accountClientSecret,
  })
  const response = await fetch(`${config.accountIssuer}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(10000),
  })
  const json = (await response.json().catch(() => ({}))) as {
    id_token?: string
    access_token?: string
    refresh_token?: string
    error?: string
    error_description?: string
  }
  if (!response.ok) {
    throw new OidcError(json.error || 'token_error', json.error_description || `token endpoint ${response.status}`)
  }
  return json
}

export async function verifyIdToken(
  config: DaysConfig,
  idToken: string,
  expected: { issuer?: string; audience?: string; nonce?: string } = {},
): Promise<IdTokenClaims> {
  const issuer = expected.issuer ?? config.accountIssuer
  const audience = expected.audience ?? config.accountClientId
  if (!idToken) throw new OidcError('invalid_id_token', 'missing id_token')
  let payload: IdTokenClaims
  try {
    const verified = await jwtVerify(idToken, jwksFor(issuer), {
      issuer,
      audience,
      algorithms: ['RS256'],
    })
    payload = verified.payload as IdTokenClaims
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    if (/unexpected.*issuer|iss/i.test(text)) throw new OidcError('invalid_issuer', text)
    if (/unexpected.*audience|aud/i.test(text)) throw new OidcError('invalid_audience', text)
    throw new OidcError('invalid_id_token', text)
  }
  if (!payload.sub) throw new OidcError('invalid_id_token', 'missing sub')
  if (expected.nonce && payload.nonce !== expected.nonce) {
    throw new OidcError('invalid_nonce', 'nonce mismatch')
  }
  return payload
}

export function safeReturnTo(value: string | null | undefined, fallback: string): string {
  const raw = (value || '').trim()
  if (!raw) return fallback
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const url = new URL(raw)
    if (url.protocol === 'kemiao-days:') return raw
    if (url.protocol === 'http:' || url.protocol === 'https:') return raw
  } catch {
    return fallback
  }
  return fallback
}
