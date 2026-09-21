export type DaysConfig = {
  host: string
  port: number
  dataDir: string
  allowedOrigins: string[]
  publicOrigin: string
  cookieSecure: boolean
  sessionSecret: string
  sessionTtlSec: number
  accountIssuer: string
  accountClientId: string
  accountClientSecret: string
  accountRedirectUri: string
  accountScopes: string
  wwwSessionUrl: string
  platformBaseUrl: string
  platformServiceToken: string
  platformClientId: string
  nativeHandoffUri: string
  adminSubs: string[]
  configEncryptionKey: string
}

function splitList(value: string | undefined, fallback: string): string[] {
  return (value || fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function requiredInProduction(name: string, value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (trimmed) return trimmed
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error(`BLOCKED: missing ${name}`)
  }
  return fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DaysConfig {
  const publicOrigin = (env.RISHI_PUBLIC_ORIGIN || 'https://www.yydsxwh.com').replace(/\/+$/, '')
  return {
    host: env.DAYS_SYNC_HOST || '127.0.0.1',
    port: Number(env.DAYS_SYNC_PORT || 3120),
    dataDir: env.DAYS_SYNC_DATA_DIR || '/var/lib/kemiao-days',
    allowedOrigins: splitList(
      env.DAYS_SYNC_ALLOWED_ORIGINS,
      `${publicOrigin},https://localhost,capacitor://localhost,http://localhost:5173,http://127.0.0.1:5173`,
    ),
    publicOrigin,
    cookieSecure: env.RISHI_COOKIE_SECURE ? env.RISHI_COOKIE_SECURE === '1' : publicOrigin.startsWith('https:'),
    sessionSecret: requiredInProduction('RISHI_SESSION_SECRET', env.RISHI_SESSION_SECRET, 'dev-only-rishi-session-secret'),
    sessionTtlSec: Number(env.RISHI_SESSION_TTL_SEC || 30 * 24 * 60 * 60),
    accountIssuer: (env.ACCOUNT_ISSUER || '').replace(/\/+$/, ''),
    accountClientId: env.ACCOUNT_CLIENT_ID || 'rishi',
    accountClientSecret: env.ACCOUNT_CLIENT_SECRET || '',
    accountRedirectUri: env.ACCOUNT_REDIRECT_URI || `${publicOrigin}/api/days/auth/callback`,
    accountScopes: env.ACCOUNT_SCOPES || 'openid profile email offline_access',
    wwwSessionUrl: env.DAYS_SYNC_SESSION_URL || 'https://www.yydsxwh.com/api/auth/session',
    platformBaseUrl: (env.PLATFORM_API_URL || env.PLATFORM_BASE_URL || '').replace(/\/+$/, ''),
    platformServiceToken: env.PLATFORM_SERVICE_TOKEN || '',
    platformClientId: env.PLATFORM_CLIENT_ID || 'rishi',
    // 不再配「回退 OCR 地址」：主站上那个路径本来就是 BFF 自己，
    // 回退等于自己请求自己，只会 500。没接通 platform 就明确报配置错误。
    nativeHandoffUri: env.RISHI_NATIVE_HANDOFF_URI || 'kemiao-days://auth',
    adminSubs: splitList(env.RISHI_ADMIN_SUBS, ''),
    configEncryptionKey: env.RISHI_CONFIG_ENCRYPTION_KEY || '',
  }
}

export function oidcConfigured(config: DaysConfig): boolean {
  return Boolean(config.accountIssuer && config.accountClientId && config.accountClientSecret && config.accountRedirectUri)
}

export function platformConfigured(config: DaysConfig): boolean {
  return Boolean(config.platformBaseUrl && config.platformServiceToken)
}
