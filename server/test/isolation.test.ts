/**
 * User isolation for business data.
 *
 * The rule under test: the acting user comes from the verified 日事 session
 * and from nowhere else. A `userId` in a body or query string must have no
 * effect, and one user must never reach another user's items.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHarness, type Harness, type TestClient } from './harness.js'

let harness: Harness

beforeEach(async () => {
  harness = await createHarness()
})

afterEach(async () => {
  await harness.close()
})

interface Session {
  client: TestClient
  userId: string
}

async function signIn(sub: string): Promise<Session> {
  const result = await harness.login({ client: harness.client(), overrides: { sub } })
  const row = harness.context.db.prepare('SELECT id FROM rishi_user WHERE account_user_id = ?').get(sub) as
    | { id: string }
    | undefined
  if (!row) throw new Error(`login for ${sub} did not create a user`)
  return { client: result.client, userId: row.id }
}

async function createTodo(session: Session, title: string): Promise<string> {
  const response = await session.client.post('/api/todos', { body: { title } })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { todo: { id: string } }
  return body.todo.id
}

describe('unauthenticated access', () => {
  test('every business endpoint answers 401, never 403', async () => {
    const client = harness.client()
    const calls: [string, Response][] = [
      ['GET /api/sync', await client.get('/api/sync')],
      ['PUT /api/sync', await client.put('/api/sync', { body: { baseVersion: 0, data: {} } })],
      ['GET /api/todos', await client.get('/api/todos')],
      ['POST /api/todos', await client.post('/api/todos', { body: { title: '写作业' } })],
      ['PATCH /api/todos/x', await client.patch('/api/todos/x', { body: { done: true } })],
      ['DELETE /api/todos/x', await client.delete('/api/todos/x')],
    ]

    for (const [label, response] of calls) {
      expect(`${label}:${response.status}`).toBe(`${label}:401`)
      const body = (await response.json()) as { error: string }
      expect(body.error).toBe('unauthenticated')
    }
  })

  test('the session probe stays a 200 so the SPA can ask anonymously', async () => {
    const response = await harness.client().get('/api/auth/session')
    expect(response.status).toBe(200)
    expect((await response.json()) as { authenticated: boolean }).toEqual({
      authenticated: false,
      user: null,
    })
  })
})

describe('cross-user access', () => {
  test('A cannot read B’s todo', async () => {
    const alice = await signIn('usr_ALICE')
    const bob = await signIn('usr_BOB')

    const bobTodo = await createTodo(bob, 'Bob 的期末复习')

    const list = (await (await alice.client.get('/api/todos')).json()) as { todos: { id: string }[] }
    expect(list.todos).toHaveLength(0)

    // Even naming Bob's id explicitly must not reveal it.
    const patch = await alice.client.patch(`/api/todos/${bobTodo}`, { body: { done: true } })
    expect(patch.status).toBe(403)
    expect(((await patch.json()) as { error: string }).error).toBe('forbidden')
  })

  test('A cannot modify B’s todo', async () => {
    const alice = await signIn('usr_ALICE')
    const bob = await signIn('usr_BOB')
    const bobTodo = await createTodo(bob, '原始标题')

    const response = await alice.client.patch(`/api/todos/${bobTodo}`, { body: { title: '被改掉了' } })
    expect(response.status).toBe(403)

    const bobList = (await (await bob.client.get('/api/todos')).json()) as {
      todos: { id: string; title: string }[]
    }
    expect(bobList.todos[0]?.title).toBe('原始标题')
  })

  test('A cannot delete B’s todo', async () => {
    const alice = await signIn('usr_ALICE')
    const bob = await signIn('usr_BOB')
    const bobTodo = await createTodo(bob, '不能被删掉')

    expect((await alice.client.delete(`/api/todos/${bobTodo}`)).status).toBe(403)

    const bobList = (await (await bob.client.get('/api/todos')).json()) as { todos: { id: string }[] }
    expect(bobList.todos.map((todo) => todo.id)).toEqual([bobTodo])
  })

  test('an unknown id is 404, not 403', async () => {
    const alice = await signIn('usr_ALICE')
    const response = await alice.client.delete('/api/todos/00000000-0000-4000-8000-000000000000')
    expect(response.status).toBe(404)
  })

  test('sync documents never bleed between users', async () => {
    const alice = await signIn('usr_ALICE')
    const bob = await signIn('usr_BOB')

    await alice.client.put('/api/sync', {
      body: { baseVersion: 0, data: { notes: [{ id: 'n1', title: 'Alice 的便签' }] } },
    })
    await bob.client.put('/api/sync', {
      body: { baseVersion: 0, data: { notes: [{ id: 'n2', title: 'Bob 的便签' }] } },
    })

    const aliceDocument = (await (await alice.client.get('/api/sync')).json()) as {
      data: { notes: { id: string }[] }
    }
    const bobDocument = (await (await bob.client.get('/api/sync')).json()) as {
      data: { notes: { id: string }[] }
    }

    expect(aliceDocument.data.notes.map((note) => note.id)).toEqual(['n1'])
    expect(bobDocument.data.notes.map((note) => note.id)).toEqual(['n2'])
  })
})

describe('client-supplied identity is ignored', () => {
  test('a userId in the sync body cannot redirect the write', async () => {
    const alice = await signIn('usr_ALICE')
    const bob = await signIn('usr_BOB')

    const response = await alice.client.put('/api/sync', {
      body: {
        baseVersion: 0,
        userId: bob.userId,
        accountUserId: 'usr_BOB',
        sub: 'usr_BOB',
        data: { userId: bob.userId, todos: [{ id: 'x1', title: '注入尝试', userId: bob.userId }] },
      },
    })
    expect(response.status).toBe(200)

    // Bob's document is untouched...
    const bobDocument = (await (await bob.client.get('/api/sync')).json()) as {
      version: number
      data: Record<string, unknown>
    }
    expect(bobDocument.version).toBe(0)
    expect(bobDocument.data).toEqual({})

    // ...and the identity fields were stripped from what Alice stored.
    const aliceDocument = (await (await alice.client.get('/api/sync')).json()) as {
      data: { userId?: string; todos: Record<string, unknown>[] }
    }
    expect(aliceDocument.data.userId).toBeUndefined()
    expect(aliceDocument.data.todos[0]).not.toHaveProperty('userId')
  })

  test('a userId in a todo body cannot assign it to somebody else', async () => {
    const alice = await signIn('usr_ALICE')
    const bob = await signIn('usr_BOB')

    const response = await alice.client.post('/api/todos', {
      body: { title: '越权待办', userId: bob.userId, id: 'attacker-chosen-id' },
    })
    expect(response.status).toBe(201)
    const created = (await response.json()) as { todo: { id: string } }

    // The server assigns ids; a client-chosen one is discarded.
    expect(created.todo.id).not.toBe('attacker-chosen-id')

    const bobList = (await (await bob.client.get('/api/todos')).json()) as { todos: unknown[] }
    expect(bobList.todos).toHaveLength(0)

    const owner = harness.context.userData.ownerOf('todos', created.todo.id)
    expect(owner).toBe(alice.userId)
  })
})

describe('optimistic concurrency', () => {
  test('a stale baseVersion is rejected with 409 instead of overwriting', async () => {
    const alice = await signIn('usr_ALICE')

    const first = await alice.client.put('/api/sync', {
      body: { baseVersion: 0, data: { todos: [{ id: 'a', title: '第一次' }] } },
    })
    expect(((await first.json()) as { version: number }).version).toBe(1)

    const stale = await alice.client.put('/api/sync', {
      body: { baseVersion: 0, data: { todos: [{ id: 'b', title: '覆盖尝试' }] } },
    })
    expect(stale.status).toBe(409)
    expect(((await stale.json()) as { error: string }).error).toBe('version_conflict')

    const document = (await (await alice.client.get('/api/sync')).json()) as {
      data: { todos: { id: string }[] }
    }
    expect(document.data.todos.map((todo) => todo.id)).toEqual(['a'])
  })

  test('rejects a malformed document rather than storing it', async () => {
    const alice = await signIn('usr_ALICE')
    const response = await alice.client.put('/api/sync', {
      body: { baseVersion: 0, data: { todos: 'not-an-array' } },
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe('invalid_payload')
  })
})

describe('CSRF', () => {
  test('a cross-site origin cannot drive a cookie-authenticated write', async () => {
    const alice = await signIn('usr_ALICE')

    const response = await alice.client.put('/api/sync', {
      origin: 'https://evil.example',
      body: { baseVersion: 0, data: { todos: [] } },
    })
    expect(response.status).toBe(403)
    expect(((await response.json()) as { error: string }).error).toBe('csrf_origin_rejected')
  })

  test('a cross-site origin cannot log the user out', async () => {
    const alice = await signIn('usr_ALICE')
    expect((await alice.client.post('/api/auth/logout', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await alice.client.get('/api/sync')).status).toBe(200)
  })

  test('same-origin writes are unaffected', async () => {
    const alice = await signIn('usr_ALICE')
    const response = await alice.client.put('/api/sync', { body: { baseVersion: 0, data: {} } })
    expect(response.status).toBe(200)
  })

  test('a bearer session is not subject to the origin check', async () => {
    // Browsers do not attach an Authorization header to a cross-site request,
    // so a bearer call cannot be forged the way a cookie call can. Native
    // shells rely on this: they run on their own origin.
    const result = await harness.login({ kind: 'native' })
    const location = result.callback.headers.get('location') ?? ''
    const handoff = new URLSearchParams(location.slice(location.indexOf('?') + 1)).get('handoff') as string

    const exchange = await harness
      .client()
      .post('/api/auth/native/exchange', { origin: 'capacitor://localhost', body: { handoff } })
    expect(exchange.status).toBe(200)

    const native = harness.client()
    native.bearer = ((await exchange.json()) as { token: string }).token
    const write = await native.put('/api/sync', {
      origin: 'capacitor://localhost',
      body: { baseVersion: 0, data: {} },
    })
    expect(write.status).toBe(200)
  })

  test('an unauthenticated cross-origin write is a 401, not a 403', async () => {
    // Nothing to protect: no cookie was accepted, so the origin check has no
    // credential to defend and the request simply lacks authentication.
    const response = await harness
      .client()
      .put('/api/sync', { origin: 'https://evil.example', body: { baseVersion: 0, data: {} } })
    expect(response.status).toBe(401)
  })
})

describe('native bearer sessions', () => {
  test('exchanges a one-time handoff code for a bearer session', async () => {
    const result = await harness.login({ kind: 'native' })
    expect(result.callback.status).toBe(302)
    const location = result.callback.headers.get('location') ?? ''
    expect(location.startsWith('com.yydsxwh.kemiao.days://auth/callback?handoff=')).toBe(true)

    const handoff = new URLSearchParams(location.slice(location.indexOf('?') + 1)).get('handoff') as string

    const bare = harness.client()
    const exchange = await bare.post('/api/auth/native/exchange', { body: { handoff } })
    expect(exchange.status).toBe(200)
    const body = (await exchange.json()) as { token: string; user: { accountUserId: string } }
    expect(body.user.accountUserId).toBe('usr_VJQ4V0D7H5W0JYKEGSR7VQ670V')

    const native = harness.client()
    native.bearer = body.token
    expect((await native.get('/api/sync')).status).toBe(200)

    // Single use: a replayed code is worthless.
    expect((await bare.post('/api/auth/native/exchange', { body: { handoff } })).status).toBe(400)
  })

  test('a made-up handoff code is refused', async () => {
    const response = await harness
      .client()
      .post('/api/auth/native/exchange', { body: { handoff: 'nope' } })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe('handoff_invalid')
  })
})
