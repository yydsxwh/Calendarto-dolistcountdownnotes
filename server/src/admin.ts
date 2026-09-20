import type { IncomingMessage } from 'node:http'
import type { DaysConfig } from './config'
import { resolveCaller, type Caller } from './identity'
import { readUser } from './users'

export async function requireAdmin(req: IncomingMessage, config: DaysConfig): Promise<Caller> {
  const caller = await resolveCaller(req, config)
  if (!caller) throw new Error('UNAUTHORIZED')
  if (config.adminSubs.includes(caller.sub)) return caller
  const stored = await readUser(config, caller.sub)
  const roles = [stored?.role, ...(stored?.roles || [])].filter(Boolean).map((item) => String(item).toUpperCase())
  if (roles.includes('ADMIN')) return caller
  throw new Error('ADMIN_ONLY')
}
