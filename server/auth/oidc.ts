/**
 * Account-center OIDC client.
 *
 * 日事 is a Relying Party, never an Identity Provider. All protocol work —
 * PKCE, `state`, `nonce`, JWKS retrieval, signature/issuer/audience/expiry
 * validation — is delegated to `openid-client`, which is OpenID-certified.
 * This module only owns discovery caching and error classification, so that a
 * short account-center outage never takes 日事 down (see docs/authentication.md).
 */
import * as client from 'openid-client'
import type { ServerConfig } from '../config.js'
import { apiError } from '../errors.js'
import type { Logger } from '../logger.js'

export type ClientAuthMethod = 'client_secret_post' | 'client_secret_basic' | 'none'

export function readClientAuthMethod(value: string | undefined): ClientAuthMethod {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'client_secret_basic':
      return 'client_secret_basic'
    case 'none':
      return 'none'
    default:
      return 'client_secret_post'
  }
}

export interface OidcClientOptions {
  config: ServerConfig
  logger: Logger
  /** Overridable for tests; defaults to `ACCOUNT_CLIENT_AUTH_METHOD`. */
  clientAuthMethod?: ClientAuthMethod
}

interface CacheEntry {
  configuration: client.Configuration
  expiresAt: number
}

export class AccountClient {
  private readonly serverConfig: ServerConfig
  private readonly logger: Logger
  private readonly clientAuthMethod: ClientAuthMethod
  private cache: CacheEntry | null = null
  private inFlight: Promise<client.Configuration> | null = null
  private nextRetryAt = 0

  constructor({ config, logger, clientAuthMethod }: OidcClientOptions) {
    this.serverConfig = config
    this.logger = logger
    this.clientAuthMethod = clientAuthMethod ?? readClientAuthMethod(process.env.ACCOUNT_CLIENT_AUTH_METHOD)
  }

  get scopes(): string[] {
    return this.serverConfig.account.scopes
  }

  get wantsOfflineAccess(): boolean {
    return this.serverConfig.account.scopes.includes('offline_access')
  }

  /**
   * Resolves the discovery document, reusing a cached copy until its TTL runs
   * out. Concurrent callers share one in-flight request.
   */
  async configuration(now = Date.now()): Promise<client.Configuration> {
    if (this.cache && this.cache.expiresAt > now) return this.cache.configuration
    if (this.inFlight) return this.inFlight
    if (now < this.nextRetryAt) {
      throw apiError('account_unavailable', 'discovery backoff window is still open')
    }

    const request = this.discover()
      .then((configuration) => {
        this.cache = {
          configuration,
          expiresAt: Date.now() + this.serverConfig.account.discoveryTtlSeconds * 1000,
        }
        this.nextRetryAt = 0
        return configuration
      })
      .catch((cause: unknown) => {
        this.nextRetryAt = Date.now() + this.serverConfig.account.discoveryRetrySeconds * 1000
        this.logger.warn('oidc.discovery.failed', {
          issuer: this.serverConfig.account.issuer,
          reason: describeCause(cause),
        })
        throw apiError('account_unavailable', 'openid-configuration could not be fetched')
      })
      .finally(() => {
        this.inFlight = null
      })

    this.inFlight = request
    return request
  }

  private async discover(): Promise<client.Configuration> {
    const { account } = this.serverConfig
    if (account.clientSecret === null && this.clientAuthMethod !== 'none') {
      // Refuse rather than silently degrading a confidential client to a public one.
      throw apiError('account_unavailable', 'ACCOUNT_CLIENT_SECRET is not configured')
    }

    const execute: Array<(configuration: client.Configuration) => void> = []
    if (account.allowInsecureHttp && !this.serverConfig.isProduction) {
      execute.push(client.allowInsecureRequests)
    }
    if (account.verifyIdTokenSignature) {
      // Without this the library trusts TLS instead of checking the JWS, which
      // would leave "verify the ID Token signature" unimplemented.
      execute.push(client.enableNonRepudiationChecks)
    }

    const configuration = await client.discovery(
      new URL(account.issuer),
      account.clientId,
      undefined,
      this.clientAuth(account.clientSecret),
      { execute, algorithm: 'oidc' },
    )

    const metadata = configuration.serverMetadata()
    this.logger.info('oidc.discovery.ok', {
      issuer: metadata.issuer,
      hasUserInfo: Boolean(metadata.userinfo_endpoint),
      hasRevocation: Boolean(metadata.revocation_endpoint),
      hasEndSession: Boolean(metadata.end_session_endpoint),
    })
    return configuration
  }

  private clientAuth(secret: string | null): client.ClientAuth {
    if (this.clientAuthMethod === 'none' || secret === null) return client.None()
    if (this.clientAuthMethod === 'client_secret_basic') return client.ClientSecretBasic(secret)
    return client.ClientSecretPost(secret)
  }

  /** Drops the cached discovery document; used after a hard provider error. */
  reset(): void {
    this.cache = null
  }
}

/** Human-readable cause for logs, with any token-bearing text stripped out. */
export function describeCause(cause: unknown): string {
  if (cause instanceof client.ResponseBodyError) return `oauth_error:${cause.error}`
  if (cause instanceof client.AuthorizationResponseError) return `authorization_error:${cause.error}`
  if (cause instanceof client.ClientError) return `client_error:${cause.code ?? 'unknown'}`
  if (cause instanceof Error) return `${cause.name}`
  return 'unknown'
}

/**
 * Maps an `openid-client` failure onto our stable error vocabulary. Provider
 * payloads are deliberately not forwarded to the browser.
 */
export function classifyGrantError(cause: unknown): ReturnType<typeof apiError> {
  if (cause instanceof client.AuthorizationResponseError) {
    return cause.error === 'access_denied'
      ? apiError('login_cancelled', 'authorization response reported access_denied')
      : apiError('token_exchange_failed', `authorization response error ${cause.error}`)
  }
  if (cause instanceof client.ResponseBodyError) {
    return apiError('token_exchange_failed', `token endpoint error ${cause.error}`)
  }
  if (cause instanceof client.ClientError) {
    // Signature, issuer, audience, expiry and nonce checks all surface here.
    return apiError('id_token_invalid', `client validation failed ${cause.code ?? 'unknown'}`)
  }
  if (cause instanceof TypeError) {
    return apiError('account_unavailable', 'network failure while contacting the account center')
  }
  return apiError('token_exchange_failed', describeCause(cause))
}
