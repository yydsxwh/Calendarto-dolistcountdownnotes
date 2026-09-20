/**
 * Business-data endpoints.
 *
 * Every handler derives its user from `req.auth`, which only `attachSession`
 * can populate. A `userId` / `accountUserId` / `sub` sent by a client is
 * stripped before storage and never consulted for authorisation.
 *
 * Status codes follow one rule: 401 means "we do not know who you are",
 * 403 means "we know, and this is not yours", 404 means "no such item".
 */
import { Router, type Request, type Response } from 'express'
import type { AppContext } from '../context.js'
import { apiError } from '../errors.js'
import { currentUserId, requireSession } from '../auth/middleware.js'
import { applyTodoPatch, buildTodo, isPlainObject } from './store.js'

export function dataRouter(ctx: AppContext): Router {
  const router = Router()
  router.use(requireSession)

  // Whole-document sync: how the 日事 clients keep localStorage in step.
  router.get('/sync', (req, res) => {
    const document = ctx.userData.read(currentUserId(req))
    res.json({ version: document.version, updatedAt: document.updatedAt, data: document.data })
  })

  router.put('/sync', (req, res) => {
    const userId = currentUserId(req)
    const body: unknown = req.body
    if (!isPlainObject(body)) throw apiError('invalid_payload', 'body must be a JSON object')

    const baseVersion = body.baseVersion
    if (!Number.isInteger(baseVersion) || (baseVersion as number) < 0) {
      throw apiError('invalid_payload', 'baseVersion must be a non-negative integer')
    }

    const written = ctx.userData.write(userId, body.data, baseVersion as number)
    ctx.logger.info('data.sync.written', { userId, version: written.version })
    res.json({ version: written.version, updatedAt: written.updatedAt })
  })

  router.get('/todos', (req, res) => {
    res.json({ todos: ctx.userData.listItems(currentUserId(req), 'todos') })
  })

  router.post('/todos', (req, res) => {
    const userId = currentUserId(req)
    const todo = buildTodo(req.body)
    ctx.userData.mutateCollection(userId, 'todos', (items) => ({
      items: [todo, ...items],
      result: null,
    }))
    res.status(201).json({ todo })
  })

  router.patch('/todos/:id', (req, res) => {
    const userId = currentUserId(req)
    const id = requireItemId(req)
    assertOwned(ctx, userId, id)

    const updated = ctx.userData.mutateCollection(userId, 'todos', (items) => {
      const index = items.findIndex((item) => item.id === id)
      if (index === -1) throw apiError('not_found', 'todo is not in the owner document')
      const next = [...items]
      next[index] = applyTodoPatch(items[index] as Record<string, unknown>, req.body)
      return { items: next, result: next[index] as Record<string, unknown> }
    })

    res.json({ todo: updated })
  })

  router.delete('/todos/:id', (req, res) => {
    const userId = currentUserId(req)
    const id = requireItemId(req)
    assertOwned(ctx, userId, id)

    ctx.userData.mutateCollection(userId, 'todos', (items) => ({
      items: items.filter((item) => item.id !== id),
      result: null,
    }))
    res.status(204).end()
  })

  return router
}

function requireItemId(req: Request): string {
  const id = req.params.id
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    throw apiError('invalid_payload', 'item id is missing or malformed')
  }
  return id
}

/**
 * Distinguishes "belongs to someone else" from "does not exist".
 *
 * Returning 403 here is deliberate per the integration spec. It does leak the
 * existence of an opaque UUID to an authenticated caller; ids are random v4
 * UUIDs, so this is not a practical enumeration vector.
 */
function assertOwned(ctx: AppContext, userId: string, itemId: string): void {
  const owner = ctx.userData.ownerOf('todos', itemId)
  if (owner === null) throw apiError('not_found', 'no todo with that id')
  if (owner !== userId) {
    ctx.logger.warn('data.todos.cross_user_denied', { userId })
    throw apiError('forbidden', 'todo belongs to a different user')
  }
}

export function healthRouter(ctx: AppContext): Router {
  const router = Router()
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', issuer: ctx.config.account.issuer })
  })
  return router
}
