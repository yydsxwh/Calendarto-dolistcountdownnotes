/**
 * Local 日事 domain user, keyed by the account center's OIDC `sub`.
 *
 * `account_user_id` is the only identity key. Display name, email and avatar
 * are a *profile cache*: they may change or be missing at any time and must
 * never be used to decide whether two logins are the same person.
 */
import type { Db } from '../db/index.js'
import { newId } from '../crypto.js'

export interface RishiUser {
  id: string
  accountUserId: string
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  createdAt: number
  updatedAt: number
  lastLoginAt: number | null
}

export interface ProfileClaims {
  name?: string | null
  email?: string | null
  picture?: string | null
}

interface UserRow {
  id: string
  account_user_id: string
  display_name: string | null
  email: string | null
  avatar_url: string | null
  created_at: number
  updated_at: number
  last_login_at: number | null
}

function toUser(row: UserRow): RishiUser {
  return {
    id: row.id,
    accountUserId: row.account_user_id,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  }
}

export function findUserById(db: Db, id: string): RishiUser | null {
  const row = db.prepare('SELECT * FROM rishi_user WHERE id = ?').get(id) as UserRow | undefined
  return row ? toUser(row) : null
}

export function findUserByAccountUserId(db: Db, accountUserId: string): RishiUser | null {
  const row = db.prepare('SELECT * FROM rishi_user WHERE account_user_id = ?').get(accountUserId) as
    | UserRow
    | undefined
  return row ? toUser(row) : null
}

export interface UpsertResult {
  user: RishiUser
  created: boolean
}

/**
 * Finds the user behind an OIDC `sub`, creating one on first login.
 *
 * A changed email or display name updates the cache in place — it never
 * produces a second user.
 */
export function upsertUserFromClaims(
  db: Db,
  accountUserId: string,
  profile: ProfileClaims,
  now = Date.now(),
): UpsertResult {
  const trimmedSub = accountUserId.trim()
  if (trimmedSub.length === 0) throw new Error('accountUserId must not be empty')

  const existing = findUserByAccountUserId(db, trimmedSub)
  if (existing) {
    db.prepare(
      `UPDATE rishi_user
          SET display_name       = COALESCE(?, display_name),
              email              = COALESCE(?, email),
              avatar_url         = COALESCE(?, avatar_url),
              profile_updated_at = ?,
              updated_at         = ?,
              last_login_at      = ?
        WHERE id = ?`,
    ).run(
      normalise(profile.name),
      normalise(profile.email),
      normalise(profile.picture),
      now,
      now,
      now,
      existing.id,
    )
    return { user: findUserById(db, existing.id) as RishiUser, created: false }
  }

  const id = newId()
  db.prepare(
    `INSERT INTO rishi_user
       (id, account_user_id, display_name, email, avatar_url, profile_updated_at, created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    trimmedSub,
    normalise(profile.name),
    normalise(profile.email),
    normalise(profile.picture),
    now,
    now,
    now,
    now,
  )
  return { user: findUserById(db, id) as RishiUser, created: true }
}

function normalise(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Shape handed to the SPA. Contains no tokens and no account credentials. */
export function toPublicUser(user: RishiUser): {
  id: string
  accountUserId: string
  displayName: string | null
  email: string | null
  avatarUrl: string | null
} {
  return {
    id: user.id,
    accountUserId: user.accountUserId,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
  }
}
