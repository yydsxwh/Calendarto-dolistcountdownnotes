/**
 * `/api/auth/*` — the Relying Party endpoints.
 *
 * Flow: `/login` builds an Authorization Code + PKCE request and parks
 * `state`/`nonce`/`code_verifier` server-side; `/callback` re-binds the browser
 * to that transaction, lets `openid-client` exchange and fully validate the
 * response, maps `sub` onto a local user and mints a 日事 session.
 */
import { Router, type Request, type Response } from 'express'
import * as client from 'openid-client'
import type { AppContext } from '../context.js'
import { ApiError, apiError, isAuthErrorCode, type AuthErrorCode } from '../errors.js'
import { clearCookie, getCookie, setCookie, type CookieAttributes } from '../http/cookies.js'
import { sanitizeReturnTo } from '../http/security.js'
import { classifyGrantError, describeCause } from './oidc.js'
import { presentedToken, requireSession } from './middleware.js'
import { findUserById, toPublicUser, upsertUserFromClaims, type ProfileClaims } from './users.js'
import { revokeRefreshToken } from './tokens.js'
import { hashToken, randomToken } from '../crypto.js'
import type { ClientKind } from './session.js'
import { AUTH_TRANSACTION_TTL_SECONDS } from './transactions.js'

const TRANSACTION_COOKIE = 'rishi_authtx'

export function authRouter(ctx: AppContext): Router {
  const router = Router()

  router.get('/login', (req, res, next) => {
    void startLogin(ctx, req, res).catch(next)
  })

  router.get('/callback', (req, res, next) => {
    void completeLogin(ctx, req, res).catch(next)
  })

  router.get('/session', (req, res) => {
    if (req.auth === undefined) {
      res.json({ authenticated: false, user: null })
      return
    }
    res.json({
      authenticated: true,
      user: toPublicUser(req.auth.user),
      session: {
        clientKind: req.auth.session.clientKind,
        createdAt: req.auth.session.createdAt,
        expiresAt: req.auth.session.absoluteExpiresAt,
      },
      accountLinked: ctx.refreshTokens.has(req.auth.user.id),
    })
  })

  router.post('/logout', requireSession, (req, res, next) => {
    void logout(ctx, req, res).catch(next)
  })

  router.post('/native/exchange', (req, res, next) => {
    void exchangeHandoff(ctx, req, res).catch(next)
  })

  return router
}

function transactionCookieAttributes(ctx: AppContext): CookieAttributes {
  return {
    httpOnly: true,
    secure: ctx.config.session.cookieSecure,
    // Lax survives the top-level GET redirect back from the account center.
    sameSite: 'lax',
    path: '/api/auth',
    domain: ctx.config.session.cookieDomain,
    maxAgeSeconds: AUTH_TRANSACTION_TTL_SECONDS,
  }
}

function sessionCookieAttributes(ctx: AppContext): CookieAttributes {
  return {
    httpOnly: true,
    secure: ctx.config.session.cookieSecure,
    sameSite: ctx.config.session.cookieSameSite,
    path: '/',
    domain: ctx.config.session.cookieDomain,
    maxAgeSeconds: ctx.config.session.absoluteTtlSeconds,
  }
}

