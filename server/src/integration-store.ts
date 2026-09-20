import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DaysConfig } from './config'
import { decryptJson, encryptJson } from './crypto'

export type ProductApiAuth = 'bearer' | 'header'

export type ProductApi = {
  id: string
  name: string
  baseUrl: string
  authType: ProductApiAuth
  headerName: string
  secret: string
  testPath: string
  enabled: boolean
}

export type IntegrationOverlay = {
  account: {
    issuer: string
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes: string
    enabled: boolean
  }
  platform: {
    apiUrl: string
    clientId: string
    serviceToken: string
    enabled: boolean
  }
  apis: ProductApi[]
}

export const RESERVED_API_IDS = new Set(['account', 'platform'])

export function emptyOverlay(): IntegrationOverlay {
  return {
    account: { issuer: '', clientId: '', clientSecret: '', redirectUri: '', scopes: '', enabled: false },
    platform: { apiUrl: '', clientId: '', serviceToken: '', enabled: false },
    apis: [],
  }
}

export function slugApiId(raw: string) {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  if (slug) return slug
  const seed = raw.trim()
  if (!seed) return ''
  return `api-${createHash('sha256').update(seed).digest('hex').slice(0, 10)}`
}

function storePath(config: DaysConfig) {
  return join(config.dataDir, 'admin', 'integrations.enc')
}

export function encryptionKeyFrom(config: DaysConfig): string {
  return config.configEncryptionKey.trim()
}

export async function readOverlay(config: DaysConfig): Promise<IntegrationOverlay> {
  const key = encryptionKeyFrom(config)
  if (!key) return emptyOverlay()
  try {
    const raw = await readFile(storePath(config), 'utf8')
    const parsed = decryptJson<IntegrationOverlay>(raw, key)
    return {
      account: { ...emptyOverlay().account, ...parsed.account },
      platform: { ...emptyOverlay().platform, ...parsed.platform },
      apis: Array.isArray(parsed.apis) ? parsed.apis.map(normalizeApi).filter(Boolean) as ProductApi[] : [],
    }
  } catch {
    return emptyOverlay()
  }
}

export async function writeOverlay(config: DaysConfig, overlay: IntegrationOverlay): Promise<void> {
  const key = encryptionKeyFrom(config)
  if (!key) throw new Error('MISSING_ENCRYPTION_KEY')
  await mkdir(join(config.dataDir, 'admin'), { recursive: true })
  await writeFile(storePath(config), encryptJson(overlay, key), 'utf8')
}

export function applyOverlay(config: DaysConfig, overlay: IntegrationOverlay): DaysConfig {
  if (overlay.account.enabled) {
    if (overlay.account.issuer) config.accountIssuer = overlay.account.issuer.replace(/\/+$/, '')
    if (overlay.account.clientId) config.accountClientId = overlay.account.clientId
    if (overlay.account.clientSecret) config.accountClientSecret = overlay.account.clientSecret
    if (overlay.account.redirectUri) config.accountRedirectUri = overlay.account.redirectUri
    if (overlay.account.scopes) config.accountScopes = overlay.account.scopes
  }
  if (overlay.platform.enabled) {
    if (overlay.platform.apiUrl) config.platformBaseUrl = overlay.platform.apiUrl.replace(/\/+$/, '')
    if (overlay.platform.clientId) config.platformClientId = overlay.platform.clientId
    if (overlay.platform.serviceToken) config.platformServiceToken = overlay.platform.serviceToken
  }
  return config
}

export async function hydrateIntegrations(config: DaysConfig): Promise<DaysConfig> {
  return applyOverlay(config, await readOverlay(config))
}

export function mergeOverlay(
  current: IntegrationOverlay,
  patch: {
    account?: Partial<IntegrationOverlay['account']>
    platform?: Partial<IntegrationOverlay['platform']>
    apis?: ProductApi[]
  },
): IntegrationOverlay {
  const next: IntegrationOverlay = {
    account: { ...current.account },
    platform: { ...current.platform },
    apis: current.apis.map((item) => ({ ...item })),
  }
  if (patch.account) {
    for (const [key, value] of Object.entries(patch.account)) {
      if (key === 'clientSecret' && !String(value || '').trim()) continue
      if (value !== undefined) (next.account as Record<string, unknown>)[key] = value
    }
  }
  if (patch.platform) {
    for (const [key, value] of Object.entries(patch.platform)) {
      if (key === 'serviceToken' && !String(value || '').trim()) continue
      if (value !== undefined) (next.platform as Record<string, unknown>)[key] = value
    }
  }
  if (patch.apis) next.apis = patch.apis.map(normalizeApi).filter(Boolean) as ProductApi[]
  return next
}

function normalizeApi(raw: Partial<ProductApi> | null | undefined): ProductApi | null {
  if (!raw) return null
  const id = slugApiId(raw.id || raw.name || '')
  if (!id || RESERVED_API_IDS.has(id)) return null
  return {
    id,
    name: String(raw.name || id).trim().slice(0, 40),
    baseUrl: String(raw.baseUrl || '').trim(),
    authType: raw.authType === 'header' ? 'header' : 'bearer',
    headerName: String(raw.headerName || 'Authorization').trim() || 'Authorization',
    secret: String(raw.secret || ''),
    testPath: String(raw.testPath || '/health').trim() || '/health',
    enabled: Boolean(raw.enabled),
  }
}

export function upsertApi(current: IntegrationOverlay, input: Partial<ProductApi> & { id?: string }): ProductApi {
  const existing = input.id ? current.apis.find((item) => item.id === input.id) : undefined
  const next = normalizeApi({
    ...existing,
    ...input,
    secret: input.secret?.trim() ? input.secret : existing?.secret || '',
    id: input.id || input.name || existing?.id,
  })
  if (!next) throw new Error('BAD_API')
  const index = current.apis.findIndex((item) => item.id === next.id)
  if (index >= 0) current.apis[index] = next
  else {
    if (current.apis.length >= 20) throw new Error('TOO_MANY_APIS')
    current.apis.push(next)
  }
  return next
}

export function removeApi(current: IntegrationOverlay, id: string): boolean {
  const before = current.apis.length
  current.apis = current.apis.filter((item) => item.id !== id)
  return current.apis.length !== before
}

export function getEnabledProductApi(overlay: IntegrationOverlay, id: string): ProductApi | null {
  return overlay.apis.find((item) => item.id === id && item.enabled && item.secret) || null
}
