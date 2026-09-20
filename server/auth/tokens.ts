/**
 * Account-center token handling.
 *
 * The three token types have separate jobs and are never interchanged:
 *
 * - **ID Token** proves *who* logged in. Consumed once at callback, reduced to
 *   `sub` plus a profile cache, then discarded. It is never used as an API
 *   credential and never leaves the server.
 * - **Access Token** authorises 日事's *server* to call account-center APIs
 *   such as UserInfo. Used within the callback request and not persisted.
 * - **Refresh Token** obtains new tokens later. Persisted only when
 *   `RISHI_STORE_REFRESH_TOKENS` is on, encrypted at rest, server-side only.
 *
 * Nothing here is ever exposed to the browser.
 */
import * as client from 'openid-client'
import type { Db } from '../db/index.js'
import { openSecret, sealSecret } from '../crypto.js'
import { classifyGrantError, describeCause, type AccountClient } from './oidc.js'
import { apiError } from '../errors.js'
import type { Logger } from '../logger.js'

export interface StoredRefreshToken {
  userId: string
  scope: string | null
  obtainedAt: number
  rotatedAt: number
}

interface TokenRow {
  user_id: string
  refresh_token_ciphertext: string
  refresh_token_iv: string
  refresh_token_tag: string
  scope: string | null
  obtained_at: number
  rotated_at: number
}

export interface RefreshTokenStoreOptions {
  db: Db
  secret: string
  enabled: boolean
  logger: Logger
}

export class RefreshTokenStore {
  private readonly db: Db
  private readonly secret: string
  readonly enabled: boolean
  private readonly logger: Logger

  constructor({ db, secret, enabled, logger }: RefreshTokenStoreOptions) {
    this.db = db
    this.secret = secret
    this.enabled = enabled
    this.logger = logger
  }

  /** No-op when persistence is disabled, so callers need no feature check. */
  save(userId: string, refreshToken: string, scope: string | null, now = Date.now()): void {
    if (!this.enabled) {
      this.logger.debug('account_token.save.skipped', { userId })
      return
    }
    const sealed = sealSecret(refreshToken, this.secret)
    this.db
      .prepare(
        `INSERT INTO account_token
           (user_id, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag, scope, obtained_at, rotated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           refresh_token_ciphertext = excluded.refresh_token_ciphertext,
           refresh_token_iv         = excluded.refresh_token_iv,
           refresh_token_tag        = excluded.refresh_token_tag,
           scope                    = excluded.scope,
           rotated_at               = excluded.rotated_at`,
      )
      .run(userId, sealed.ciphertext, sealed.iv, sealed.tag, scope, now, now)
  }

  metadata(userId: string): StoredRefreshToken | null {
    const row = this.row(userId)
    if (!row) return null
    return {
      userId: row.user_id,
      scope: row.scope,
      obtainedAt: row.obtained_at,
      rotatedAt: row.rotated_at,
    }
  }

  /** Decrypted refresh token, or null if absent/undecryptable. */
  reveal(userId: string): string | null {
    const row = this.row(userId)
    if (!row) return null
    return openSecret(
      { ciphertext: row.refresh_token_ciphertext, iv: row.refresh_token_iv, tag: row.refresh_token_tag },
      this.secret,
    )
  }

  discard(userId: string): void {
    this.db.prepare('DELETE FROM account_token WHERE user_id = ?').run(userId)
  }

  has(userId: string): boolean {
    return this.row(userId) !== undefined
  }

  private row(userId: string): TokenRow | undefined {
    return this.db.prepare('SELECT * FROM account_token WHERE user_id = ?').get(userId) as TokenRow | undefined
  }
}

export interface RefreshOutcome {
  accessToken: string
  expiresIn: number | undefined
  /** True when the provider rotated the refresh token and we replaced ours. */
  rotated: boolean
}

/**
 * Exchanges the stored refresh token for a fresh access token.
 *
 * Rotation is honoured immediately: when the account center returns a new
 * refresh token the old one is overwritten in the same call, so it is never
 * presented twice. An `invalid_grant` means the grant is gone for good, so the
 * stored token is dropped and the caller is told to re-authenticate.
 */
export async function refreshAccountTokens(
  account: AccountClient,
  store: RefreshTokenStore,
  userId: string,
  logger: Logger,
): Promise<RefreshOutcome> {
  const refreshToken = store.reveal(userId)
  if (refreshToken === null) {
    throw apiError('account_link_expired', 'no usable refresh token on file')
  }

  const configuration = await account.configuration()

  let response: Awaited<ReturnType<typeof client.refreshTokenGrant>>
  try {
    response = await client.refreshTokenGrant(configuration, refreshToken)
  } catch (cause) {
    if (cause instanceof client.ResponseBodyError && cause.error === 'invalid_grant') {
      store.discard(userId)
      logger.warn('oidc.refresh.invalid_grant', { userId })
      throw apiError('account_link_expired', 'refresh token was rejected by the account center')
    }
    logger.warn('oidc.refresh.failed', { userId, reason: describeCause(cause) })
    throw classifyGrantError(cause)
  }

  const rotated = typeof response.refresh_token === 'string' && response.refresh_token.length > 0
  if (rotated) {
    store.save(userId, response.refresh_token as string, response.scope ?? null)
    logger.info('oidc.refresh.rotated', { userId })
  }

  return { accessToken: response.access_token, expiresIn: response.expiresIn(), rotated }
}

/**
 * RFC 7009 revocation, best effort.
 *
 * Logout must succeed locally even when the account center is unreachable, so
 * a failure here is logged and swallowed.
 */
export async function revokeRefreshToken(
  account: AccountClient,
  store: RefreshTokenStore,
  userId: string,
  logger: Logger,
): Promise<boolean> {
  const refreshToken = store.reveal(userId)
  store.discard(userId)
  if (refreshToken === null) return false

  try {
    const configuration = await account.configuration()
    if (!configuration.serverMetadata().revocation_endpoint) {
      logger.info('oidc.revocation.unsupported', { userId })
      return false
    }
    await client.tokenRevocation(configuration, refreshToken, { token_type_hint: 'refresh_token' })
    logger.info('oidc.revocation.ok', { userId })
    return true
  } catch (cause) {
    logger.warn('oidc.revocation.failed', { userId, reason: describeCause(cause) })
    return false
  }
}
