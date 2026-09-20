/**
 * 日事's own application session.
 *
 * The browser never holds an account-center token. After a successful OIDC
 * login 日事 mints an opaque session token of its own; only its SHA-256 digest
 * is stored, so the database cannot be replayed as a live login.
 *
 * Two clocks bound a session: a sliding idle window and a hard absolute
 * lifetime that only a fresh login can extend.
 */
import type { Db } from '../db/index.js'
import type { SessionConfig } from '../config.js'
import { hashToken, randomToken } from '../crypto.js'

export type ClientKind = 'web' | 'native'

export interface SessionRecord {
  id: string
  userId: string
  clientKind: ClientKind
  createdAt: number
  lastSeenAt: number
  idleExpiresAt: number
  absoluteExpiresAt: number
}

export interface IssuedSession {
  token: string
  record: SessionRecord
}

interface SessionRow {
  id: string
  user_id: string
  client_kind: string
  created_at: number
  last_seen_at: number
  idle_expires_at: number
  absolute_expires_at: number
}

function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    clientKind: row.client_kind === 'native' ? 'native' : 'web',
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
  }
}

export class SessionStore {
  constructor(
    private readonly db: Db,
    private readonly config: SessionConfig,
  ) {}

  /**
   * Issues a brand-new session. Login always calls this instead of reusing a
   * pre-login identifier, which is what defeats session fixation.
   */
  create(userId: string, clientKind: ClientKind, now = Date.now()): IssuedSession {
    const token = randomToken()
    const id = hashToken(token)
    const record: SessionRecord = {
      id,
      userId,
      clientKind,
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt: now + this.config.idleTtlSeconds * 1000,
      absoluteExpiresAt: now + this.config.absoluteTtlSeconds * 1000,
    }
    this.db
      .prepare(
        `INSERT INTO rishi_session
           (id, user_id, client_kind, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.userId,
        record.clientKind,
        record.createdAt,
        record.lastSeenAt,
        record.idleExpiresAt,
        record.absoluteExpiresAt,
      )
    return { token, record }
  }

  /**
   * Resolves a presented token, sliding the idle window forward. Expired rows
   * are deleted rather than merely ignored.
   */
  read(token: string, now = Date.now()): SessionRecord | null {
    if (typeof token !== 'string' || token.length === 0) return null
    const id = hashToken(token)
    const row = this.db.prepare('SELECT * FROM rishi_session WHERE id = ?').get(id) as SessionRow | undefined
    if (!row) return null

    const record = toRecord(row)
    if (record.absoluteExpiresAt <= now || record.idleExpiresAt <= now) {
      this.db.prepare('DELETE FROM rishi_session WHERE id = ?').run(id)
      return null
    }

    const idleExpiresAt = Math.min(now + this.config.idleTtlSeconds * 1000, record.absoluteExpiresAt)
    this.db
      .prepare('UPDATE rishi_session SET last_seen_at = ?, idle_expires_at = ? WHERE id = ?')
      .run(now, idleExpiresAt, id)
    return { ...record, lastSeenAt: now, idleExpiresAt }
  }

  destroy(token: string): void {
    if (typeof token !== 'string' || token.length === 0) return
    this.db.prepare('DELETE FROM rishi_session WHERE id = ?').run(hashToken(token))
  }

  destroyAllForUser(userId: string): void {
    this.db.prepare('DELETE FROM rishi_session WHERE user_id = ?').run(userId)
  }

  countForUser(userId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS total FROM rishi_session WHERE user_id = ?').get(userId) as
      | { total: number }
      | undefined
    return row?.total ?? 0
  }

  /** Test hook: force a session to look expired without waiting. */
  expireNow(token: string, now = Date.now()): void {
    this.db
      .prepare('UPDATE rishi_session SET idle_expires_at = ?, absolute_expires_at = ? WHERE id = ?')
      .run(now - 1, now - 1, hashToken(token))
  }
}
