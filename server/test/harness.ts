/**
 * Test harness: a real HTTP server, a real SQLite database (in memory) and a
 * real — if miniature — OpenID Provider, driven through `fetch` with a cookie
 * jar so cookie attributes and redirects behave as they would in a browser.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'
import { createApp } from '../app.js'
import { loadConfig, type ServerConfig } from '../config.js'
import { createContext, type AppContext } from '../context.js'
import { openDatabase } from '../db/index.js'
import { silentLogger } from '../logger.js'
import { MockAccountCenter, type IdTokenOverrides } from './oidc-provider-mock.js'

export async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())))
  return port
}

class CookieJar {
  private readonly jar = new Map<string, string>()

  absorb(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attributes] = raw.split(';')
      if (!pair) continue
      const separator = pair.indexOf('=')
      if (separator < 1) continue
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))
      if (expired || value.length === 0) this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }

  header(): string | undefined {
    if (this.jar.size === 0) return undefined
    return [...this.jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  get(name: string): string | undefined {
    return this.jar.get(name)
  }

  set(name: string, value: string): void {
    this.jar.set(name, value)
  }

  clear(): void {
    this.jar.clear()
  }
}

export interface TestClientOptions {
  headers?: Record<string, string>
  body?: unknown
  /** Omit the Origin header to simulate a non-browser caller. */
  origin?: string | null
}

export class TestClient {
  readonly cookies = new CookieJar()
  bearer: string | null = null

  constructor(
    private readonly baseUrl: string,
    private readonly defaultOrigin: string,
  ) {}

  async request(method: string, path: string, options: TestClientOptions = {}): Promise<Response> {
    const headers = new Headers(options.headers ?? {})
    const cookie = this.cookies.header()
    if (cookie) headers.set('cookie', cookie)
    if (this.bearer) headers.set('authorization', `Bearer ${this.bearer}`)

    const origin = options.origin === undefined ? this.defaultOrigin : options.origin
    if (origin !== null) headers.set('origin', origin)

    let body: string | undefined
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(options.body)
    }

    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers,
      body,
      redirect: 'manual',
    })
    this.cookies.absorb(response)
    return response
  }

  get(path: string, options?: TestClientOptions) {
    return this.request('GET', path, options)
  }
  post(path: string, options?: TestClientOptions) {
    return this.request('POST', path, options)
  }
  put(path: string, options?: TestClientOptions) {
    return this.request('PUT', path, options)
  }
  patch(path: string, options?: TestClientOptions) {
    return this.request('PATCH', path, options)
  }
  delete(path: string, options?: TestClientOptions) {
    return this.request('DELETE', path, options)
  }
}

export interface Harness {
  provider: MockAccountCenter
  context: AppContext
  config: ServerConfig
  app: Express
  origin: string
  redirectUri: string
  client(): TestClient
  login(options?: LoginOptions): Promise<LoginResult>
  startAuthorization(returnTo?: string, client?: TestClient, kind?: 'web' | 'native'): Promise<Authorization>
  close(): Promise<void>
}

export interface LoginOptions {
  client?: TestClient
  returnTo?: string
  overrides?: IdTokenOverrides
  scope?: string
  kind?: 'web' | 'native'
}

export interface Authorization {
  client: TestClient
  state: string
  nonce: string
  codeChallenge: string
  codeChallengeMethod: string | null
  authorizationUrl: URL
  response: Response
}

export interface LoginResult extends Authorization {
  code: string
  callback: Response
  location: string
}

export interface HarnessOptions {
  env?: Record<string, string | undefined>
  provider?: MockAccountCenter
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const provider = options.provider ?? new MockAccountCenter()
  const issuer = await provider.start()

  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const redirectUri = `${origin}/api/auth/callback`

  const config = loadConfig({
    NODE_ENV: 'test',
    PORT: String(port),
    RISHI_DATABASE_FILE: ':memory:',
    ACCOUNT_ISSUER: issuer,
    ACCOUNT_CLIENT_ID: provider.clientId,
    ACCOUNT_CLIENT_SECRET: provider.clientSecret,
    ACCOUNT_REDIRECT_URI: redirectUri,
    ACCOUNT_ALLOW_INSECURE_HTTP: '1',
    RISHI_SESSION_SECRET: 'test-session-secret-that-is-long-enough-1234567890',
    RISHI_APP_ORIGIN: origin,
    RISHI_SESSION_COOKIE_SECURE: 'false',
    ...options.env,
  })

  const db = openDatabase({ file: ':memory:' })
  const context = createContext({ config, logger: silentLogger, db })
  const app = createApp(context)

  const server: Server = await new Promise((resolve) => {
    const started = app.listen(port, '127.0.0.1', () => resolve(started))
  })

  const harness: Harness = {
    provider,
    context,
    config,
    app,
    origin,
    redirectUri,
    client: () => new TestClient(origin, origin),

    async startAuthorization(returnTo = '/', client = new TestClient(origin, origin), kind = 'web') {
      const query = new URLSearchParams({ returnTo })
      if (kind === 'native') query.set('client', 'native')
      const response = await client.get(`/api/auth/login?${query.toString()}`)
      const location = response.headers.get('location')
      if (response.status !== 302 || location === null) {
        throw new Error(`login did not redirect: ${response.status} ${await response.text()}`)
      }
      const authorizationUrl = new URL(location)
      return {
        client,
        state: authorizationUrl.searchParams.get('state') ?? '',
        nonce: authorizationUrl.searchParams.get('nonce') ?? '',
        codeChallenge: authorizationUrl.searchParams.get('code_challenge') ?? '',
        codeChallengeMethod: authorizationUrl.searchParams.get('code_challenge_method'),
        authorizationUrl,
        response,
      }
    },

    async login(loginOptions: LoginOptions = {}) {
      const authorization = await harness.startAuthorization(
        loginOptions.returnTo ?? '/',
        loginOptions.client ?? new TestClient(origin, origin),
        loginOptions.kind ?? 'web',
      )
      const code = provider.issueAuthorizationCode({
        nonce: authorization.nonce,
        codeChallenge: authorization.codeChallenge,
        redirectUri,
        scope: loginOptions.scope ?? 'openid profile email',
        overrides: loginOptions.overrides ?? {},
      })
      const callback = await authorization.client.get(
        `/api/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(authorization.state)}`,
      )
      return { ...authorization, code, callback, location: callback.headers.get('location') ?? '' }
    },

    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
      context.db.close()
      await provider.stop()
    },
  }

  return harness
}

/** Reads `auth_error` out of a callback redirect. */
export function authErrorOf(location: string): string | null {
  if (location.startsWith('com.')) {
    const query = location.slice(location.indexOf('?') + 1)
    return new URLSearchParams(query).get('auth_error')
  }
  try {
    return new URL(location).searchParams.get('auth_error')
  } catch {
    return null
  }
}
