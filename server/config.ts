/**
 * Runtime configuration for the 颗秒日事 (Rishi) backend-for-frontend.
 *
 * Nothing in this file may be logged: `accountClientSecret` and `sessionSecret`
 * are credentials. Use `describeConfig()` when you need something printable.
 */

export type NodeEnv = 'development' | 'test' | 'production'

export interface AccountConfig {
  /** OIDC issuer identifier. Discovery derives every endpoint from this. */
  issuer: string
  clientId: string
  /** Confidential-client secret. Absent only in local/dev scaffolding. */
  clientSecret: string | null
  redirectUri: string
  scopes: string[]
  /** Only ever true for local/test HTTP providers; refused in production. */
  allowInsecureHttp: boolean
  /**
   * Verify the ID Token's JWS signature against the published JWKS.
   *
   * OIDC Core §3.1.3.7 treats this as optional for the code flow because the
   * token arrives over a TLS-validated channel, and `openid-client` skips it
   * by default. 日事 turns it on: we want the signature checked, not inferred.
   */
  verifyIdTokenSignature: boolean
  /** Seconds to cache a successful discovery document. */
  discoveryTtlSeconds: number
  /** Seconds to wait before retrying discovery after a failure. */
  discoveryRetrySeconds: number
}

export interface SessionConfig {
  secret: string
  cookieName: string
  /** Hard cap on a session's lifetime, refreshed only by a new login. */
  absoluteTtlSeconds: number
  /** Sliding window; a session dies after this much inactivity. */
  idleTtlSeconds: number
  cookieDomain: string | null
  cookieSecure: boolean
  cookieSameSite: 'lax' | 'strict' | 'none'
}

export interface WebConfig {
  /** Origin the SPA is served from; used to build absolute redirects. */
  appOrigin: string
  /** Origins accepted for CORS and for same-origin (CSRF) checks. */
  allowedOrigins: string[]
  /** Where the user lands after login when no safe `returnTo` was supplied. */
  defaultReturnTo: string
}

export interface NativeConfig {
  enabled: boolean
  /** Custom scheme the Android/iOS shell registers, e.g. `com.yydsxwh.kemiao.days`. */
  redirectScheme: string
  handoffTtlSeconds: number
}

