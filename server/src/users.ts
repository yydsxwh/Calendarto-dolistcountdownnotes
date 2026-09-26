import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DaysConfig } from './config'
import { sha256Hex } from './crypto'
import type { IdTokenClaims } from './oidc'

export type RishiUser = {
  accountSub: string
  displayName: string
  email: string
  avatarUrl: string
  role?: string
  roles?: string[]
  createdAt: string
  lastLoginAt: string
  legacyUserIds: string[]
  migratedFrom?: string
  migratedAt?: string
  /** 已经向主站确认过旧 userId（无论有没有可迁数据）。之后不再为每次请求打主站。 */
  legacyCheckedAt?: string
}

function userPath(config: DaysConfig, sub: string) {
  return join(config.dataDir, 'users', `${sha256Hex(sub)}.json`)
}

export async function upsertUser(config: DaysConfig, claims: IdTokenClaims): Promise<RishiUser> {
  await mkdir(join(config.dataDir, 'users'), { recursive: true })
  const existing = await readUser(config, claims.sub)
  const now = new Date().toISOString()
  const next: RishiUser = {
    accountSub: claims.sub,
    displayName: claims.name || claims.preferred_username || existing?.displayName || '我',
    email: claims.email || existing?.email || '',
    avatarUrl: claims.picture || existing?.avatarUrl || '',
    role: claims.role || existing?.role,
    roles: Array.isArray(claims.roles)
      ? claims.roles.map(String)
      : typeof claims.roles === 'string' && claims.roles.trim()
        ? claims.roles.split(/[,\s]+/).filter(Boolean)
        : existing?.roles,
    createdAt: existing?.createdAt || now,
    lastLoginAt: now,
    legacyUserIds: existing?.legacyUserIds || [],
    migratedFrom: existing?.migratedFrom,
    migratedAt: existing?.migratedAt,
    legacyCheckedAt: existing?.legacyCheckedAt,
  }
  await writeFile(userPath(config, claims.sub), JSON.stringify(next))
  return next
}

export async function readUser(config: DaysConfig, sub: string): Promise<RishiUser | null> {
  try {
    return JSON.parse(await readFile(userPath(config, sub), 'utf8')) as RishiUser
  } catch {
    return null
  }
}

export async function markLegacyChecked(
  config: DaysConfig,
  sub: string,
  legacyId: string | null,
): Promise<void> {
  const user = await readUser(config, sub)
  if (!user) return
  if (legacyId && !user.legacyUserIds.includes(legacyId)) user.legacyUserIds.push(legacyId)
  if (!user.legacyCheckedAt) user.legacyCheckedAt = new Date().toISOString()
  await writeFile(userPath(config, sub), JSON.stringify(user))
}

export async function rememberLegacyId(config: DaysConfig, sub: string, legacyId: string): Promise<void> {
  const user = await readUser(config, sub)
  if (!user) return
  if (user.legacyUserIds.includes(legacyId)) return
  user.legacyUserIds.push(legacyId)
  user.migratedFrom = user.migratedFrom || legacyId
  user.migratedAt = user.migratedAt || new Date().toISOString()
  await writeFile(userPath(config, sub), JSON.stringify(user))
}
