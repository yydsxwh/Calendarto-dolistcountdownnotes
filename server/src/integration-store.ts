import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DaysConfig } from './config'
import { decryptJson, encryptJson } from './crypto'

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
}

export function emptyOverlay(): IntegrationOverlay {
  return {
    account: { issuer: '', clientId: '', clientSecret: '', redirectUri: '', scopes: '', enabled: false },
    platform: { apiUrl: '', clientId: '', serviceToken: '', enabled: false },
  }
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
  },
): IntegrationOverlay {
  const next = {
    account: { ...current.account },
    platform: { ...current.platform },
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
  return next
}
