/**
 * A small but genuine OpenID Provider for the test suite.
 *
 * It signs real RS256 ID Tokens, publishes a real JWKS and enforces PKCE and
 * client authentication, so the tests exercise `openid-client`'s actual
 * signature / issuer / audience / expiry / nonce checks rather than stubs.
 *
 * This is a **mock**: passing tests prove 日事's Relying Party logic is
 * correct, not that the real account center behaves this way. See the
 * cross-repository checklist in docs/authentication.md.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose'

export interface IdTokenOverrides {
  iss?: string
  aud?: string
  sub?: string | null
  nonce?: string | null
  expiresInSeconds?: number
  issuedAtSkewSeconds?: number
  name?: string | null
  email?: string | null
  picture?: string | null
  /** Sign with a key that is absent from the published JWKS. */
  signWithForeignKey?: boolean
}

interface AuthorizationCode {
  code: string
  nonce: string
  codeChallenge: string
  redirectUri: string
  scope: string
  overrides: IdTokenOverrides
  used: boolean
}

export interface MockProviderOptions {
  clientId?: string
  clientSecret?: string
  /** Omit the revocation endpoint to exercise the "unsupported" path. */
  advertiseRevocation?: boolean
  advertiseUserInfo?: boolean
}

export class MockAccountCenter {
  private server: Server | null = null
  private signingKey!: CryptoKey
  private foreignKey!: CryptoKey
  private publicJwk!: JWK
  private readonly codes = new Map<string, AuthorizationCode>()
  private readonly refreshTokens = new Map<string, { sub: string; scope: string }>()

  readonly clientId: string
  readonly clientSecret: string
  private readonly advertiseRevocation: boolean
  private readonly advertiseUserInfo: boolean

  /** Requests the provider received, for assertions about the wire format. */
  readonly tokenRequests: URLSearchParams[] = []
  readonly revocationRequests: URLSearchParams[] = []
  userInfoClaims: Record<string, unknown> = {}

  issuer = ''

  constructor(options: MockProviderOptions = {}) {
    this.clientId = options.clientId ?? 'rishi'
    this.clientSecret = options.clientSecret ?? 'test-client-secret-value'
    this.advertiseRevocation = options.advertiseRevocation ?? true
    this.advertiseUserInfo = options.advertiseUserInfo ?? true
  }

