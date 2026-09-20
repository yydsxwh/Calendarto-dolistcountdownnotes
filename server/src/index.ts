import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { handleAccountProbe, handleAdminMe, handleIntegrations, handlePlatformProbe } from './integrations'
import { loadConfig, oidcConfigured, platformConfigured, type DaysConfig } from './config'
import { recognizeWithPlatform, recognizeWithWwwFallback, type OcrKind } from './ai-ocr'
import { consumeHandoff, issueHandoff } from './handoff'
import {
  applyCors,
  cookieHeader,
  clearCookie,
  log,
  readBody,
  readCookies,
  redirect,
  requestOriginAllowed,
  sendJson,
} from './http'
import { resolveCaller } from './identity'
import { buildAuthorizeUrl, exchangeAuthorizationCode, OidcError, safeReturnTo, startOidc, verifyIdToken } from './oidc'
import { assertUploadAllowed, createRishiPlatform } from './platform'
import { issueSession, OIDC_COOKIE, persistSession, publicUser, readOidcStart, revokeSession, SESSION_COOKIE, sessionFromRequest, signOidcStart } from './session'
import { migrateLegacyIfNeeded, readRecord, writeRecord } from './sync-store'
import { upsertUser } from './users'

const MAX_JSON_BYTES = 4 * 1024 * 1024
const MAX_FILE_BYTES = 8 * 1024 * 1024

function defaultAppPath(config: DaysConfig) {
  return `${config.publicOrigin}/products/days/`
}

function sessionCookie(config: DaysConfig, token: string) {
  return cookieHeader(SESSION_COOKIE, token, {
    maxAge: config.sessionTtlSec,
    secure: config.cookieSecure,
    sameSite: 'Lax',
  })
}

async function handleLogin(req: IncomingMessage, res: ServerResponse, url: URL, config: DaysConfig) {
  if (!oidcConfigured(config)) {
    sendJson(res, 503, { error: 'oidc_unconfigured', message: 'BLOCKED: ACCOUNT_ISSUER / ACCOUNT_CLIENT_SECRET 未配置' })
    return
  }
  const native = url.searchParams.get('native') === '1'
  const returnTo = safeReturnTo(
    url.searchParams.get('returnTo') || url.searchParams.get('next'),
    native ? config.nativeHandoffUri : defaultAppPath(config),
  )
  const { start, challenge } = startOidc(returnTo, native)
  redirect(res, buildAuthorizeUrl(config, start, challenge), {
    'set-cookie': cookieHeader(OIDC_COOKIE, signOidcStart(start, config), {
      maxAge: 10 * 60,
      secure: config.cookieSecure,
      sameSite: 'Lax',
    }),
  })
}

async function handleCallback(req: IncomingMessage, res: ServerResponse, url: URL, config: DaysConfig) {
  const started = readOidcStart(readCookies(req)[OIDC_COOKIE], config)
  const clearOidc = clearCookie(OIDC_COOKIE, { secure: config.cookieSecure })
  if (!started) {
    sendJson(res, 400, { error: 'missing_oidc_state' }, { 'set-cookie': clearOidc })
    return
  }
  if ((url.searchParams.get('state') || '') !== started.state) {
    sendJson(res, 400, { error: 'state_mismatch' }, { 'set-cookie': clearOidc })
    return
  }
  const code = url.searchParams.get('code') || ''
  if (!code) {
    sendJson(res, 400, { error: 'missing_code', detail: url.searchParams.get('error') }, { 'set-cookie': clearOidc })
    return
  }
  try {
    const tokens = await exchangeAuthorizationCode(config, { code, codeVerifier: started.verifier })
    const claims = await verifyIdToken(config, tokens.id_token || '', { nonce: started.nonce })
    const user = await upsertUser(config, claims)
    const issued = issueSession(
      { sub: user.accountSub, name: user.displayName, email: user.email, avatarUrl: user.avatarUrl },
      config,
    )
    await persistSession(config, issued.session)
    if (started.native) {
      const handoff = await issueHandoff(config, issued.session, issued.token)
      const dest = new URL(started.returnTo.startsWith('kemiao-days:') ? started.returnTo : config.nativeHandoffUri)
      dest.searchParams.set('handoff', handoff)
      redirect(res, dest.toString(), { 'set-cookie': clearOidc })
      return
    }
    res.writeHead(302, {
      location: started.returnTo || defaultAppPath(config),
      'cache-control': 'no-store',
      'set-cookie': [sessionCookie(config, issued.token), clearOidc],
    })
    res.end()
  } catch (error) {
    const codeName = error instanceof OidcError ? error.code : 'oidc_failed'
    log('warn', 'oidc callback failed', { code: codeName, reason: error instanceof Error ? error.message : 'error' })
    sendJson(res, 400, { error: codeName }, { 'set-cookie': clearOidc })
  }
}

