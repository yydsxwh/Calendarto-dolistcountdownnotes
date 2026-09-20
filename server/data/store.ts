/**
 * Per-user storage for 日事 business data.
 *
 * 日事 has always modelled its state as one `AppData` document in
 * `localStorage`; the server keeps that shape rather than shredding it into
 * tables, so the existing client keeps working unchanged. What changes is
 * ownership: every document belongs to exactly one `rishi_user`, and every
 * read and write is scoped by the user id taken from a verified session.
 *
 * `rishi_data_item` is a side index from item id to owner. It exists purely so
 * an item that belongs to somebody else can be answered with 403 instead of
 * being confused with 404.
 */
import type { Db } from '../db/index.js'
import { apiError } from '../errors.js'
import { newId } from '../crypto.js'

/** Collections inside `AppData` whose entries carry a stable `id`. */
export const INDEXED_COLLECTIONS = [
  'todos',
  'countdowns',
  'notes',
  'courses',
  'exams',
  'selfSchedules',
  'calendarEvents',
] as const

export type IndexedCollection = (typeof INDEXED_COLLECTIONS)[number]

/** Identity fields a client must never be able to set. */
const CLIENT_CONTROLLED_IDENTITY_FIELDS = ['userId', 'accountUserId', 'sub', 'ownerId', 'user_id'] as const

export const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024

export interface StoredDocument {
  data: Record<string, unknown>
  version: number
  updatedAt: number | null
}

interface DocumentRow {
  payload: string
  version: number
  updated_at: number
}

export interface TodoItem extends Record<string, unknown> {
  id: string
  title: string
  done: boolean
  priority: string
  remindMinutes: number
  createdAt: number
}

export class UserDataStore {
  constructor(private readonly db: Db) {}

  read(userId: string): StoredDocument {
    const row = this.db.prepare('SELECT payload, version, updated_at FROM rishi_user_data WHERE user_id = ?').get(
      userId,
    ) as DocumentRow | undefined
    if (!row) return { data: {}, version: 0, updatedAt: null }
    return { data: parsePayload(row.payload), version: row.version, updatedAt: row.updated_at }
  }

  /**
   * Replaces the caller's document.
   *
   * `baseVersion` implements optimistic concurrency: a client that edited an
   * older snapshot is rejected with 409 rather than silently overwriting a
   * newer device's work.
   */
  write(
    userId: string,
    data: unknown,
    baseVersion: number,
    now = Date.now(),
  ): { version: number; updatedAt: number } {
    const sanitized = sanitizeDocument(data)
    const serialized = JSON.stringify(sanitized)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw apiError('payload_too_large', 'document exceeds the per-user size limit')
    }

    const apply = this.db.transaction((): { version: number; updatedAt: number } => {
      const current = this.db
        .prepare('SELECT version FROM rishi_user_data WHERE user_id = ?')
        .get(userId) as { version: number } | undefined
      const currentVersion = current?.version ?? 0
      if (baseVersion !== currentVersion) {
        throw apiError('version_conflict', `base ${baseVersion} does not match stored ${currentVersion}`)
      }

      const nextVersion = currentVersion + 1
      this.db
        .prepare(
          `INSERT INTO rishi_user_data (user_id, payload, version, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             payload    = excluded.payload,
             version    = excluded.version,
             updated_at = excluded.updated_at`,
        )
        .run(userId, serialized, nextVersion, now)

      this.reindex(userId, sanitized)
      return { version: nextVersion, updatedAt: now }
    })