  /** `port` defaults to 0 so the test suite gets an ephemeral port. */
  async start(port = 0): Promise<string> {
    const signing = await generateKeyPair('RS256', { extractable: true })
    const foreign = await generateKeyPair('RS256', { extractable: true })
    this.signingKey = signing.privateKey
    this.foreignKey = foreign.privateKey
    this.publicJwk = { ...(await exportJWK(signing.publicKey)), kid: 'mock-signing-key', alg: 'RS256', use: 'sig' }

    this.server = createServer((req, res) => {
      void this.handle(req, res).catch(() => {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'server_error' }))
      })
    })

    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve))
    const address = this.server.address() as AddressInfo
    this.issuer = `http://127.0.0.1:${address.port}`
    return this.issuer
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    )
    this.server = null
  }

  /**
   * Registers an authorization code the way a real provider would after the
   * user consented. Tests call this between `/login` and `/callback`.
   */
  issueAuthorizationCode(input: {
    nonce: string
    codeChallenge: string
    redirectUri: string
    scope?: string
    overrides?: IdTokenOverrides
  }): string {
    const code = `code_${randomUUID()}`
    this.codes.set(code, {
      code,
      nonce: input.nonce,
      codeChallenge: input.codeChallenge,
      redirectUri: input.redirectUri,
      scope: input.scope ?? 'openid profile email',
      overrides: input.overrides ?? {},
      used: false,
    })
    return code
  }

  knownRefreshToken(token: string): boolean {
    return this.refreshTokens.has(token)
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.issuer)

    if (url.pathname === '/.well-known/openid-configuration') {
      return this.json(res, 200, this.discoveryDocument())
    }
    if (url.pathname === '/.well-known/jwks.json') {
      return this.json(res, 200, { keys: [this.publicJwk] })
    }
    if (url.pathname === '/api/oauth/authorize') {
      return this.authorize(url, res)
    }
    if (url.pathname === '/api/oauth/token' && req.method === 'POST') {
      return this.token(req, res)
    }
    if (url.pathname === '/api/oauth/userinfo') {
      return this.json(res, 200, this.userInfoClaims)
    }
    if (url.pathname === '/api/oauth/revoke' && req.method === 'POST') {
      const body = new URLSearchParams(await readBody(req))
      this.revocationRequests.push(body)
      this.refreshTokens.delete(body.get('token') ?? '')
      return this.json(res, 200, {})
    }
    return this.json(res, 404, { error: 'not_found' })
  }

  /**
   * A consent screen good enough to click through by hand.
   *
   * The automated tests skip this and call `issueAuthorizationCode` directly;
   * it exists so the whole stack — SPA, BFF, provider — can be walked in a
   * real browser during local development.
   */
  private authorize(url: URL, res: ServerResponse): void {
    const redirectUri = url.searchParams.get('redirect_uri') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const nonce = url.searchParams.get('nonce') ?? ''
    const codeChallenge = url.searchParams.get('code_challenge') ?? ''

    if (url.searchParams.get('approve') === '1') {
      const code = this.issueAuthorizationCode({
        nonce,
        codeChallenge,
        redirectUri,
        scope: url.searchParams.get('scope') ?? 'openid profile email',
      })
      const target = new URL(redirectUri)
      target.searchParams.set('code', code)
      target.searchParams.set('state', state)
      res.writeHead(302, { location: target.href })
      res.end()
      return
    }

    const approve = new URL(url.href)
    approve.searchParams.set('approve', '1')
    const deny = new URL(redirectUri)
    deny.searchParams.set('error', 'access_denied')
    deny.searchParams.set('state', state)

    const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>统一账号中心（本地模拟）</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,'PingFang SC',sans-serif;background:#f5f6fb;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;padding:36px 40px;border-radius:18px;box-shadow:0 18px 44px rgba(20,20,60,.12);max-width:420px}
h1{font-size:19px;margin:0 0 6px}p{color:#667;font-size:14px;line-height:1.7}
.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:10px 12px;border-radius:10px;font-size:13px}
a{display:inline-block;margin-top:18px;padding:11px 20px;border-radius:10px;text-decoration:none;font-size:14px}
.ok{background:#2563eb;color:#fff}.no{color:#667}</style></head><body><div class="card">
<h1>统一账号中心</h1>
<p class="warn">本地模拟 Provider，不是真实的 account.yydsxwh.com。</p>
<p>「颗秒日事」请求获取你的账号标识与基础资料。</p>
<a class="ok" href="${escapeHtml(approve.href)}">同意并登录</a>
<a class="no" href="${escapeHtml(deny.href)}">取消</a>
</div></body></html>`

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page)
  }

  private discoveryDocument(): Record<string, unknown> {
    const document: Record<string, unknown> = {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/api/oauth/authorize`,
      token_endpoint: `${this.issuer}/api/oauth/token`,
      jwks_uri: `${this.issuer}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      claims_supported: ['sub', 'name', 'email', 'picture'],
    }
    if (this.advertiseUserInfo) document.userinfo_endpoint = `${this.issuer}/api/oauth/userinfo`
    if (this.advertiseRevocation) document.revocation_endpoint = `${this.issuer}/api/oauth/revoke`
    return document
  }

  private async token(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = new URLSearchParams(await readBody(req))
    this.tokenRequests.push(body)

    const authorization = req.headers.authorization
    const basic = typeof authorization === 'string' && authorization.startsWith('Basic ')
    const clientId = basic ? decodeBasic(authorization).id : body.get('client_id')
    const clientSecret = basic ? decodeBasic(authorization).secret : body.get('client_secret')
    if (clientId !== this.clientId || clientSecret !== this.clientSecret) {
      return this.json(res, 401, { error: 'invalid_client' })
    }

    const grantType = body.get('grant_type')
    if (grantType === 'refresh_token') return this.refresh(res, body)
    if (grantType !== 'authorization_code') return this.json(res, 400, { error: 'unsupported_grant_type' })

    const record = this.codes.get(body.get('code') ?? '')
    if (!record) return this.json(res, 400, { error: 'invalid_grant' })
    if (record.used) {
      // Authorization codes are single use; replay must fail.
      return this.json(res, 400, { error: 'invalid_grant' })
    }

    const verifier = body.get('code_verifier') ?? ''
    if (pkceChallenge(verifier) !== record.codeChallenge) {
      return this.json(res, 400, { error: 'invalid_grant' })
    }
    if (body.get('redirect_uri') !== record.redirectUri) {
      return this.json(res, 400, { error: 'invalid_grant' })
    }

    record.used = true
    const overrides = record.overrides
    const subject = overrides.sub === undefined ? 'usr_VJQ4V0D7H5W0JYKEGSR7VQ670V' : overrides.sub
    const idToken = await this.signIdToken(subject, record.nonce, overrides)

    const payload: Record<string, unknown> = {
      access_token: `at_${randomUUID()}`,
      token_type: 'Bearer',
      expires_in: 300,
      scope: record.scope,
      id_token: idToken,
    }

    if (record.scope.split(' ').includes('offline_access') && subject !== null) {
      const refreshToken = `rt_${randomUUID()}`
      this.refreshTokens.set(refreshToken, { sub: subject, scope: record.scope })
      payload.refresh_token = refreshToken
    }

    return this.json(res, 200, payload)
  }

  private refresh(res: ServerResponse, body: URLSearchParams): void {
    const presented = body.get('refresh_token') ?? ''
    const grant = this.refreshTokens.get(presented)
    if (!grant) return this.json(res, 400, { error: 'invalid_grant' })

    // Rotation: the presented token dies and a new one takes its place.
    this.refreshTokens.delete(presented)
    const rotated = `rt_${randomUUID()}`
    this.refreshTokens.set(rotated, grant)

    return this.json(res, 200, {
      access_token: `at_${randomUUID()}`,
      token_type: 'Bearer',
      expires_in: 300,
      scope: grant.scope,
      refresh_token: rotated,
    })
  }

  private async signIdToken(
    subject: string | null,
    nonce: string,
    overrides: IdTokenOverrides,
  ): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const issuedAt = nowSeconds - (overrides.issuedAtSkewSeconds ?? 0)
    const expiresAt = nowSeconds + (overrides.expiresInSeconds ?? 300)

    const claims: Record<string, unknown> = {
      iss: overrides.iss ?? this.issuer,
      aud: overrides.aud ?? this.clientId,
      iat: issuedAt,
      exp: expiresAt,
    }
    if (subject !== null) claims.sub = subject
    const effectiveNonce = overrides.nonce === undefined ? nonce : overrides.nonce
    if (effectiveNonce !== null) claims.nonce = effectiveNonce
    if (overrides.name !== null) claims.name = overrides.name ?? '林小柚'
    if (overrides.email !== null) claims.email = overrides.email ?? 'xiaoyou@example.com'
    if (overrides.picture !== null && overrides.picture !== undefined) claims.picture = overrides.picture

    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'mock-signing-key', typ: 'JWT' })
      .sign(overrides.signWithForeignKey ? this.foreignKey : this.signingKey)
  }

  private json(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload)
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
    res.end(body)
  }
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function decodeBasic(header: string): { id: string; secret: string } {
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  return {
    id: decodeURIComponent(decoded.slice(0, separator)),
    secret: decodeURIComponent(decoded.slice(separator + 1)),
  }
}