async function handleSession(req: IncomingMessage, res: ServerResponse, config: DaysConfig) {
  const session = sessionFromRequest(req, config)
  if (session) {
    sendJson(res, 200, { user: publicUser(session) })
    return
  }
  const caller = await resolveCaller(req, config).catch(() => null)
  if (caller) {
    sendJson(res, 200, {
      user: { id: caller.sub, sub: caller.sub, name: caller.name, email: caller.email, avatarUrl: caller.avatarUrl },
    })
    return
  }
  sendJson(res, 200, { user: null })
}

async function handleLogout(req: IncomingMessage, res: ServerResponse, url: URL, config: DaysConfig) {
  const session = sessionFromRequest(req, config)
  if (session) await revokeSession(config, session.sid)
  const returnTo = safeReturnTo(url.searchParams.get('returnTo') || url.searchParams.get('next'), defaultAppPath(config))
  redirect(res, returnTo, { 'set-cookie': clearCookie(SESSION_COOKIE, { secure: config.cookieSecure }) })
}

async function handleHandoff(req: IncomingMessage, res: ServerResponse, config: DaysConfig) {
  const raw = await readBody(req, 64 * 1024)
  let payload: { code?: string }
  try {
    payload = JSON.parse(raw.toString('utf8')) as { code?: string }
  } catch {
    sendJson(res, 400, { error: 'bad_json' })
    return
  }
  const record = await consumeHandoff(config, payload.code || '')
  if (!record) {
    sendJson(res, 400, { error: 'invalid_handoff' })
    return
  }
  sendJson(res, 200, { token: record.token, user: record.user })
}

async function handleSync(req: IncomingMessage, res: ServerResponse, config: DaysConfig) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET, PUT' })
    return
  }
  if (req.method === 'PUT' && !requestOriginAllowed(req, config) && !sessionFromRequest(req, config)) {
    sendJson(res, 403, { error: 'bad_origin' })
    return
  }
  if (req.method === 'PUT' && req.headers.origin && !requestOriginAllowed(req, config) && !req.headers.authorization) {
    sendJson(res, 403, { error: 'bad_origin' })
    return
  }

  let caller
  try {
    caller = await resolveCaller(req, config)
  } catch {
    sendJson(res, 503, { error: 'session_unavailable' })
    return
  }
  if (!caller) {
    sendJson(res, 401, { authenticated: false, data: null, version: 0, updatedAt: null })
    return
  }

  if (caller.source === 'rishi') {
    await migrateLegacyIfNeeded(config, caller.sub, caller.legacyId)
  }

  if (req.method === 'GET') {
    const record = await readRecord(config, caller.key)
    sendJson(res, 200, { authenticated: true, ...record })
    return
  }

  const raw = await readBody(req, MAX_JSON_BYTES)
  let payload: { data?: unknown; baseVersion?: number; userId?: string; sub?: string }
  try {
    payload = JSON.parse(raw.toString('utf8')) as { data?: unknown; baseVersion?: number }
  } catch {
    sendJson(res, 400, { error: 'bad_json' })
    return
  }
  if (!payload || typeof payload.data !== 'object' || payload.data === null) {
    sendJson(res, 400, { error: 'bad_payload' })
    return
  }

  const current = await readRecord(config, caller.key)
  const baseVersion = Number(payload.baseVersion) || 0
  if (current.version !== baseVersion) {
    sendJson(res, 409, { authenticated: true, ...current })
    return
  }
  const next = {
    data: payload.data,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  }
  await writeRecord(config, caller.key, next)
  sendJson(res, 200, { version: next.version, updatedAt: next.updatedAt })
}

