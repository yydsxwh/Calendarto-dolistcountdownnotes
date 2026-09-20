/**
 * Short-lived authorization transactions.
 *
 * `state`, `nonce` and the PKCE `code_verifier` live server-side only, keyed by
 * `state`. Each row is consumed exactly once, which is what makes a replayed
 * authorization code useless and blocks login-CSRF: the browser must also
 * present the matching transaction cookie.
 */
import type { Db } from '../db/index.js'
import type { ClientKind } from './session.js'

export interface AuthTransaction {
  state: string
  codeVerifier: string
  nonce: string
  returnTo: string
  clientKind: ClientKind
  createdAt: number
  expiresAt: number
}

interface TransactionRow {
  state: string
  code_verifier: string
  nonce: string
  return_to: string
  client_kind: string
  created_at: number
  expires_at: number
}

export const AUTH_TRANSACTION_TTL_SECONDS = 600

export class AuthTransactionStore {
  constructor(
    private readonly db: Db,
    private readonly ttlSeconds = AUTH_TRANSACTION_TTL_SECONDS,
  ) {}

  create(input: {
    state: string
    codeVerifier: string
    nonce: string
    returnTo: string
    clientKind: ClientKind
    now?: number
  }): AuthTransaction {
    const now = input.now ?? Date.now()
    const transaction: AuthTransaction = {
      state: input.state,
      codeVerifier: input.codeVerifier,
      nonce: input.nonce,
      returnTo: input.returnTo,
      clientKind: input.clientKind,
      createdAt: now,
      expiresAt: now + this.ttlSeconds * 1000,
    }
    this.db
      .prepare(
        `INSERT INTO oidc_auth_request
           (state, code_verifier, nonce, return_to, client_kind, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        transaction.state,
        transaction.codeVerifier,
        transaction.nonce,
        transaction.returnTo,
        transaction.clientKind,
        transaction.createdAt,
        transaction.expiresAt,
      )
    return transaction
  }

  /**
   * Atomically fetches and deletes a transaction. Returning `null` covers both
   * "never existed" and "already used", which are the same thing to a caller.
   */
  consume(state: string, now = Date.now()): AuthTransaction | null {
    if (typeof state !== 'string' || state.length === 0) return null

    const take = this.db.transaction((key: string): TransactionRow | null => {
      const row = this.db.prepare('SELECT * FROM oidc_auth_request WHERE state = ?').get(key) as
        | TransactionRow
        | undefined
      if (!row) return null
      this.db.prepare('DELETE FROM oidc_auth_request WHERE state = ?').run(key)
      return row
    })

    const row = take(state)
    if (!row) return null
    if (row.expires_at <= now) return null

    return {
      state: row.state,
      codeVerifier: row.code_verifier,
      nonce: row.nonce,
      returnTo: row.return_to,
      clientKind: row.client_kind === 'native' ? 'native' : 'web',
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }
  }

  pending(state: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM oidc_auth_request WHERE state = ?').get(state)
    return row !== undefined
  }
}