async function startLogin(ctx: AppContext, req: Request, res: Response): Promise<void> {
  const clientKind: ClientKind = req.query.client === 'native' ? 'native' : 'web'
  if (clientKind === 'native' && !ctx.config.native.enabled) {
    throw apiError('native_disabled', 'native handoff is disabled by configuration')
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo, ctx.config.web.defaultReturnTo)

  let configuration: client.Configuration
  try {
    configuration = await ctx.account.configuration()
  } catch (cause) {
    // The account center is unreachable or misconfigured; say so plainly
    // instead of bouncing the user into a broken authorization page.
    throw cause instanceof ApiError ? cause : apiError('account_unavailable', describeCause(cause))
  }

  const codeVerifier = client.randomPKCECodeVerifier()
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
  const state = client.randomState()
  const nonce = client.randomNonce()

  ctx.transactions.create({ state, codeVerifier, nonce, returnTo, clientKind })
  setCookie(res, TRANSACTION_COOKIE, state, transactionCookieAttributes(ctx))

  const authorizationUrl = client.buildAuthorizationUrl(configuration, {
    redirect_uri: ctx.config.account.redirectUri,
    scope: ctx.account.scopes.join(' '),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  ctx.logger.info('auth.login.started', { clientKind, returnTo })
  res.redirect(302, authorizationUrl.href)
}

async function completeLogin(ctx: AppContext, req: Request, res: Response): Promise<void> {
  const boundState = getCookie(req, TRANSACTION_COOKIE)
  clearCookie(res, TRANSACTION_COOKIE, transactionCookieAttributes(ctx))

  const returnedState = typeof req.query.state === 'string' ? req.query.state : null
  if (returnedState === null || boundState === undefined || boundState !== returnedState) {
    // Either the response was forged or the browser is not the one that
    // started this login. Both are unrecoverable.
    ctx.logger.warn('auth.callback.state_mismatch', { hasCookie: boundState !== undefined })
    failLogin(ctx, res, 'invalid_state', ctx.config.web.defaultReturnTo, 'web')
    return
  }

  const transaction = ctx.transactions.consume(returnedState)
  if (transaction === null) {
    ctx.logger.warn('auth.callback.unknown_transaction')
    failLogin(ctx, res, 'invalid_state', ctx.config.web.defaultReturnTo, 'web')
    return
  }

  if (typeof req.query.error === 'string') {
    const cancelled = req.query.error === 'access_denied'
    ctx.logger.info('auth.callback.provider_error', { providerError: req.query.error })
    failLogin(
      ctx,
      res,
      cancelled ? 'login_cancelled' : 'token_exchange_failed',
      transaction.returnTo,
      transaction.clientKind,
    )
    return
  }

  let tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
  try {
    const configuration = await ctx.account.configuration()
    // openid-client performs the full check set here: code exchange with the
    // PKCE verifier, JWKS signature verification, and issuer / audience /
    // expiry / nonce validation. Never bypass it by decoding the JWT by hand.
    tokens = await client.authorizationCodeGrant(
      configuration,
      currentUrl(ctx, req),
      {
        pkceCodeVerifier: transaction.codeVerifier,
        expectedState: transaction.state,
        expectedNonce: transaction.nonce,
        idTokenExpected: true,
      },
      { redirect_uri: ctx.config.account.redirectUri },
    )
  } catch (cause) {
    const error = classifyGrantError(cause)
    ctx.logger.warn('auth.callback.grant_failed', { errorCode: error.code, reason: error.internal })
    failLogin(ctx, res, asAuthErrorCode(error.code), transaction.returnTo, transaction.clientKind)
    return
  }

  const claims = tokens.claims()
  const subject = typeof claims?.sub === 'string' ? claims.sub.trim() : ''
  if (subject.length === 0) {
    ctx.logger.error('auth.callback.missing_subject')
    failLogin(ctx, res, 'missing_subject', transaction.returnTo, transaction.clientKind)
    return
  }

  const profile = await collectProfile(ctx, tokens, claims, subject)

  let userId: string
  try {
    const { user, created } = upsertUserFromClaims(ctx.db, subject, profile)
    userId = user.id
    ctx.logger.info('auth.login.succeeded', { userId, created, clientKind: transaction.clientKind })
  } catch (cause) {
    ctx.logger.error('auth.callback.user_upsert_failed', { reason: describeCause(cause) })
    failLogin(ctx, res, 'session_failed', transaction.returnTo, transaction.clientKind)
    return
  }

  if (ctx.refreshTokens.enabled && typeof tokens.refresh_token === 'string') {
    ctx.refreshTokens.save(userId, tokens.refresh_token, tokens.scope ?? null)
  }

  if (transaction.clientKind === 'native') {
    const code = randomToken()
    const now = Date.now()
    ctx.db
      .prepare('INSERT INTO native_handoff (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(code), userId, now, now + ctx.config.native.handoffTtlSeconds * 1000)
    res.redirect(302, `${ctx.config.native.redirectScheme}://auth/callback?handoff=${encodeURIComponent(code)}`)
    return
  }

  // A brand-new token for a brand-new session: nothing from before the login
  // survives, which is what rules out session fixation.
  const issued = ctx.sessions.create(userId, 'web')
  setCookie(res, ctx.config.session.cookieName, issued.token, sessionCookieAttributes(ctx))
  res.redirect(302, absoluteAppUrl(ctx, transaction.returnTo))
}

/**
 * Best-effort profile enrichment. UserInfo is optional and may omit any claim,
 * so a failure here must not fail the login — only `sub` is required.
 */
async function collectProfile(
  ctx: AppContext,
  tokens: client.TokenEndpointResponse,
  claims: client.IDToken | undefined,
  subject: string,
): Promise<ProfileClaims> {
  const profile: ProfileClaims = {
    name: readStringClaim(claims, 'name') ?? readStringClaim(claims, 'preferred_username'),
    email: readStringClaim(claims, 'email'),
    picture: readStringClaim(claims, 'picture'),
  }

  const complete = profile.name && profile.email && profile.picture
  if (complete || typeof tokens.access_token !== 'string') return profile

  try {
    const configuration = await ctx.account.configuration()
    if (!configuration.serverMetadata().userinfo_endpoint) return profile
    const info = await client.fetchUserInfo(configuration, tokens.access_token, subject)
    return {
      name: profile.name ?? readStringClaim(info, 'name') ?? readStringClaim(info, 'preferred_username'),
      email: profile.email ?? readStringClaim(info, 'email'),
      picture: profile.picture ?? readStringClaim(info, 'picture'),
    }
  } catch (cause) {
    ctx.logger.warn('auth.userinfo.failed', { reason: describeCause(cause) })
    return profile
  }
}

function readStringClaim(source: Record<string, unknown> | undefined, key: string): string | null {
  const value = source?.[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function logout(ctx: AppContext, req: Request, res: Response): Promise<void> {
  const userId = req.auth?.user.id
  const presented = presentedToken(req, ctx.config.session.cookieName)
  if (presented !== null) ctx.sessions.destroy(presented.token)
  clearCookie(res, ctx.config.session.cookieName, sessionCookieAttributes(ctx))

  // 退出日事 ≠ 退出统一账号体系. We only drop our own session and release the
  // grant we hold; no Single Logout protocol is invented here.
  if (userId && ctx.refreshTokens.has(userId)) {
    await revokeRefreshToken(ctx.account, ctx.refreshTokens, userId, ctx.logger)
  }

  ctx.logger.info('auth.logout', { userId })
  res.status(204).end()
}

/**
 * Trades a one-time handoff code for a 日事 session bearer token.
 *
 * The code itself never carries a session; the session is minted here, so a
 * leaked code that is already spent is worthless.
 */
async function exchangeHandoff(ctx: AppContext, req: Request, res: Response): Promise<void> {
  if (!ctx.config.native.enabled) throw apiError('native_disabled', 'native handoff is disabled')

  const body: unknown = req.body
  const code =
    typeof body === 'object' && body !== null && typeof (body as { handoff?: unknown }).handoff === 'string'
      ? (body as { handoff: string }).handoff
      : null
  if (code === null || code.length === 0) throw apiError('invalid_request', 'handoff code is missing')

  const now = Date.now()
  const consume = ctx.db.transaction((id: string) => {
    const row = ctx.db.prepare('SELECT user_id, expires_at FROM native_handoff WHERE id = ?').get(id) as
      | { user_id: string; expires_at: number }
      | undefined
    if (row) ctx.db.prepare('DELETE FROM native_handoff WHERE id = ?').run(id)
    return row
  })

  const row = consume(hashToken(code))
  if (!row || row.expires_at <= now) throw apiError('handoff_invalid', 'handoff code is unknown or expired')

  const user = findUserById(ctx.db, row.user_id)
  if (user === null) throw apiError('handoff_invalid', 'handoff referenced a missing user')

  const issued = ctx.sessions.create(row.user_id, 'native')
  ctx.logger.info('auth.native.exchanged', { userId: row.user_id })
  res.json({
    token: issued.token,
    expiresAt: issued.record.absoluteExpiresAt,
    user: toPublicUser(user),
  })
}

/** The callback URL as the account center saw it, for response validation. */
function currentUrl(ctx: AppContext, req: Request): URL {
  const configured = new URL(ctx.config.account.redirectUri)
  const incoming = new URL(req.originalUrl, configured.origin)
  configured.search = incoming.search
  return configured
}

function asAuthErrorCode(code: string): AuthErrorCode {
  return isAuthErrorCode(code) ? code : 'server_error'
}

/**
 * Sends the user back to the app with a machine-readable reason. The SPA turns
 * `auth_error` into a friendly message; no provider payload or stack trace is
 * ever handed to the browser.
 */
function failLogin(
  ctx: AppContext,
  res: Response,
  code: AuthErrorCode,
  returnTo: string,
  clientKind: ClientKind,
): void {
  if (clientKind === 'native' && ctx.config.native.enabled) {
    res.redirect(302, `${ctx.config.native.redirectScheme}://auth/callback?auth_error=${code}`)
    return
  }
  const target = new URL(absoluteAppUrl(ctx, returnTo))
  target.searchParams.set('auth_error', code)
  res.redirect(302, target.href)
}

function absoluteAppUrl(ctx: AppContext, returnTo: string): string {
  const safe = sanitizeReturnTo(returnTo, ctx.config.web.defaultReturnTo)
  return new URL(safe, `${ctx.config.web.appOrigin}/`).href
}
