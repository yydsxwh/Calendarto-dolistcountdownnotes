import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAdmin } from './admin'
import { oidcConfigured, platformConfigured, type DaysConfig } from './config'
import { secretHint } from './crypto'
import { log, readBody, sendJson } from './http'
import { probeAccount, probePlatform } from './integration-probe'
import {
  applyOverlay,
  encryptionKeyFrom,
  mergeOverlay,
  readOverlay,
  writeOverlay,
} from './integration-store'

function publicIntegrations(config: DaysConfig, overlayEnabled: { account: boolean; platform: boolean }) {
  return {
    account: {
      issuer: config.accountIssuer,
      clientId: config.accountClientId,
      clientSecret: secretHint(config.accountClientSecret),
      redirectUri: config.accountRedirectUri,
      scopes: config.accountScopes,
      enabled: overlayEnabled.account || oidcConfigured(config),
    },
    platform: {
      apiUrl: config.platformBaseUrl,
      clientId: config.platformClientId,
      serviceToken: secretHint(config.platformServiceToken),
      enabled: overlayEnabled.platform || platformConfigured(config),
    },
    encryptionKeyConfigured: Boolean(encryptionKeyFrom(config)),
  }
}

function adminError(res: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN'
  if (message === 'UNAUTHORIZED') {
    sendJson(res, 401, { error: 'unauthorized', message: '请先登录账号中心' })
    return
  }
  if (message === 'ADMIN_ONLY') {
    sendJson(res, 403, { error: 'admin_only', message: '仅站长可进入集成设置' })
    return
  }
  if (message === 'MISSING_ENCRYPTION_KEY') {
    sendJson(res, 503, { error: 'missing_encryption_key', message: 'BLOCKED: 服务器未配置 RISHI_CONFIG_ENCRYPTION_KEY' })
    return
  }
  log('warn', 'admin integrations failed', { reason: message })
  sendJson(res, 500, { error: 'server_error' })
}

export async function handleAdminMe(req: IncomingMessage, res: ServerResponse, config: DaysConfig) {
  try {
    const caller = await requireAdmin(req, config)
    sendJson(res, 200, { admin: true, sub: caller.sub })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      sendJson(res, 401, { admin: false })
      return
    }
    sendJson(res, 403, { admin: false })
  }
}

export async function handleIntegrations(req: IncomingMessage, res: ServerResponse, config: DaysConfig) {
  try {
    await requireAdmin(req, config)
    const overlay = await readOverlay(config)
    if (req.method === 'GET') {
      sendJson(res, 200, publicIntegrations(config, { account: overlay.account.enabled, platform: overlay.platform.enabled }))
      return
    }
    if (req.method !== 'PUT') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET, PUT' })
      return
    }
    const raw = await readBody(req, 64 * 1024)
    const body = JSON.parse(raw.toString('utf8')) as {
      account?: {
        issuer?: string
        clientId?: string
        clientSecret?: string
        redirectUri?: string
        scopes?: string
        enabled?: boolean
      }
      platform?: {
        apiUrl?: string
        clientId?: string
        serviceToken?: string
        enabled?: boolean
      }
    }
    const next = mergeOverlay(overlay, body)
    await writeOverlay(config, next)
    applyOverlay(config, next)
    sendJson(res, 200, publicIntegrations(config, { account: next.account.enabled, platform: next.platform.enabled }))
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { error: 'bad_json' })
      return
    }
    adminError(res, error)
  }
}

export async function handleAccountProbe(req: IncomingMessage, res: ServerResponse, config: DaysConfig) {
  try {
    await requireAdmin(req, config)
    const result = await probeAccount({
      issuer: config.accountIssuer,
      clientId: config.accountClientId,
      redirectUri: config.accountRedirectUri,
    })
    sendJson(res, result.ok ? 200 : 502, result)
  } catch (error) {
    adminError(res, error)
  }
}

export async function handlePlatformProbe(req: IncomingMessage, res: ServerResponse, config: DaysConfig) {
  try {
    await requireAdmin(req, config)
    const result = await probePlatform({
      apiUrl: config.platformBaseUrl,
      serviceToken: config.platformServiceToken,
      clientId: config.platformClientId,
    })
    sendJson(res, result.ok ? 200 : 502, result)
  } catch (error) {
    adminError(res, error)
  }
}