export interface ServerConfig {
  nodeEnv: NodeEnv
  isProduction: boolean
  port: number
  databaseFile: string
  account: AccountConfig
  session: SessionConfig
  web: WebConfig
  native: NativeConfig
  /**
   * Whether to persist account refresh tokens. Off by default: 日事 only needs
   * an identity at login, so there is nothing to keep. See docs/authentication.md.
   */
  storeRefreshTokens: boolean
  trustProxy: boolean
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

type Env = Record<string, string | undefined>

function readString(env: Env, key: string, fallback: string): string {
  const raw = env[key]
  if (raw === undefined) return fallback
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function readOptional(env: Env, key: string): string | null {
  const raw = env[key]
  if (raw === undefined) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readBoolean(env: Env, key: string, fallback: boolean): boolean {
  const raw = readOptional(env, key)
  if (raw === null) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())
}

function readInt(env: Env, key: string, fallback: number): number {
  const raw = readOptional(env, key)
  if (raw === null) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigError(`${key} must be a positive integer`)
  }
  return parsed
}

function readUrl(env: Env, key: string, fallback: string): string {
  const raw = readString(env, key, fallback)
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ConfigError(`${key} must be an absolute URL`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(`${key} must use http or https`)
  }
  return raw.replace(/\/+$/, '')
}

function readOrigin(value: string, key: string): string {
  try {
    return new URL(value).origin
  } catch {
    throw new ConfigError(`${key} must be an absolute URL`)
  }
}

const DEFAULT_ISSUER = 'https://account.yydsxwh.com'
const DEFAULT_CLIENT_ID = 'rishi'
const DEFAULT_REDIRECT_URI = 'https://rishi.yydsxwh.com/api/auth/callback'
const DEFAULT_APP_ORIGIN = 'https://rishi.yydsxwh.com'
const DEFAULT_SCOPES = 'openid profile email'
const MIN_SESSION_SECRET_LENGTH = 32

/**
 * Only meaningful in development and tests: production must supply a real
 * secret, and `loadConfig` refuses to boot without one.
 */
const DEV_SESSION_SECRET = 'dev-only-insecure-rishi-session-secret-change-me'

export function loadConfig(env: Env = process.env): ServerConfig {
  const nodeEnvRaw = readString(env, 'NODE_ENV', 'development')
  const nodeEnv: NodeEnv =
    nodeEnvRaw === 'production' ? 'production' : nodeEnvRaw === 'test' ? 'test' : 'development'
  const isProduction = nodeEnv === 'production'

  const issuer = readUrl(env, 'ACCOUNT_ISSUER', DEFAULT_ISSUER)
  const redirectUri = readUrl(env, 'ACCOUNT_REDIRECT_URI', DEFAULT_REDIRECT_URI)
  const clientSecret = readOptional(env, 'ACCOUNT_CLIENT_SECRET')
  const allowInsecureHttp = readBoolean(env, 'ACCOUNT_ALLOW_INSECURE_HTTP', false)

  const sessionSecret = readOptional(env, 'RISHI_SESSION_SECRET') ?? DEV_SESSION_SECRET
  const appOrigin = readUrl(env, 'RISHI_APP_ORIGIN', DEFAULT_APP_ORIGIN)

  const extraOrigins = (readOptional(env, 'RISHI_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => readOrigin(value, 'RISHI_ALLOWED_ORIGINS'))

  const allowedOrigins = Array.from(new Set([readOrigin(appOrigin, 'RISHI_APP_ORIGIN'), ...extraOrigins]))

  const config: ServerConfig = {
    nodeEnv,
    isProduction,
    port: readInt(env, 'PORT', 3100),
    databaseFile: readString(env, 'RISHI_DATABASE_FILE', 'var/rishi.sqlite'),
    account: {
      issuer,
      clientId: readString(env, 'ACCOUNT_CLIENT_ID', DEFAULT_CLIENT_ID),
      clientSecret,
      redirectUri,
      scopes: readString(env, 'ACCOUNT_SCOPES', DEFAULT_SCOPES).split(/\s+/).filter(Boolean),
      allowInsecureHttp,
      verifyIdTokenSignature: readBoolean(env, 'ACCOUNT_VERIFY_ID_TOKEN_SIGNATURE', true),
      discoveryTtlSeconds: readInt(env, 'ACCOUNT_DISCOVERY_TTL_SECONDS', 3600),
      discoveryRetrySeconds: readInt(env, 'ACCOUNT_DISCOVERY_RETRY_SECONDS', 30),
    },
    session: {
      secret: sessionSecret,
      cookieName: readString(env, 'RISHI_SESSION_COOKIE_NAME', 'rishi_sid'),
      absoluteTtlSeconds: readInt(env, 'RISHI_SESSION_ABSOLUTE_TTL_SECONDS', 60 * 60 * 24 * 30),
      idleTtlSeconds: readInt(env, 'RISHI_SESSION_IDLE_TTL_SECONDS', 60 * 60 * 24 * 14),
      cookieDomain: readOptional(env, 'RISHI_SESSION_COOKIE_DOMAIN'),
      cookieSecure: readBoolean(env, 'RISHI_SESSION_COOKIE_SECURE', isProduction),
      cookieSameSite: 'lax',
    },
    web: {
      appOrigin,
      allowedOrigins,
      defaultReturnTo: readString(env, 'RISHI_DEFAULT_RETURN_TO', '/'),
    },
    native: {
      enabled: readBoolean(env, 'RISHI_NATIVE_HANDOFF_ENABLED', true),
      redirectScheme: readString(env, 'RISHI_NATIVE_SCHEME', 'com.yydsxwh.kemiao.days'),
      handoffTtlSeconds: readInt(env, 'RISHI_NATIVE_HANDOFF_TTL_SECONDS', 120),
    },
    storeRefreshTokens: readBoolean(env, 'RISHI_STORE_REFRESH_TOKENS', false),
    trustProxy: readBoolean(env, 'RISHI_TRUST_PROXY', isProduction),
  }

  assertConsistent(config)
  return config
}

function assertConsistent(config: ServerConfig): void {
  const { account, session, isProduction } = config

  if (account.scopes.length === 0 || !account.scopes.includes('openid')) {
    throw new ConfigError('ACCOUNT_SCOPES must include "openid"')
  }

  if (config.storeRefreshTokens && !account.scopes.includes('offline_access')) {
    throw new ConfigError('RISHI_STORE_REFRESH_TOKENS requires "offline_access" in ACCOUNT_SCOPES')
  }

  if (session.absoluteTtlSeconds < session.idleTtlSeconds) {
    throw new ConfigError(
      'RISHI_SESSION_ABSOLUTE_TTL_SECONDS must be greater than or equal to RISHI_SESSION_IDLE_TTL_SECONDS',
    )
  }

  // A shared secret would let either system mint the other's credentials.
  if (account.clientSecret !== null && account.clientSecret === session.secret) {
    throw new ConfigError('RISHI_SESSION_SECRET must differ from ACCOUNT_CLIENT_SECRET')
  }

  if (!isProduction) return

  if (account.clientSecret === null) {
    throw new ConfigError('ACCOUNT_CLIENT_SECRET is required in production')
  }
  if (session.secret === DEV_SESSION_SECRET) {
    throw new ConfigError('RISHI_SESSION_SECRET is required in production')
  }
  if (session.secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new ConfigError(
      `RISHI_SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters in production`,
    )
  }
  if (account.allowInsecureHttp) {
    throw new ConfigError('ACCOUNT_ALLOW_INSECURE_HTTP must not be enabled in production')
  }
  if (!account.issuer.startsWith('https://')) {
    throw new ConfigError('ACCOUNT_ISSUER must use https in production')
  }
  if (!account.redirectUri.startsWith('https://')) {
    throw new ConfigError('ACCOUNT_REDIRECT_URI must use https in production')
  }
  if (!session.cookieSecure) {
    throw new ConfigError('RISHI_SESSION_COOKIE_SECURE must stay enabled in production')
  }
}

/** Credential-free view of the configuration, safe to log or expose to ops. */
export function describeConfig(config: ServerConfig): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    port: config.port,
    databaseFile: config.databaseFile,
    issuer: config.account.issuer,
    clientId: config.account.clientId,
    redirectUri: config.account.redirectUri,
    scopes: config.account.scopes.join(' '),
    clientSecretConfigured: config.account.clientSecret !== null,
    verifyIdTokenSignature: config.account.verifyIdTokenSignature,
    appOrigin: config.web.appOrigin,
    allowedOrigins: config.web.allowedOrigins,
    sessionCookieName: config.session.cookieName,
    sessionCookieSecure: config.session.cookieSecure,
    sessionCookieSameSite: config.session.cookieSameSite,
    storeRefreshTokens: config.storeRefreshTokens,
    nativeHandoffEnabled: config.native.enabled,
  }
}
