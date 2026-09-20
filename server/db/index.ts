import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { migrations } from './migrations.js'
import type { Logger } from '../logger.js'

export type Db = Database.Database

export interface OpenDatabaseOptions {
  file: string
  logger?: Logger
}

/**
 * Opens (and creates, if needed) the SQLite file and brings it to the latest
 * schema. `:memory:` is used by the test suite.
 */
export function openDatabase({ file, logger }: OpenDatabaseOptions): Db {
  if (file !== ':memory:') {
    const absolute = resolve(file)
    mkdirSync(dirname(absolute), { recursive: true })
    file = absolute
  }

  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  migrate(db, logger)
  return db
}

export function migrate(db: Db, logger?: Logger): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      id         INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)

  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migration')
      .all()
      .map((row) => (row as { id: number }).id),
  )

  const insert = db.prepare('INSERT INTO schema_migration (id, name, applied_at) VALUES (?, ?, ?)')

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    const run = db.transaction(() => {
      db.exec(migration.up)
      insert.run(migration.id, migration.name, Date.now())
    })
    run()
    logger?.info('db.migration.applied', { id: migration.id, name: migration.name })
  }
}

/** Best-effort removal of rows that are past their TTL. Safe to call often. */
export function pruneExpired(db: Db, now = Date.now()): void {
  db.prepare('DELETE FROM oidc_auth_request WHERE expires_at <= ?').run(now)
  db.prepare('DELETE FROM native_handoff WHERE expires_at <= ?').run(now)
  db.prepare('DELETE FROM rishi_session WHERE absolute_expires_at <= ? OR idle_expires_at <= ?').run(now, now)
}
