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
  createdAt: string
  lastLoginAt: string
  legacyUserIds: string[]
  migratedFrom?: string
  migratedAt?: string
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
    createdAt: existing?.createdAt || now,
    lastLoginAt: now,
    legacyUserIds: existing?.legacyUserIds || [],
    migratedFrom: existing?.migratedFrom,
    migratedAt: existing?.migratedAt,
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

export async function rememberLegacyId(config: DaysConfig, sub: string, legacyId: string): Promise<void> {
  const user = await readUser(config, sub)
  if (!user) return
  if (user.legacyUserIds.includes(legacyId)) return
  user.legacyUserIds.push(legacyId)
  user.migratedFrom = user.migratedFrom || legacyId
  user.migratedAt = user.migratedAt || new Date().toISOString()
  await writeFile(userPath(config, sub), JSON.stringify(user))
}
