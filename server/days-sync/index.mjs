/**
 * 颗秒日事 · 云同步服务
 *
 * 一个只做一件事的小服务：把每个用户的日事数据存在服务器上，让同一个账号在任何
 * 设备上看到同样的内容。
 *
 * 身份完全不自己判断 —— 把浏览器带来的 Cookie 原样转给主站的
 * GET /api/auth/session，主站说这是谁就是谁。所以这里不存密码、不发 token、
 * 也不碰账号中心。客户端传来的任何 userId 一律忽略。
 *
 * 只用 Node 内置模块，没有 npm 依赖，方便在生产机上安全地起停。
 */
import { createServer } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

const PORT = Number(process.env.DAYS_SYNC_PORT || 3120)
const HOST = process.env.DAYS_SYNC_HOST || '127.0.0.1'
const DATA_DIR = process.env.DAYS_SYNC_DATA_DIR || '/var/lib/kemiao-days'
const SESSION_URL = process.env.DAYS_SYNC_SESSION_URL || 'https://www.yydsxwh.com/api/auth/session'
/** 只接受来自这些站点的写请求，挡住跨站伪造。 */
const ALLOWED_ORIGINS = (process.env.DAYS_SYNC_ALLOWED_ORIGINS || 'https://www.yydsxwh.com')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
/** 一份日事数据再大也就几百 KB，给 4MB 足够，同时挡住撑爆磁盘的请求。 */
const MAX_BODY_BYTES = 4 * 1024 * 1024
const SESSION_TTL_MS = 10_000

const log = (level, message, extra = {}) => {
  // 绝不记录 Cookie、请求体或用户内容，只记录足够定位问题的元数据。
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), level, message, ...extra })}\n`)
}

/** 用户 id 只用来拼文件名，哈希一下避免奇怪字符走到路径里。 */
const userFile = (userId) => join(DATA_DIR, `${createHash('sha256').update(userId).digest('hex')}.json`)

async function readRecord(userId) {
  try {
    const raw = await readFile(userFile(userId), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      data: parsed.data ?? null,
      version: Number(parsed.version) || 0,
      updatedAt: parsed.updatedAt ?? null,
    }
  } catch (error) {
    if (error.code === 'ENOENT') return { data: null, version: 0, updatedAt: null }
    throw error
  }
}

async function writeRecord(userId, record) {
  const target = userFile(userId)
  await mkdir(dirname(target), { recursive: true })
  // 先写临时文件再改名：断电或崩溃都不会留下半截 JSON。
  const temp = `${target}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(record), 'utf8')
  await rename(temp, target)
}

/** 同一个 cookie 短时间内重复请求时不必每次都问主站。 */
const sessionCache = new Map()

async function resolveUser(cookie) {
  if (!cookie) return null
  const key = createHash('sha256').update(cookie).digest('hex')
  const cached = sessionCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.user

  let response
  try {
    response = await fetch(SESSION_URL, {
      headers: { cookie, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
  } catch (error) {
    log('warn', 'session lookup failed', { reason: error.name })
    throw new Error('SESSION_UNAVAILABLE')
  }
  if (!response.ok) throw new Error('SESSION_UNAVAILABLE')

  const body = await response.json().catch(() => ({}))
  const user = body?.user?.id ? { id: String(body.user.id) } : null
  sessionCache.set(key, { user, expires: Date.now() + SESSION_TTL_MS })
  if (sessionCache.size > 500) sessionCache.clear()
  return user
}

const sendJson = (res, status, payload, extraHeaders = {}) => {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/api/days/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (path !== '/api/days/sync') {
    sendJson(res, 404, { error: 'not_found' })
    return
  }

  if (req.method !== 'GET' && req.method !== 'PUT') {
    sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET, PUT' })
    return
  }

  // 写操作要求同站来源：cookie 认证的接口必须自己挡 CSRF。
  if (req.method === 'PUT') {
    const origin = req.headers.origin
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      sendJson(res, 403, { error: 'bad_origin' })
      return
    }
  }

  let user
  try {
    user = await resolveUser(req.headers.cookie)
  } catch {
    // 主站临时不可用时说清楚是上游问题，客户端会退到本地模式而不是清空数据。
    sendJson(res, 503, { error: 'session_unavailable' })
    return
  }
  if (!user) {
    sendJson(res, 401, { authenticated: false, data: null, version: 0, updatedAt: null })
    return
  }

  try {
    if (req.method === 'GET') {
      const record = await readRecord(user.id)
      sendJson(res, 200, { authenticated: true, ...record })
      return
    }

    const raw = await readBody(req)
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      sendJson(res, 400, { error: 'bad_json' })
      return
    }
    if (!payload || typeof payload.data !== 'object' || payload.data === null) {
      sendJson(res, 400, { error: 'bad_payload' })
      return
    }

    const current = await readRecord(user.id)
    const baseVersion = Number(payload.baseVersion) || 0
    if (current.version !== baseVersion) {
      // 别的设备先写了。把服务端现状原样回给客户端去合并，不擅自覆盖。
      sendJson(res, 409, { authenticated: true, ...current })
      return
    }

    const next = {
      data: payload.data,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    }
    await writeRecord(user.id, next)
    sendJson(res, 200, { version: next.version, updatedAt: next.updatedAt })
  } catch (error) {
    if (error.message === 'TOO_LARGE') {
      sendJson(res, 413, { error: 'too_large' })
      return
    }
    log('error', 'request failed', { method: req.method, reason: error.message })
    sendJson(res, 500, { error: 'server_error' })
  }
})

await mkdir(DATA_DIR, { recursive: true })
server.listen(PORT, HOST, () => log('info', 'days sync listening', { host: HOST, port: PORT, dataDir: DATA_DIR }))

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    log('info', 'shutting down', { signal })
    server.close(() => process.exit(0))
  })
}
