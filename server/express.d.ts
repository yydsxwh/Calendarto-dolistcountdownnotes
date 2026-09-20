import type { RishiUser } from './auth/users.js'
import type { SessionRecord } from './auth/session.js'

declare global {
  namespace Express {
    interface Request {
      /**
       * Present only after `attachSession` has verified a 日事 session.
       * Route handlers must read the current user from here and never from
       * the request body or query string.
       */
      auth?: {
        session: SessionRecord
        user: RishiUser
        via: 'cookie' | 'bearer'
      }
    }
  }
}

export {}