function parseMultipart(buffer: Buffer, contentType: string): { fileName: string; mimeType: string; bytes: Buffer; fields: Record<string, string> } {
  const boundaryMatch = /boundary=([^;]+)/i.exec(contentType)
  if (!boundaryMatch) throw new Error('BAD_MULTIPART')
  const boundary = `--${boundaryMatch[1].trim().replace(/^"|"$/g, '')}`
  const parts = buffer.toString('latin1').split(boundary).slice(1, -1)
  const fields: Record<string, string> = {}
  let fileName = 'upload.bin'
  let mimeType = 'application/octet-stream'
  let bytes = Buffer.alloc(0)
  for (const part of parts) {
    const split = part.indexOf('\r\n\r\n')
    if (split < 0) continue
    const header = part.slice(0, split)
    const body = part.slice(split + 4).replace(/\r\n$/, '')
    const name = /name="([^"]+)"/i.exec(header)?.[1]
    const filename = /filename="([^"]+)"/i.exec(header)?.[1]
    const type = /content-type:\s*([^\r\n]+)/i.exec(header)?.[1]
    if (!name) continue
    if (filename) {
      fileName = filename
      mimeType = (type || 'application/octet-stream').trim()
      bytes = Buffer.from(body, 'latin1')
    } else {
      fields[name] = Buffer.from(body, 'latin1').toString('utf8')
    }
  }
  if (!bytes.length) throw new Error('NO_FILE')
  return { fileName, mimeType, bytes, fields }
}

async function handleOcr(req: IncomingMessage, res: ServerResponse, config: DaysConfig) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }
  let caller
  try {
    caller = await resolveCaller(req, config)
  } catch {
    caller = null
  }
  const raw = await readBody(req, MAX_FILE_BYTES)
  const parsed = parseMultipart(raw, String(req.headers['content-type'] || ''))
  const kind = (parsed.fields.kind || parsed.fields.focus || 'auto') as OcrKind
  const userHint = parsed.fields.userHint || ''
  const platform = createRishiPlatform(config)
  try {
    if (platform && caller) {
      const payload = await recognizeWithPlatform(platform, {
        imageBase64: parsed.bytes.toString('base64'),
        mimeType: parsed.mimeType,
        userHint,
        kind,
        actorId: caller.sub,
      })
      sendJson(res, 200, payload)
      return
    }
    const payload = await recognizeWithWwwFallback(config, {
      fileName: parsed.fileName,
      bytes: parsed.bytes,
      mimeType: parsed.mimeType,
      userHint,
    })
    sendJson(res, 200, payload)
  } catch (error) {
    log('warn', 'ocr failed', { reason: error instanceof Error ? error.message : 'error' })
    sendJson(res, 502, { error: error instanceof Error ? error.message : 'ocr_failed' })
  }
}

