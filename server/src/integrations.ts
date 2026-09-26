import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAdmin } from './admin'
import { oidcConfigured, platformConfigured, type DaysConfig } from './config'
import { secretHint } from './crypto'
import { log, readBody, sendJson } from './http'
import { probeAccount, probePlatform, probeProductApi } from './integration-probe'
import {
  applyOverlay,
  encryptionKeyFrom,
  mergeOverlay,
  readOverlay,
  removeApi,
  upsertApi,
  writeOverlay,
  type IntegrationOverlay,
  type ProductApi,
} from './integration-store'

function publicApi(api: ProductApi) {
  return {
    id: api.id,
    name: api.name,
    baseUrl: api.baseUrl,
    authType: api.authType,
    headerName: api.headerName,
    secret: secretHint(api.secret),
    testPath: api.testPath,
    enabled: api.enabled,
  }
}

function publicIntegrations(config: DaysConfig, overlay: IntegrationOverlay) {
  const accountSecret = overlay.account.clientSecret || config.accountClientSecret
  const platformToken = overlay.platform.serviceToken || config.platformServiceToken
  return {
    account: {
      issuer: config.accountIssuer,
      clientId: config.accountClientId,
      clientSecret: secretHint(accountSecret),
      redirectUri: config.accountRedirectUri,
      scopes: config.accountScopes,
      enabled: overlay.account.enabled || oidcConfigured(config) || Boolean(accountSecret),
    },
    platform: {
      apiUrl: config.platformBaseUrl,
      clientId: config.platformClientId,
      serviceToken: secretHint(platformToken),
      enabled: overlay.platform.enabled || platformConfigured(config) || Boolean(platformToken),
    },
    apis: overlay.apis.map(publicApi),
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
    sendJson(res, 403, { error: 'admin_only', message: '仅站长可进入管理后台' })
    return
  }
  if (message === 'MISSING_ENCRYPTION_KEY') {
    sendJson(res, 503, { error: 'missing_encryption_key', message: 'BLOCKED: 服务器未配置 RISHI_CONFIG_ENCRYPTION_KEY' })
    return
  }
  if (message === 'BAD_API') {
    sendJson(res, 400, { error: 'bad_api', message: '接口名称或地址不合法，且不能占用 account / platform' })
    return
  }
  if (message === 'TOO_MANY_APIS') {
    sendJson(res, 400, { error: 'too_many_apis', message: '最多保存 20 条产品接口' })
    return
  }
  log('warn', 'admin integrations failed', { reason: message })
  sendJson(res, 500, { error: 'server_error' })
}

async function persistOverlay(config: DaysConfig, overlay: IntegrationOverlay) {
  await writeOverlay(config, overlay)
  applyOverlay(config, overlay)
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
      sendJson(res, 200, publicIntegrations(config, overlay))
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
    if (body.account?.clientSecret?.trim()) next.account.enabled = true
    if (body.platform?.serviceToken?.trim()) next.platform.enabled = true
    await persistOverlay(config, next)
    sendJson(res, 200, publicIntegrations(config, next))
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

export async function handleProductApis(req: IncomingMessage, res: ServerResponse, url: URL, config: DaysConfig) {
  try {
    await requireAdmin(req, config)
    const overlay = await readOverlay(config)
    const parts = url.pathname.replace(/\/+$/, '').split('/')
    const afterApis = parts.slice(parts.indexOf('apis') + 1)
    const id = decodeURIComponent(afterApis[0] || '')
    const action = decodeURIComponent(afterApis[1] || '')

    if (!id) {
      if (req.method === 'GET') {
        sendJson(res, 200, { apis: overlay.apis.map(publicApi) })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET, POST' })
        return
      }
      const raw = await readBody(req, 64 * 1024)
      const body = JSON.parse(raw.toString('utf8')) as Partial<ProductApi>
      const api = upsertApi(overlay, body)
      await persistOverlay(config, overlay)
      sendJson(res, 200, { api: publicApi(api) })
      return
    }

    if (action === 'test' && req.method === 'POST') {
      const api = overlay.apis.find((item) => item.id === id)
      if (!api) {
        sendJson(res, 404, { error: 'not_found', message: '没有这条产品接口' })
        return
      }
      const result = await probeProductApi(api)
      sendJson(res, result.ok ? 200 : 502, result)
      return
    }

    if (req.method === 'PUT') {
      if (!overlay.apis.some((item) => item.id === id)) {
        sendJson(res, 404, { error: 'not_found', message: '没有这条产品接口' })
        return
      }
      const raw = await readBody(req, 64 * 1024)
      const body = JSON.parse(raw.toString('utf8')) as Partial<ProductApi>
      const api = upsertApi(overlay, { ...body, id })
      await persistOverlay(config, overlay)
      sendJson(res, 200, { api: publicApi(api) })
      return
    }

    if (req.method === 'DELETE') {
      if (!removeApi(overlay, id)) {
        sendJson(res, 404, { error: 'not_found', message: '没有这条产品接口' })
        return
      }
      await persistOverlay(config, overlay)
      sendJson(res, 200, { ok: true })
      return
    }

    sendJson(res, 405, { error: 'method_not_allowed' })
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { error: 'bad_json' })
      return
    }
    adminError(res, error)
  }
}
