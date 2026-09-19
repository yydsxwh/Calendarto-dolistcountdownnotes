/**
 * 本地自测：起一个假的主站会话接口 + 真的同步服务，把真实客户端会走的路径全跑一遍。
 * 不依赖测试框架，`node server/days-sync/selftest.mjs` 就能跑。
 */
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const SESSION_PORT = 3911
const SYNC_PORT = 3912
const BASE = `http://127.0.0.1:${SYNC_PORT}`
const ORIGIN = 'https://www.yydsxwh.com'

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name} ${detail}`)
  }
}

/** 假主站：cookie 里带 who=<id> 就认为是那个用户，其它一律未登录。 */
const sessionServer = createServer((req, res) => {
  const cookie = req.headers.cookie || ''
  const match = /who=([^;]+)/.exec(cookie)
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(match ? { user: { id: match[1], name: 'Tester', avatarUrl: '' } } : { user: null }))
})

const get = (cookie) => fetch(`${BASE}/api/days/sync`, { headers: cookie ? { cookie } : {} })
const put = (cookie, data, baseVersion, origin = ORIGIN) =>
  fetch(`${BASE}/api/days/sync`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ data, baseVersion }),
  })

const dataDir = await mkdtemp(join(tmpdir(), 'days-sync-'))
await new Promise((resolve) => sessionServer.listen(SESSION_PORT, '127.0.0.1', resolve))

const child = spawn(process.execPath, [new URL('./index.mjs', import.meta.url).pathname], {
  env: {
    ...process.env,
    DAYS_SYNC_PORT: String(SYNC_PORT),
    DAYS_SYNC_DATA_DIR: dataDir,
    DAYS_SYNC_SESSION_URL: `http://127.0.0.1:${SESSION_PORT}/api/auth/session`,
  },
  stdio: ['ignore', 'pipe', 'inherit'],
})
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('service did not start')), 8000)
  child.stdout.on('data', (buf) => {
    if (buf.toString().includes('days sync listening')) {
      clearTimeout(timer)
      resolve()
    }
  })
})

try {
  console.log('health + 未登录')
  check('health 返回 ok', (await (await fetch(`${BASE}/api/days/health`)).json()).ok === true)
  check('未登录 GET 返回 401', (await get()).status === 401)
  check('未登录 PUT 返回 401', (await put(undefined, { todos: [] }, 0)).status === 401)

  console.log('单个用户的读写')
  const alice = 'who=alice'
  const first = await get(alice)
  const firstBody = await first.json()
  check('新用户拿到空快照', first.status === 200 && firstBody.data === null && firstBody.version === 0)

  const wrote = await put(alice, { todos: [{ id: 't1', title: '买菜' }] }, 0)
  const wroteBody = await wrote.json()
  check('第一次写入版本变 1', wrote.status === 200 && wroteBody.version === 1)

  const readBack = await (await get(alice)).json()
  check('读回刚写的内容', readBack.data.todos[0].title === '买菜' && readBack.version === 1)

  console.log('乐观并发')
  const stale = await put(alice, { todos: [] }, 0)
  check('用过期版本写入被拒 409', stale.status === 409)
  const staleBody = await stale.json()
  check('409 带回服务端现状供合并', staleBody.version === 1 && staleBody.data.todos[0].title === '买菜')
  const fresh = await put(alice, { todos: [{ id: 't1', title: '买菜' }, { id: 't2', title: '写周报' }] }, 1)
  check('用正确版本写入成功', fresh.status === 200 && (await fresh.json()).version === 2)

  console.log('用户之间互相隔离')
  const bob = 'who=bob'
  const bobRead = await (await get(bob)).json()
  check('另一个用户看不到别人的数据', bobRead.data === null && bobRead.version === 0)
  await put(bob, { todos: [{ id: 'b1', title: 'bob 的事' }] }, 0)
  const aliceAgain = await (await get(alice)).json()
  check('写 bob 不影响 alice', aliceAgain.data.todos.length === 2)
  check('客户端传的身份被忽略', (await (await get(bob)).json()).data.todos[0].title === 'bob 的事')

  console.log('防护')
  check('跨站来源写入被拒', (await put(alice, { todos: [] }, 2, 'https://evil.example')).status === 403)
  check('非法方法被拒', (await fetch(`${BASE}/api/days/sync`, { method: 'DELETE' })).status === 405)
  check('未知路径 404', (await fetch(`${BASE}/api/days/nope`)).status === 404)
  const badJson = await fetch(`${BASE}/api/days/sync`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: alice },
    body: '{not json',
  })
  check('坏 JSON 返回 400', badJson.status === 400)
  const noData = await fetch(`${BASE}/api/days/sync`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: alice },
    body: JSON.stringify({ baseVersion: 2 }),
  })
  check('缺 data 返回 400', noData.status === 400)
} finally {
  child.kill('SIGTERM')
  sessionServer.close()
  await rm(dataDir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\ndays-sync selftest ok' : `\ndays-sync selftest FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
