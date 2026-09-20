/**
 * Unit coverage for the pieces that guard the edges: configuration refusal,
 * log redaction, redirect sanitising and payload limits.
 */
import { describe, expect, test } from 'vitest'
import { ConfigError, describeConfig, loadConfig } from '../config.js'
import { createLogger, sanitize } from '../logger.js'
import { sanitizeReturnTo } from '../http/security.js'
import { openSecret, sealSecret, hashToken, randomToken, safeEquals } from '../crypto.js'
import { buildTodo, sanitizeDocument } from '../data/store.js'

const productionEnv = {
  NODE_ENV: 'production',
  ACCOUNT_ISSUER: 'https://account.yydsxwh.com',
  ACCOUNT_CLIENT_ID: 'rishi',
  ACCOUNT_CLIENT_SECRET: 'a-real-production-client-secret',
  ACCOUNT_REDIRECT_URI: 'https://rishi.yydsxwh.com/api/auth/callback',
  RISHI_SESSION_SECRET: 'a-production-session-secret-at-least-32-chars',
  RISHI_APP_ORIGIN: 'https://rishi.yydsxwh.com',
}

describe('configuration', () => {
  test('accepts a complete production configuration', () => {
    const config = loadConfig(productionEnv)
    expect(config.isProduction).toBe(true)
    expect(config.session.cookieSecure).toBe(true)
    expect(config.account.verifyIdTokenSignature).toBe(true)
    expect(config.storeRefreshTokens).toBe(false)
  })

  test('refuses to boot production without a client secret', () => {
    expect(() => loadConfig({ ...productionEnv, ACCOUNT_CLIENT_SECRET: undefined })).toThrow(ConfigError)
  })

  test('refuses to boot production without a session secret', () => {
    expect(() => loadConfig({ ...productionEnv, RISHI_SESSION_SECRET: undefined })).toThrow(ConfigError)
  })

  test('refuses a short session secret in production', () => {
    expect(() => loadConfig({ ...productionEnv, RISHI_SESSION_SECRET: 'too-short' })).toThrow(ConfigError)
  })

  test('refuses to share one secret between 日事 and the account center', () => {
    const shared = 'the-same-secret-used-in-both-places-oops'
    expect(() =>
      loadConfig({ ...productionEnv, ACCOUNT_CLIENT_SECRET: shared, RISHI_SESSION_SECRET: shared }),
    ).toThrow(/must differ/i)
  })

  test('refuses plaintext HTTP to the account center in production', () => {
    expect(() => loadConfig({ ...productionEnv, ACCOUNT_ALLOW_INSECURE_HTTP: '1' })).toThrow(ConfigError)
    expect(() => loadConfig({ ...productionEnv, ACCOUNT_ISSUER: 'http://account.yydsxwh.com' })).toThrow(
      ConfigError,
    )
  })

  test('refuses an insecure session cookie in production', () => {
    expect(() => loadConfig({ ...productionEnv, RISHI_SESSION_COOKIE_SECURE: 'false' })).toThrow(ConfigError)
  })

  test('requires offline_access before refresh tokens may be stored', () => {
    expect(() => loadConfig({ ...productionEnv, RISHI_STORE_REFRESH_TOKENS: 'true' })).toThrow(
      /offline_access/,
    )
    const config = loadConfig({
      ...productionEnv,
      RISHI_STORE_REFRESH_TOKENS: 'true',
      ACCOUNT_SCOPES: 'openid profile email offline_access',
    })
    expect(config.storeRefreshTokens).toBe(true)
  })

  test('requires the openid scope', () => {
    expect(() => loadConfig({ ...productionEnv, ACCOUNT_SCOPES: 'profile email' })).toThrow(/openid/)
  })

  test('describeConfig leaks no credentials', () => {
    const described = JSON.stringify(describeConfig(loadConfig(productionEnv)))
    expect(described).not.toContain('a-real-production-client-secret')
    expect(described).not.toContain('a-production-session-secret-at-least-32-chars')
    expect(described).toContain('"clientSecretConfigured":true')
  })
})

