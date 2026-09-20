/**
 * Authorization Code + PKCE flow, and every validation that must reject a
 * login. Exercised against the mock provider in `oidc-provider-mock.ts`:
 * green here means the Relying Party logic is correct, not that the real
 * account center agrees. See docs/authentication.md.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { authErrorOf, createHarness, type Harness } from './harness.js'
import { pkceChallenge } from './oidc-provider-mock.js'

let harness: Harness

beforeEach(async () => {
  harness = await createHarness()
})

afterEach(async () => {
  await harness.close()
})

describe('authorization request', () => {
  test('sends a standards-compliant Authorization Code + PKCE request', async () => {
    const authorization = await harness.startAuthorization('/todos')
    const query = authorization.authorizationUrl.searchParams

    expect(authorization.authorizationUrl.origin).toBe(harness.provider.issuer)
    expect(authorization.authorizationUrl.pathname).toBe('/api/oauth/authorize')
    expect(query.get('response_type')).toBe('code')
    expect(query.get('client_id')).toBe(harness.provider.clientId)
    expect(query.get('redirect_uri')).toBe(harness.redirectUri)
    expect(query.get('scope')).toBe('openid profile email')
    expect(query.get('code_challenge_method')).toBe('S256')
    expect(authorization.state.length).toBeGreaterThan(16)
    expect(authorization.nonce.length).toBeGreaterThan(16)
    expect(authorization.codeChallenge.length).toBeGreaterThan(16)
  })

  test('keeps state, nonce and the code verifier off the client', async () => {
    const authorization = await harness.startAuthorization('/todos')
    // The browser only ever holds an opaque transaction pointer.
    expect(authorization.client.cookies.get('rishi_authtx')).toBe(authorization.state)
    expect(authorization.client.cookies.get('rishi_sid')).toBeUndefined()

    const setCookie = authorization.response.headers.getSetCookie().join(' ')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).not.toContain(authorization.nonce)
  })

  test('refuses an off-site returnTo instead of becoming an open redirect', async () => {
    const authorization = await harness.startAuthorization('https://evil.example/steal')
    const code = harness.provider.issueAuthorizationCode({
      nonce: authorization.nonce,
      codeChallenge: authorization.codeChallenge,
      redirectUri: harness.redirectUri,
    })
    const callback = await authorization.client.get(
      `/api/auth/callback?code=${code}&state=${authorization.state}`,
    )
    expect(callback.status).toBe(302)
    expect(new URL(callback.headers.get('location') ?? '').origin).toBe(harness.origin)
  })
})

describe('callback success path', () => {
  test('completes login and issues a 日事 session cookie', async () => {
    const result = await harness.login({ returnTo: '/todos' })

    expect(result.callback.status).toBe(302)
    expect(new URL(result.location).pathname).toBe('/todos')
    expect(authErrorOf(result.location)).toBeNull()

    const sessionCookie = result.callback.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('rishi_sid='))
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie).toContain('HttpOnly')
    expect(sessionCookie).toContain('SameSite=Lax')
    expect(sessionCookie).toContain('Path=/')

    const session = await result.client.get('/api/auth/session')
    const body = (await session.json()) as { authenticated: boolean; user: { accountUserId: string } }
    expect(body.authenticated).toBe(true)
    expect(body.user.accountUserId).toBe('usr_VJQ4V0D7H5W0JYKEGSR7VQ670V')
  })

  test('never hands an account-center token to the client', async () => {
    const result = await harness.login()
    const cookieHeader = result.callback.headers.getSetCookie().join(' ')
    expect(cookieHeader).not.toMatch(/at_/)
    expect(cookieHeader).not.toMatch(/rt_/)
    expect(cookieHeader).not.toMatch(/eyJ/) // no JWT in a cookie

    const session = await result.client.get('/api/auth/session')
    const raw = await session.text()
    expect(raw).not.toMatch(/access_token|id_token|refresh_token/)
  })

  test('rotates to a brand-new session token, defeating session fixation', async () => {
    const client = harness.client()
    client.cookies.set('rishi_sid', 'attacker-planted-session-token')

    const result = await harness.login({ client })
    const issued = client.cookies.get('rishi_sid')

    expect(issued).toBeDefined()
    expect(issued).not.toBe('attacker-planted-session-token')
    expect(result.callback.status).toBe(302)
  })
})

describe('PKCE', () => {
  test('presents a verifier that matches the advertised S256 challenge', async () => {
    const result = await harness.login()
    expect(result.callback.status).toBe(302)

    const tokenRequest = harness.provider.tokenRequests.at(-1)
    const verifier = tokenRequest?.get('code_verifier')
    expect(verifier).toBeDefined()
    expect(pkceChallenge(verifier as string)).toBe(result.codeChallenge)
    expect(tokenRequest?.get('grant_type')).toBe('authorization_code')
    expect(tokenRequest?.get('redirect_uri')).toBe(harness.redirectUri)
  })

  test('fails the exchange when the code was bound to a different challenge', async () => {
    const authorization = await harness.startAuthorization()
    const code = harness.provider.issueAuthorizationCode({
      nonce: authorization.nonce,
      codeChallenge: pkceChallenge('a-verifier-this-client-never-used'),
      redirectUri: harness.redirectUri,
    })
    const callback = await authorization.client.get(
      `/api/auth/callback?code=${code}&state=${authorization.state}`,
    )
    expect(authErrorOf(callback.headers.get('location') ?? '')).toBe('token_exchange_failed')
    await expectNoSession(authorization.client)
  })
})

describe('state validation', () => {
  test('rejects a callback whose state does not match the transaction cookie', async () => {
    const authorization = await harness.startAuthorization()
    const code = harness.provider.issueAuthorizationCode({
      nonce: authorization.nonce,
      codeChallenge: authorization.codeChallenge,
      redirectUri: harness.redirectUri,
    })
    const callback = await authorization.client.get(`/api/auth/callback?code=${code}&state=tampered-state`)

    expect(authErrorOf(callback.headers.get('location') ?? '')).toBe('invalid_state')
    await expectNoSession(authorization.client)
  })

  test('rejects a callback from a browser that never started the login', async () => {
    const victim = await harness.startAuthorization()
    const code = harness.provider.issueAuthorizationCode({
      nonce: victim.nonce,
      codeChallenge: victim.codeChallenge,
      redirectUri: harness.redirectUri,
    })

    // Login CSRF: the attacker knows a valid state but the target browser
    // holds no matching transaction cookie.
    const bystander = harness.client()
    const callback = await bystander.get(`/api/auth/callback?code=${code}&state=${victim.state}`)

    expect(authErrorOf(callback.headers.get('location') ?? '')).toBe('invalid_state')
    await expectNoSession(bystander)
  })

  test('consumes the transaction so a replayed callback cannot log in twice', async () => {
    const result = await harness.login()
    expect(result.callback.status).toBe(302)

    const replay = await result.client.get(
      `/api/auth/callback?code=${result.code}&state=${result.state}`,
    )
    expect(authErrorOf(replay.headers.get('location') ?? '')).toBe('invalid_state')
  })

  test('rejects a replayed authorization code on a fresh transaction', async () => {
    const first = await harness.login()
    expect(first.callback.status).toBe(302)

    const second = await harness.startAuthorization()
    const callback = await second.client.get(
      `/api/auth/callback?code=${first.code}&state=${second.state}`,
    )
    expect(authErrorOf(callback.headers.get('location') ?? '')).toBe('token_exchange_failed')
    await expectNoSession(second.client)
  })
})

describe('ID token validation', () => {
  const cases: { name: string; overrides: Parameters<Harness['login']>[0] }[] = [
    { name: 'a foreign signing key', overrides: { overrides: { signWithForeignKey: true } } },
    { name: 'a mismatched issuer', overrides: { overrides: { iss: 'https://evil.example' } } },
    { name: 'a mismatched audience', overrides: { overrides: { aud: 'some-other-client' } } },
    { name: 'an expired token', overrides: { overrides: { expiresInSeconds: -600 } } },
    { name: 'a mismatched nonce', overrides: { overrides: { nonce: 'not-the-nonce-we-sent' } } },
    { name: 'a missing nonce', overrides: { overrides: { nonce: null } } },
  ]

  for (const { name, overrides } of cases) {
    test(`rejects ${name}`, async () => {
      const result = await harness.login(overrides)
      expect(result.callback.status).toBe(302)
      expect(authErrorOf(result.location)).toBe('id_token_invalid')
      await expectNoSession(result.client)
      expect(userCount(harness)).toBe(0)
    })
  }

  test('rejects an ID token without sub', async () => {
    const result = await harness.login({ overrides: { sub: null } })
    // `sub` is mandatory: either the library or our own guard must refuse it.
    expect(['id_token_invalid', 'missing_subject']).toContain(authErrorOf(result.location))
    await expectNoSession(result.client)
    expect(userCount(harness)).toBe(0)
  })

  test('accepts a valid token and stores the sub verbatim', async () => {
    const result = await harness.login({ overrides: { sub: 'usr_0000000000000000000000001' } })
    expect(authErrorOf(result.location)).toBeNull()
    const row = harness.context.db.prepare('SELECT account_user_id FROM rishi_user').get() as {
      account_user_id: string
    }
    expect(row.account_user_id).toBe('usr_0000000000000000000000001')
  })
})

describe('provider-side failures', () => {
  test('reports a user cancellation distinctly from a protocol failure', async () => {
    const authorization = await harness.startAuthorization()
    const callback = await authorization.client.get(
      `/api/auth/callback?error=access_denied&state=${authorization.state}`,
    )
    expect(authErrorOf(callback.headers.get('location') ?? '')).toBe('login_cancelled')
    await expectNoSession(authorization.client)
  })

  test('surfaces an unreachable account center without leaking internals', async () => {
    await harness.provider.stop()
    const response = await harness.client().get('/api/auth/login')
    expect(response.status).toBe(503)
    const body = (await response.json()) as { error: string; message: string }
    expect(body.error).toBe('account_unavailable')
    expect(body.message).not.toMatch(/ECONNREFUSED|stack|at /i)
    expect(Object.keys(body)).toEqual(['error', 'message'])
  })
})

describe('logout', () => {
  test('destroys the 日事 session and clears the cookie', async () => {
    const result = await harness.login()
    expect((await result.client.get('/api/sync')).status).toBe(200)

    const logout = await result.client.post('/api/auth/logout')
    expect(logout.status).toBe(204)
    expect(result.client.cookies.get('rishi_sid')).toBeUndefined()

    expect((await result.client.get('/api/sync')).status).toBe(401)
    const session = (await (await result.client.get('/api/auth/session')).json()) as {
      authenticated: boolean
    }
    expect(session.authenticated).toBe(false)
  })

  test('invalidates the token server-side, not only in the browser', async () => {
    const result = await harness.login()
    const token = result.client.cookies.get('rishi_sid') as string

    await result.client.post('/api/auth/logout')

    const replay = harness.client()
    replay.cookies.set('rishi_sid', token)
    expect((await replay.get('/api/sync')).status).toBe(401)
  })

  test('requires a session, and does not pretend to log the user out of account', async () => {
    expect((await harness.client().post('/api/auth/logout')).status).toBe(401)
  })
})

describe('session lifetime', () => {
  test('stops accepting a session once it has expired', async () => {
    const result = await harness.login()
    const token = result.client.cookies.get('rishi_sid') as string
    expect((await result.client.get('/api/sync')).status).toBe(200)

    harness.context.sessions.expireNow(token)

    expect((await result.client.get('/api/sync')).status).toBe(401)
    // The expired row is reaped rather than left to linger.
    expect(harness.context.sessions.read(token)).toBeNull()
  })

  test('an unknown token is simply not a session', async () => {
    const client = harness.client()
    client.cookies.set('rishi_sid', 'totally-made-up-token')
    expect((await client.get('/api/sync')).status).toBe(401)
  })
})

async function expectNoSession(client: { get: (path: string) => Promise<Response> }): Promise<void> {
  const response = await client.get('/api/auth/session')
  const body = (await response.json()) as { authenticated: boolean }
  expect(body.authenticated).toBe(false)
}

function userCount(harness: Harness): number {
  const row = harness.context.db.prepare('SELECT COUNT(*) AS total FROM rishi_user').get() as {
    total: number
  }
  return row.total
}