async function handleFiles(req: IncomingMessage, res: ServerResponse, url: URL, config: DaysConfig) {
  const caller = await resolveCaller(req, config).catch(() => null)
  if (!caller || caller.source !== 'rishi') {
    sendJson(res, 401, { error: 'unauthorized' })
    return
  }
  const platform = createRishiPlatform(config)
  if (!platform) {
    sendJson(res, 503, { error: 'platform_unconfigured', message: 'BLOCKED: PLATFORM_BASE_URL / PLATFORM_SERVICE_TOKEN 未配置' })
    return
  }
  const asUser = platform.withActor(caller.sub)
  const parts = url.pathname.replace(/\/+$/, '').split('/')
  const fileId = parts[4]
  const action = parts[5]

  if (req.method === 'POST' && !fileId) {
    const raw = await readBody(req, MAX_FILE_BYTES)
    const parsed = parseMultipart(raw, String(req.headers['content-type'] || ''))
    try {
      assertUploadAllowed({ mimeType: parsed.mimeType, size: parsed.bytes.length, fileName: parsed.fileName })
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'bad_upload' })
      return
    }
    const file = await asUser.storage.proxyUpload(
      new Blob([new Uint8Array(parsed.bytes)], { type: parsed.mimeType }),
      { namespace: 'rishi-files', fileName: parsed.fileName },
    )
    sendJson(res, 200, { file })
    return
  }

  if (!fileId) {
    sendJson(res, 404, { error: 'not_found' })
    return
  }
  if (req.method === 'GET' && !action) {
    sendJson(res, 200, { file: await asUser.storage.getFile(fileId) })
    return
  }
  if (req.method === 'POST' && action === 'download-url') {
    sendJson(res, 200, await asUser.storage.createDownloadUrl(fileId, {}))
    return
  }
  if (req.method === 'DELETE') {
    await asUser.storage.deleteFile(fileId)
    sendJson(res, 204, { ok: true })
    return
  }
  sendJson(res, 405, { error: 'method_not_allowed' })
}

export function createDaysServer(config: DaysConfig) {
  return createServer(async (req, res) => {
    if (applyCors(req, res, config)) return
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    try {
      if (path === '/admin/integrations' && req.method === 'GET') {
        redirect(res, `${defaultAppPath(config)}#admin/integrations`)
        return
      }
      if (path === '/api/days/health') {
        sendJson(res, 200, {
          ok: true,
          oidc: oidcConfigured(config),
          platform: platformConfigured(config),
        })
        return
      }
      if (path === '/api/days/auth/login' && req.method === 'GET') return void (await handleLogin(req, res, url, config))
      if (path === '/api/days/auth/callback' && req.method === 'GET') return void (await handleCallback(req, res, url, config))
      if (path === '/api/days/auth/session' && req.method === 'GET') return void (await handleSession(req, res, config))
      if (path === '/api/days/auth/logout' && req.method === 'GET') return void (await handleLogout(req, res, url, config))
      if (path === '/api/days/auth/handoff' && req.method === 'POST') return void (await handleHandoff(req, res, config))
      if (path === '/api/days/sync') return void (await handleSync(req, res, config))
      if (path === '/api/days/timetable-ocr') return void (await handleOcr(req, res, config))
      if (path.startsWith('/api/days/files')) return void (await handleFiles(req, res, url, config))
      if (path === '/api/days/admin/me' && req.method === 'GET') return void (await handleAdminMe(req, res, config))
      if (path === '/api/days/admin/integrations') return void (await handleIntegrations(req, res, config))
      if (path === '/api/days/admin/integrations/account/test' && req.method === 'POST') {
        return void (await handleAccountProbe(req, res, config))
      }
      if (path === '/api/days/admin/integrations/platform/test' && req.method === 'POST') {
        return void (await handlePlatformProbe(req, res, config))
      }
      sendJson(res, 404, { error: 'not_found' })
    } catch (error) {
      if (error instanceof Error && error.message === 'TOO_LARGE') {
        sendJson(res, 413, { error: 'too_large' })
        return
      }
      log('error', 'request failed', { path, method: req.method, reason: error instanceof Error ? error.message : 'error' })
      sendJson(res, 500, { error: 'server_error' })
    }
  })
}

export { loadConfig }