describe('log redaction', () => {
  test('drops values under credential-shaped keys', () => {
    const redacted = sanitize({
      access_token: 'at_secret',
      refresh_token: 'rt_secret',
      id_token: 'header.payload.signature',
      client_secret: 'shhh',
      code: 'authorization-code',
      code_verifier: 'verifier',
      state: 'abc',
      nonce: 'def',
      cookie: 'rishi_sid=abc',
      authorization: 'Bearer abc',
      userId: 'user-1',
    })

    expect(Object.values(redacted)).not.toContain('at_secret')
    expect(Object.values(redacted)).not.toContain('rt_secret')
    expect(redacted.client_secret).toBe('[redacted]')
    expect(redacted.code).toBe('[redacted]')
    expect(redacted.cookie).toBe('[redacted]')
    expect(redacted.authorization).toBe('[redacted]')
    expect(redacted.userId).toBe('user-1')
  })

  test('keeps flags and counters readable — a credential is never a boolean', () => {
    const redacted = sanitize({
      clientSecretConfigured: true,
      storeRefreshTokens: false,
      sessionCookieSecure: true,
      activeSessions: 3,
      // The cookie's name is not its value.
      sessionCookieName: 'rishi_sid',
    })

    expect(redacted.clientSecretConfigured).toBe(true)
    expect(redacted.storeRefreshTokens).toBe(false)
    expect(redacted.sessionCookieSecure).toBe(true)
    expect(redacted.activeSessions).toBe(3)
    expect(redacted.sessionCookieName).toBe('rishi_sid')
  })

  test('still redacts a credential-shaped string under those same keys', () => {
    const redacted = sanitize({ clientSecretConfigured: 'the-actual-secret' })
    expect(redacted.clientSecretConfigured).toBe('[redacted]')
  })

  test('redacts a JWT even when the key looks harmless', () => {
    const jwt =
      'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c3JfMTIzNDU2Nzg5MCJ9.c2lnbmF0dXJlLXZhbHVlLWhlcmU'
    expect(sanitize({ detail: jwt }).detail).toBe('[redacted]')
  })

  test('redacts nested credentials too', () => {
    const redacted = sanitize({ outer: { inner: { refresh_token: 'rt_nested' } } }) as {
      outer: { inner: { refresh_token: string } }
    }
    expect(redacted.outer.inner.refresh_token).toBe('[redacted]')
  })

  test('an emitted line never contains a token', () => {
    const lines: string[] = []
    const logger = createLogger({ level: 'debug', sink: (line) => lines.push(line) })
    logger.info('auth.test', { access_token: 'at_leak', userId: 'user-1' })

    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('at_leak')
    expect(lines[0]).toContain('user-1')
  })

  test('truncates oversized strings instead of dumping them', () => {
    const long = 'x'.repeat(5000)
    expect(String(sanitize({ note: long }).note).length).toBeLessThan(400)
  })
})

describe('returnTo sanitising', () => {
  const fallback = '/'

  test.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example',
    'javascript:alert(1)',
    'http://127.0.0.1:1/other',
    '',
    '   ',
  ])('rejects %j', (value) => {
    expect(sanitizeReturnTo(value, fallback)).toBe(fallback)
  })

  test.each([
    ['/todos', '/todos'],
    ['/#schedule', '/#schedule'],
    ['/products/days/?tab=1', '/products/days/?tab=1'],
  ])('keeps the relative path %j', (input, expected) => {
    expect(sanitizeReturnTo(input, fallback)).toBe(expected)
  })

  test('rejects non-strings and control characters', () => {
    expect(sanitizeReturnTo(undefined, fallback)).toBe(fallback)
    expect(sanitizeReturnTo(42, fallback)).toBe(fallback)
    expect(sanitizeReturnTo('/bad\npath', fallback)).toBe(fallback)
  })
})

describe('crypto helpers', () => {
  test('a session token is never stored in the clear', () => {
    const token = randomToken()
    const digest = hashToken(token)
    expect(digest).toHaveLength(64)
    expect(digest).not.toContain(token)
    expect(hashToken(token)).toBe(digest)
  })

  test('sealed secrets round-trip and fail closed on tampering', () => {
    const secret = 'a-session-secret-long-enough-for-hkdf'
    const sealed = sealSecret('rt_super_secret', secret)
    expect(sealed.ciphertext).not.toContain('rt_super_secret')
    expect(openSecret(sealed, secret)).toBe('rt_super_secret')

    expect(openSecret(sealed, 'a-different-session-secret-entirely')).toBeNull()
    expect(openSecret({ ...sealed, tag: Buffer.from('0'.repeat(16)).toString('base64') }, secret)).toBeNull()
  })

  test('safeEquals compares without leaking length-independent timing', () => {
    expect(safeEquals('abc', 'abc')).toBe(true)
    expect(safeEquals('abc', 'abd')).toBe(false)
    expect(safeEquals('abc', 'abcd')).toBe(false)
  })
})

describe('payload sanitising', () => {
  test('strips identity fields at every level', () => {
    const sanitized = sanitizeDocument({
      userId: 'someone-else',
      sub: 'usr_ATTACKER',
      todos: [{ id: 't1', title: '写作业', accountUserId: 'usr_ATTACKER' }],
      reminderSettings: { enabled: true },
    })

    expect(sanitized).not.toHaveProperty('userId')
    expect(sanitized).not.toHaveProperty('sub')
    expect(sanitized.todos).toEqual([{ id: 't1', title: '写作业' }])
    // Unknown keys stay untouched: the server has no reason to gate features.
    expect(sanitized.reminderSettings).toEqual({ enabled: true })
  })

  test('refuses a non-object document and a non-array collection', () => {
    // The thrown message is the user-facing one; the stable contract is the code.
    expect(() => sanitizeDocument('nope')).toThrow(
      expect.objectContaining({ code: 'invalid_payload', status: 400 }),
    )
    expect(() => sanitizeDocument({ todos: { id: 'x' } })).toThrow(
      expect.objectContaining({ code: 'invalid_payload' }),
    )
  })

  test('the server owns todo ids and timestamps', () => {
    const todo = buildTodo({ title: '  复习英语  ', id: 'client-chosen', createdAt: 0, priority: 'high' })
    expect(todo.id).not.toBe('client-chosen')
    expect(todo.title).toBe('复习英语')
    expect(todo.priority).toBe('high')
    expect(todo.createdAt).toBeGreaterThan(0)
  })

  test('rejects an empty or oversized title', () => {
    expect(() => buildTodo({ title: '   ' })).toThrow()
    expect(() => buildTodo({ title: 'x'.repeat(501) })).toThrow()
  })

  test('falls back to a safe priority instead of trusting input', () => {
    expect(buildTodo({ title: 'a', priority: 'urgent' }).priority).toBe('medium')
  })
})