    return apply()
  }

  /** Owner of an item id, or null when no user holds it. */
  ownerOf(collection: IndexedCollection, itemId: string): string | null {
    const row = this.db
      .prepare('SELECT user_id FROM rishi_data_item WHERE collection = ? AND item_id = ?')
      .get(collection, itemId) as { user_id: string } | undefined
    return row?.user_id ?? null
  }

  listItems(userId: string, collection: IndexedCollection): Record<string, unknown>[] {
    const document = this.read(userId)
    const value = document.data[collection]
    return Array.isArray(value) ? (value.filter(isPlainObject) as Record<string, unknown>[]) : []
  }

  /**
   * Mutates one collection of the caller's document.
   *
   * The mutation only ever sees the document loaded for `userId`, which is why
   * a cross-user write is structurally impossible here.
   */
  mutateCollection<T>(
    userId: string,
    collection: IndexedCollection,
    mutate: (items: Record<string, unknown>[]) => { items: Record<string, unknown>[]; result: T },
    now = Date.now(),
  ): T {
    const apply = this.db.transaction((): T => {
      const document = this.read(userId)
      const existing = Array.isArray(document.data[collection])
        ? (document.data[collection] as unknown[]).filter(isPlainObject)
        : []
      const { items, result } = mutate(existing as Record<string, unknown>[])
      const nextData = { ...document.data, [collection]: items }
      const serialized = JSON.stringify(nextData)
      if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
        throw apiError('payload_too_large', 'document exceeds the per-user size limit')
      }
      this.db
        .prepare(
          `INSERT INTO rishi_user_data (user_id, payload, version, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             payload    = excluded.payload,
             version    = excluded.version,
             updated_at = excluded.updated_at`,
        )
        .run(userId, serialized, document.version + 1, now)
      this.reindex(userId, nextData)
      return result
    })
    return apply()
  }

  private reindex(userId: string, data: Record<string, unknown>): void {
    this.db.prepare('DELETE FROM rishi_data_item WHERE user_id = ?').run(userId)
    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO rishi_data_item (collection, item_id, user_id) VALUES (?, ?, ?)',
    )
    for (const collection of INDEXED_COLLECTIONS) {
      const value = data[collection]
      if (!Array.isArray(value)) continue
      for (const entry of value) {
        if (!isPlainObject(entry)) continue
        const id = entry.id
        if (typeof id === 'string' && id.length > 0) insert.run(collection, id, userId)
      }
    }
  }
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Strips anything a client could use to claim a different identity and drops
 * entries without a usable id. The rest of the document stays opaque: 日事's
 * feature set changes often and the server has no reason to gate it.
 */
export function sanitizeDocument(data: unknown): Record<string, unknown> {
  if (!isPlainObject(data)) {
    throw apiError('invalid_payload', 'document must be a JSON object')
  }

  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if ((CLIENT_CONTROLLED_IDENTITY_FIELDS as readonly string[]).includes(key)) continue
    output[key] = value
  }

  for (const collection of INDEXED_COLLECTIONS) {
    const value = output[collection]
    if (value === undefined) continue
    if (!Array.isArray(value)) {
      throw apiError('invalid_payload', `${collection} must be an array`)
    }
    output[collection] = value.filter(isPlainObject).map((entry) => stripIdentityFields(entry))
  }

  return output
}

export function stripIdentityFields(entry: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entry)) {
    if ((CLIENT_CONTROLLED_IDENTITY_FIELDS as readonly string[]).includes(key)) continue
    copy[key] = value
  }
  return copy
}

const PRIORITIES = new Set(['high', 'medium', 'low'])

/** Builds a todo from untrusted input. `id` and `createdAt` are server-owned. */
export function buildTodo(input: unknown, now = Date.now()): TodoItem {
  if (!isPlainObject(input)) throw apiError('invalid_payload', 'todo body must be an object')
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (title.length === 0) throw apiError('invalid_payload', 'todo.title is required')
  if (title.length > 500) throw apiError('invalid_payload', 'todo.title is too long')

  return {
    id: newId(),
    title,
    done: input.done === true,
    ...(typeof input.dueDate === 'string' ? { dueDate: input.dueDate } : {}),
    ...(typeof input.dueTime === 'string' ? { dueTime: input.dueTime } : {}),
    priority: typeof input.priority === 'string' && PRIORITIES.has(input.priority) ? input.priority : 'medium',
    remindMinutes: Number.isFinite(input.remindMinutes) ? Number(input.remindMinutes) : 15,
    createdAt: now,
  }
}

/** Applies a partial update, refusing to move an item between owners. */
export function applyTodoPatch(existing: Record<string, unknown>, patch: unknown): Record<string, unknown> {
  if (!isPlainObject(patch)) throw apiError('invalid_payload', 'patch body must be an object')
  const next = { ...existing }

  if ('title' in patch) {
    const title = typeof patch.title === 'string' ? patch.title.trim() : ''
    if (title.length === 0) throw apiError('invalid_payload', 'todo.title must not be empty')
    if (title.length > 500) throw apiError('invalid_payload', 'todo.title is too long')
    next.title = title
  }
  if ('done' in patch) next.done = patch.done === true
  if ('dueDate' in patch) next.dueDate = typeof patch.dueDate === 'string' ? patch.dueDate : undefined
  if ('dueTime' in patch) next.dueTime = typeof patch.dueTime === 'string' ? patch.dueTime : undefined
  if ('priority' in patch && typeof patch.priority === 'string' && PRIORITIES.has(patch.priority)) {
    next.priority = patch.priority
  }
  if ('remindMinutes' in patch && Number.isFinite(patch.remindMinutes)) {
    next.remindMinutes = Number(patch.remindMinutes)
  }

  return stripIdentityFields(next)
}
