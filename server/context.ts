/**
 * Wires the server's collaborators together so routes and tests share one
 * construction path.
 */
import type { ServerConfig } from './config.js'
import { openDatabase, type Db } from './db/index.js'
import { createLogger, type Logger } from './logger.js'
import { AccountClient, type ClientAuthMethod } from './auth/oidc.js'
import { SessionStore } from './auth/session.js'
import { AuthTransactionStore } from './auth/transactions.js'
import { RefreshTokenStore } from './auth/tokens.js'
import { UserDataStore } from './data/store.js'

export interface AppContext {
  config: ServerConfig
  logger: Logger
  db: Db
  account: AccountClient
  sessions: SessionStore
  transactions: AuthTransactionStore
  refreshTokens: RefreshTokenStore
  userData: UserDataStore
}

export interface CreateContextOptions {
  config: ServerConfig
  logger?: Logger
  db?: Db
  clientAuthMethod?: ClientAuthMethod
}

export function createContext({ config, logger, db, clientAuthMethod }: CreateContextOptions): AppContext {
  const resolvedLogger = logger ?? createLogger()
  const resolvedDb = db ?? openDatabase({ file: config.databaseFile, logger: resolvedLogger })

  return {
    config,
    logger: resolvedLogger,
    db: resolvedDb,
    account: new AccountClient({ config, logger: resolvedLogger, clientAuthMethod }),
    sessions: new SessionStore(resolvedDb, config.session),
    transactions: new AuthTransactionStore(resolvedDb),
    refreshTokens: new RefreshTokenStore({
      db: resolvedDb,
      secret: config.session.secret,
      enabled: config.storeRefreshTokens,
      logger: resolvedLogger,
    }),
    userData: new UserDataStore(resolvedDb),
  }
}
