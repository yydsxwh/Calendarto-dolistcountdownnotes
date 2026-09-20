/**
 * Refresh-token handling.
 *
 * 日事 does not request `offline_access` by default — it only needs an
 * identity at login — so the default path is "no token, nothing to protect".
 * These tests cover both that default and the opt-in path: encrypted at rest,
 * rotated on every use, and dropped for good when the grant is revoked.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHarness, type Harness } from './harness.js'
import { refreshAccountTokens, revokeRefreshToken } from '../auth/tokens.js'
import { silentLogger } from '../logger.js'

describe('default configuration', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })
  afterEach(async () => {
    await harness.close()
  })

  test('does not ask for offline_access', async () => {
    const authorization = await harness.startAuthorization()
    expect(authorization.authorizationUrl.searchParams.get('scope')).toBe('openid profile email')
  })

  test('stores nothing even if the provider volunteers a refresh token', async () => {
    await harness.login({ scope: 'openid profile email offline_access' })
    const stored = harness.context.db.prepare('SELECT COUNT(*) AS total FROM account_token').get() as {
      total: number
    }
    expect(stored.total).toBe(0)

    const session = (await (await harness.client().get('/api/auth/session')).json()) as {
      accountLinked?: boolean
    }
    expect(session.accountLinked ?? false).toBe(false)
  })
})

describe('with offline_access enabled', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness({
      env: {
        ACCOUNT_SCOPES: 'openid profile email offline_access',
        RISHI_STORE_REFRESH_TOKENS: 'true',
      },
    })
  })
  afterEach(async () => {
    await harness.close()
  })

  async function loginAndGetUserId(): Promise<string> {
    await harness.login({ scope: 'openid profile email offline_access' })
    const row = harness.context.db.prepare('SELECT id FROM rishi_user').get() as { id: string }
    return row.id
  }

  test('persists the refresh token only as ciphertext', async () => {
    const userId = await loginAndGetUserId()

    const row = harness.context.db
      .prepare('SELECT refresh_token_ciphertext, refresh_token_iv, refresh_token_tag FROM account_token WHERE user_id = ?')
      .get(userId) as { refresh_token_ciphertext: string; refresh_token_iv: string; refresh_token_tag: string }

    expect(row.refresh_token_ciphertext).toBeTruthy()
    expect(row.refresh_token_iv).toBeTruthy()
    expect(row.refresh_token_tag).toBeTruthy()

    const plaintext = harness.context.refreshTokens.reveal(userId) as string
    expect(plaintext.startsWith('rt_')).toBe(true)
    expect(row.refresh_token_ciphertext).not.toContain(plaintext)
  })

  test('never exposes the refresh token to the client', async () => {
    const result = await harness.login({ scope: 'openid profile email offline_access' })
    const userId = (harness.context.db.prepare('SELECT id FROM rishi_user').get() as { id: string }).id
    const plaintext = harness.context.refreshTokens.reveal(userId) as string

    const cookies = result.callback.headers.getSetCookie().join(' ')
    expect(cookies).not.toContain(plaintext)

    const sessionBody = await (await result.client.get('/api/auth/session')).text()
    expect(sessionBody).not.toContain(plaintext)
    expect(sessionBody).not.toContain('refresh_token')
  })

  test('rotates the stored token and retires the old one', async () => {
    const userId = await loginAndGetUserId()
    const original = harness.context.refreshTokens.reveal(userId) as string

    const outcome = await refreshAccountTokens(
      harness.context.account,
      harness.context.refreshTokens,
      userId,
      silentLogger,
    )

    expect(outcome.rotated).toBe(true)
    expect(outcome.accessToken.startsWith('at_')).toBe(true)

    const rotated = harness.context.refreshTokens.reveal(userId) as string
    expect(rotated).not.toBe(original)
    expect(harness.provider.knownRefreshToken(rotated)).toBe(true)
    expect(harness.provider.knownRefreshToken(original)).toBe(false)
  })

  test('the retired token stops working at the provider', async () => {
    const userId = await loginAndGetUserId()
    const original = harness.context.refreshTokens.reveal(userId) as string

    await refreshAccountTokens(harness.context.account, harness.context.refreshTokens, userId, silentLogger)

    // Put the superseded token back and confirm the provider refuses it.
    harness.context.refreshTokens.save(userId, original, 'openid profile email offline_access')
    await expect(
      refreshAccountTokens(harness.context.account, harness.context.refreshTokens, userId, silentLogger),
    ).rejects.toMatchObject({ code: 'account_link_expired' })
  })

  test('drops the token when the grant is gone and asks for re-authentication', async () => {
    const userId = await loginAndGetUserId()
    harness.context.refreshTokens.save(userId, 'rt_not_a_real_grant', 'openid')

    await expect(
      refreshAccountTokens(harness.context.account, harness.context.refreshTokens, userId, silentLogger),
    ).rejects.toMatchObject({ code: 'account_link_expired', status: 401 })

    // Nothing unusable is left behind to be retried forever.
    expect(harness.context.refreshTokens.has(userId)).toBe(false)
  })

  test('reports a missing token as a link problem, not a crash', async () => {
    const userId = await loginAndGetUserId()
    harness.context.refreshTokens.discard(userId)

    await expect(
      refreshAccountTokens(harness.context.account, harness.context.refreshTokens, userId, silentLogger),
    ).rejects.toMatchObject({ code: 'account_link_expired' })
  })

  test('logout revokes the grant through RFC 7009 and forgets it locally', async () => {
    const result = await harness.login({ scope: 'openid profile email offline_access' })
    const userId = (harness.context.db.prepare('SELECT id FROM rishi_user').get() as { id: string }).id
    const stored = harness.context.refreshTokens.reveal(userId) as string

    expect((await result.client.post('/api/auth/logout')).status).toBe(204)

    const revocation = harness.provider.revocationRequests.at(-1)
    expect(revocation?.get('token')).toBe(stored)
    expect(revocation?.get('token_type_hint')).toBe('refresh_token')
    expect(harness.context.refreshTokens.has(userId)).toBe(false)
  })

  test('logout still succeeds when the account center is unreachable', async () => {
    const result = await harness.login({ scope: 'openid profile email offline_access' })
    const userId = (harness.context.db.prepare('SELECT id FROM rishi_user').get() as { id: string }).id
    await harness.provider.stop()

    expect((await result.client.post('/api/auth/logout')).status).toBe(204)
    expect(harness.context.refreshTokens.has(userId)).toBe(false)
    expect((await result.client.get('/api/sync')).status).toBe(401)
  })

  test('revocation reports false rather than throwing when nothing is stored', async () => {
    const userId = await loginAndGetUserId()
    harness.context.refreshTokens.discard(userId)

    await expect(
      revokeRefreshToken(harness.context.account, harness.context.refreshTokens, userId, silentLogger),
    ).resolves.toBe(false)
  })
})

describe('account outage', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })
  afterEach(async () => {
    await harness.close()
  })

  test('an existing session survives the account center going away', async () => {
    const result = await harness.login()
    await harness.provider.stop()

    // 日事's own session is 日事's to honour; an account outage must not
    // silently sign everybody out.
    expect((await result.client.get('/api/sync')).status).toBe(200)
    const session = (await (await result.client.get('/api/auth/session')).json()) as {
      authenticated: boolean
    }
    expect(session.authenticated).toBe(true)
  })

  test('a warm discovery cache keeps the login redirect working', async () => {
    await harness.login()
    await harness.provider.stop()

    // Metadata is cached, so we still build a valid authorization request
    // instead of turning a blip into an outage of our own.
    const response = await harness.client().get('/api/auth/login')
    expect(response.status).toBe(302)
  })

  test('a token exchange against a dead account center fails cleanly', async () => {
    const authorization = await harness.startAuthorization()
    const code = harness.provider.issueAuthorizationCode({
      nonce: authorization.nonce,
      codeChallenge: authorization.codeChallenge,
      redirectUri: harness.redirectUri,
    })
    await harness.provider.stop()

    const callback = await authorization.client.get(
      `/api/auth/callback?code=${code}&state=${authorization.state}`,
    )
    expect(callback.status).toBe(302)
    expect(new URL(callback.headers.get('location') ?? '').searchParams.get('auth_error')).toBe(
      'account_unavailable',
    )
  })
})
