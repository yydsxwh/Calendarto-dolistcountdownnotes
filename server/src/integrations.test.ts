import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { decryptJson, encryptJson, secretHint } from './crypto'
import { createDaysServer } from './index'
import { loadConfig } from './config'
import { probeAccount, probePlatform } from './integration-probe'
import { issueSession } from './session'

const BFF_PORT = 3932
const FAKE_PORT = 3933

let dataDir = ''
let bff: ReturnType<typeof createServer>
let fake: ReturnType<typeof createServer>
let config: ReturnType<typeof loadConfig>

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rishi-admin-'))
  fake = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${FAKE_PORT}`)
    if (url.pathname === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        issuer: `http://127.0.0.1:${FAKE_PORT}`,
        authorization_endpoint: `http://127.0.0.1:${FAKE_PORT}/api/oauth/authorize`,
        token_endpoint: `http://127.0.0.1:${FAKE_PORT}/api/oauth/token`,
        jwks_uri: `http://127.0.0.1:${FAKE_PORT}/.well-known/jwks.json`,
        code_challenge_methods_supported: ['S256'],
        id_token_signing_alg_values_supported: ['RS256'],
      }))
      return
    }
    if (url.pathname === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [{ kty: 'RSA', alg: 'RS256', kid: 't' }] }))
      return
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (url.pathname === '/ready') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ready' }))
      return
    }
    if (url.pathname === '/v1/catalog/products') {
      const auth = req.headers.authorization || ''
      if (auth !== 'Bearer plat-token') {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '缺少服务凭证' } }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ products: [] }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => fake.listen(FAKE_PORT, '127.0.0.1', resolve))

  config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DAYS_SYNC_HOST: '127.0.0.1',
    DAYS_SYNC_PORT: String(BFF_PORT),
    DAYS_SYNC_DATA_DIR: dataDir,
    DAYS_SYNC_ALLOWED_ORIGINS: `http://127.0.0.1:${BFF_PORT}`,
    RISHI_PUBLIC_ORIGIN: `http://127.0.0.1:${BFF_PORT}`,
    RISHI_SESSION_SECRET: 'test-session-secret',
    RISHI_CONFIG_ENCRYPTION_KEY: 'test-config-key',
    RISHI_ADMIN_SUBS: 'usr_admin',
    ACCOUNT_ISSUER: `http://127.0.0.1:${FAKE_PORT}`,
    ACCOUNT_CLIENT_ID: 'rishi',
    ACCOUNT_CLIENT_SECRET: 'ys_old_secret',
    ACCOUNT_REDIRECT_URI: `http://127.0.0.1:${BFF_PORT}/api/days/auth/callback`,
    PLATFORM_API_URL: `http://127.0.0.1:${FAKE_PORT}`,
    PLATFORM_SERVICE_TOKEN: 'plat-token',
    PLATFORM_CLIENT_ID: 'rishi',
  })
  bff = createDaysServer(config)
  await new Promise<void>((resolve) => bff.listen(BFF_PORT, '127.0.0.1', resolve))
})

after(async () => {
  await new Promise((resolve) => bff.close(resolve))
  await new Promise((resolve) => fake.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
})

function cookieFor(sub: string) {
  return `rishi_session=${issueSession({ sub, name: sub, email: '', avatarUrl: '' }, config).token}`
}

test('encryptJson 往返，明文不出现在密文里', () => {
  const secret = 'ys_super_secret'
  const packed = encryptJson({ ACCOUNT_CLIENT_SECRET: secret }, 'key')
  assert.equal(packed.includes(secret), false)
  assert.deepEqual(decryptJson(packed, 'key'), { ACCOUNT_CLIENT_SECRET: secret })
  assert.equal(secretHint(secret).configured, true)
  assert.equal(secretHint(secret).hint.endsWith('cret'), true)
  assert.equal(secretHint(secret).hint.includes('ys_super'), false)
})

test('非站长不能读集成设置', async () => {
  const anon = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/admin/integrations`)
  assert.equal(anon.status, 401)
  const user = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/admin/integrations`, {
    headers: { cookie: cookieFor('usr_student') },
  })
  assert.equal(user.status, 403)
})

test('GET 不返回 secret 明文，PUT 后仍只显示已配置', async () => {
  const cookie = cookieFor('usr_admin')
  const first = await (await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/admin/integrations`, { headers: { cookie } })).json() as {
    account: { clientSecret: { configured: boolean; hint: string } }
    platform: { serviceToken: { configured: boolean; hint: string } }
  }
  const text = JSON.stringify(first)
  assert.equal(text.includes('ys_old_secret'), false)
  assert.equal(text.includes('plat-token'), false)
  assert.equal(first.account.clientSecret.configured, true)
  assert.equal(first.platform.serviceToken.configured, true)

  const saved = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/admin/integrations`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      account: { clientSecret: 'ys_new_secret', enabled: true, issuer: `http://127.0.0.1:${FAKE_PORT}` },
      platform: { serviceToken: 'plat-new', enabled: true },
    }),
  })
  assert.equal(saved.status, 200)
  const body = await saved.json() as {
    account: { clientSecret: { configured: boolean; hint: string } }
    platform: { serviceToken: { configured: boolean; hint: string } }
  }
  const savedText = JSON.stringify(body)
  assert.equal(savedText.includes('ys_new_secret'), false)
  assert.equal(savedText.includes('plat-new'), false)
  assert.equal(body.account.clientSecret.configured, true)
  assert.ok(body.account.clientSecret.hint.endsWith('cret'))
  assert.equal(config.accountClientSecret, 'ys_new_secret')
})

test('Account / Platform 测试连接覆盖 discovery 与服务身份', async () => {
  const account = await probeAccount({
    issuer: `http://127.0.0.1:${FAKE_PORT}`,
    clientId: 'rishi',
    redirectUri: `http://127.0.0.1:${BFF_PORT}/api/days/auth/callback`,
  })
  assert.equal(account.ok, true)
  for (const name of ['discovery', 'issuer', 'authorize', 'token', 'jwks', 'rs256', 'pkce_s256']) {
    assert.ok(account.checks.some((item) => item.name === name && item.ok), name)
  }

  const platform = await probePlatform({
    apiUrl: `http://127.0.0.1:${FAKE_PORT}`,
    serviceToken: 'plat-token',
    clientId: 'rishi',
  })
  assert.equal(platform.ok, true)
  assert.ok(platform.checks.some((item) => item.name === 'health' && item.ok))
  assert.ok(platform.checks.some((item) => item.name === 'ready' && item.ok))
  assert.ok(platform.checks.some((item) => item.name === 'service_auth' && item.ok))

  const bad = await probePlatform({
    apiUrl: `http://127.0.0.1:${FAKE_PORT}`,
    serviceToken: 'wrong',
    clientId: 'rishi',
  })
  assert.equal(bad.ok, false)
})

test('BFF 测试连接接口也要站长身份', async () => {
  const denied = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/admin/integrations/account/test`, { method: 'POST' })
  assert.equal(denied.status, 401)
  const ok = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/admin/integrations/account/test`, {
    method: 'POST',
    headers: { cookie: cookieFor('usr_admin') },
  })
  assert.equal(ok.status, 200)
})
