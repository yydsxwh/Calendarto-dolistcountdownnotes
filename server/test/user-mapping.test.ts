/**
 * `sub` → RishiUser mapping.
 *
 * The account center's `sub` is the only identity key. Email, display name and
 * avatar are a cache: they may change, arrive late or never arrive at all, and
 * none of that may create a second local user.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { authErrorOf, createHarness, type Harness } from './harness.js'
import { findUserByAccountUserId, upsertUserFromClaims } from '../auth/users.js'

let harness: Harness

beforeEach(async () => {
  harness = await createHarness()
})

afterEach(async () => {
  await harness.close()
})

function users(): { id: string; account_user_id: string; email: string | null; display_name: string | null }[] {
  return harness.context.db
    .prepare('SELECT id, account_user_id, email, display_name FROM rishi_user ORDER BY created_at')
    .all() as { id: string; account_user_id: string; email: string | null; display_name: string | null }[]
}

describe('first login', () => {
  test('creates exactly one RishiUser keyed by sub', async () => {
    const result = await harness.login()
    expect(authErrorOf(result.location)).toBeNull()

    const rows = users()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.account_user_id).toBe('usr_VJQ4V0D7H5W0JYKEGSR7VQ670V')
    expect(rows[0]?.id).not.toBe(rows[0]?.account_user_id)
  })

  test('caches the profile claims it was given', async () => {
    await harness.login({ overrides: { name: '林小柚', email: 'xiaoyou@example.com', picture: 'https://cdn.example/a.png' } })
    const session = await harness.client().get('/api/auth/session')
    expect(session.status).toBe(200)

    const rows = users()
    expect(rows[0]?.display_name).toBe('林小柚')
    expect(rows[0]?.email).toBe('xiaoyou@example.com')
  })
})

describe('repeat logins', () => {
  test('reuses the same RishiUser on a second login', async () => {
    await harness.login()
    const firstId = users()[0]?.id

    await harness.login({ client: harness.client() })

    const rows = users()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(firstId)
  })

  test('a changed email updates the cache instead of forking the account', async () => {
    await harness.login({ overrides: { email: 'old@example.com' } })
    const firstId = users()[0]?.id

    await harness.login({ client: harness.client(), overrides: { email: 'new@example.com' } })

    const rows = users()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(firstId)
    expect(rows[0]?.email).toBe('new@example.com')
  })

  test('a changed display name does not fork the account either', async () => {
    await harness.login({ overrides: { name: '旧昵称' } })
    await harness.login({ client: harness.client(), overrides: { name: '新昵称' } })

    const rows = users()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.display_name).toBe('新昵称')
  })

  test('two different subs are two different users, even with one shared email', async () => {
    await harness.login({ overrides: { sub: 'usr_AAAA', email: 'shared@example.com' } })
    await harness.login({
      client: harness.client(),
      overrides: { sub: 'usr_BBBB', email: 'shared@example.com' },
    })

    const rows = users()
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.account_user_id))).toEqual(new Set(['usr_AAAA', 'usr_BBBB']))
  })

  test('the user keeps their data across logins', async () => {
    const first = await harness.login()
    await first.client.put('/api/sync', { body: { baseVersion: 0, data: { todos: [{ id: 't1', title: '复习' }] } } })

    const second = await harness.login({ client: harness.client() })
    const document = (await (await second.client.get('/api/sync')).json()) as {
      data: { todos: { id: string }[] }
    }
    expect(document.data.todos.map((todo) => todo.id)).toEqual(['t1'])
  })
})

describe('missing profile claims', () => {
  test('logs in when name, email and picture are all absent', async () => {
    const provider = harness.provider
    provider.userInfoClaims = {}
    const result = await harness.login({ overrides: { name: null, email: null, picture: null } })

    expect(authErrorOf(result.location)).toBeNull()
    const rows = users()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.display_name).toBeNull()
    expect(rows[0]?.email).toBeNull()

    const session = (await (await result.client.get('/api/auth/session')).json()) as {
      authenticated: boolean
      user: { displayName: string | null; email: string | null }
    }
    expect(session.authenticated).toBe(true)
    expect(session.user.displayName).toBeNull()
  })

  test('falls back to UserInfo when the ID Token omits a claim', async () => {
    harness.provider.userInfoClaims = {
      sub: 'usr_VJQ4V0D7H5W0JYKEGSR7VQ670V',
      name: '来自 UserInfo 的昵称',
      email: 'userinfo@example.com',
    }
    await harness.login({ overrides: { name: null, email: null } })

    const rows = users()
    expect(rows[0]?.display_name).toBe('来自 UserInfo 的昵称')
    expect(rows[0]?.email).toBe('userinfo@example.com')
  })

  test('a failing UserInfo call does not break the login', async () => {
    // A `sub` mismatch makes openid-client reject the UserInfo response.
    harness.provider.userInfoClaims = { sub: 'somebody-else' }
    const result = await harness.login({ overrides: { name: null, email: null } })

    expect(authErrorOf(result.location)).toBeNull()
    expect(users()).toHaveLength(1)
  })
})

describe('upsert invariants', () => {
  test('refuses an empty sub outright', () => {
    expect(() => upsertUserFromClaims(harness.context.db, '   ', {})).toThrow()
    expect(users()).toHaveLength(0)
  })

  test('keeps a cached claim when a later login omits it', () => {
    const db = harness.context.db
    upsertUserFromClaims(db, 'usr_KEEP', { name: '有昵称', email: 'keep@example.com' })
    upsertUserFromClaims(db, 'usr_KEEP', { name: null, email: null })

    const user = findUserByAccountUserId(db, 'usr_KEEP')
    expect(user?.displayName).toBe('有昵称')
    expect(user?.email).toBe('keep@example.com')
  })

  test('enforces uniqueness on account_user_id at the schema level', () => {
    const db = harness.context.db
    upsertUserFromClaims(db, 'usr_UNIQUE', {})
    expect(() =>
      db
        .prepare(
          'INSERT INTO rishi_user (id, account_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .run('another-id', 'usr_UNIQUE', Date.now(), Date.now()),
    ).toThrow(/UNIQUE/i)
  })
})
