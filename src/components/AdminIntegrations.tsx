import { useEffect, useMemo, useState } from 'react'
import { daysFetch } from '../lib/days-api'
import { loginUrl } from '../lib/site-session'

type SecretHint = { configured: boolean; hint: string }
type Check = { name: string; ok: boolean; detail: string }
type AdminSection = 'overview' | 'account' | 'platform' | 'apis'

type ProductApiView = {
  id: string
  name: string
  baseUrl: string
  authType: 'bearer' | 'header'
  headerName: string
  secret: SecretHint
  testPath: string
  enabled: boolean
}

type Integrations = {
  account: {
    issuer: string
    clientId: string
    clientSecret: SecretHint
    redirectUri: string
    scopes: string
    enabled: boolean
  }
  platform: {
    apiUrl: string
    clientId: string
    serviceToken: SecretHint
    enabled: boolean
  }
  apis: ProductApiView[]
  encryptionKeyConfigured: boolean
}

const NAV: { id: AdminSection; href: string; label: string; hint: string }[] = [
  { id: 'overview', href: '#admin', label: '概览', hint: '接入状态' },
  { id: 'account', href: '#admin/account', label: 'Account', hint: '账号中心' },
  { id: 'platform', href: '#admin/platform', label: 'Platform', hint: '公共后端' },
  { id: 'apis', href: '#admin/apis', label: '产品 API', hint: '密钥与接口' },
]

function parseSection(): AdminSection {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === 'admin/account' || hash === 'admin/integrations') return 'account'
  if (hash === 'admin/platform') return 'platform'
  if (hash === 'admin/apis' || hash === 'admin/integrations/apis') return 'apis'
  return 'overview'
}

function secretLabel(hint: SecretHint) {
  if (!hint.configured) return '未配置'
  return hint.hint ? `已配置 ${hint.hint}` : '已配置'
}

type ApiDraft = {
  id: string
  name: string
  baseUrl: string
  authType: 'bearer' | 'header'
  headerName: string
  secret: string
  testPath: string
  enabled: boolean
}

function emptyApiDraft(): ApiDraft {
  return {
    id: '',
    name: '',
    baseUrl: '',
    authType: 'bearer',
    headerName: 'Authorization',
    secret: '',
    testPath: '/health',
    enabled: true,
  }
}

function Checks({ items }: { items: Check[] }) {
  if (!items.length) return null
  return (
    <ul className="mini-list">
      {items.map((item) => (
        <li key={item.name}>
          {item.ok ? '✓' : '✗'} {item.name} · {item.detail}
        </li>
      ))}
    </ul>
  )
}

export default function AdminIntegrations() {
  const [section, setSection] = useState<AdminSection>(parseSection)
  const [status, setStatus] = useState<'loading' | 'signin' | 'forbidden' | 'ready'>('loading')
  const [data, setData] = useState<Integrations | null>(null)
  const [account, setAccount] = useState({ issuer: '', clientId: 'rishi', clientSecret: '', redirectUri: '', scopes: '', enabled: true })
  const [platform, setPlatform] = useState({ apiUrl: '', clientId: 'rishi', serviceToken: '', enabled: true })
  const [draft, setDraft] = useState(emptyApiDraft)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [accountChecks, setAccountChecks] = useState<Check[]>([])
  const [platformChecks, setPlatformChecks] = useState<Check[]>([])
  const [apiChecks, setApiChecks] = useState<Record<string, Check[]>>({})
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setSection(parseSection())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  async function load() {
    const res = await daysFetch('/api/days/admin/integrations')
    if (res.status === 401) {
      setStatus('signin')
      return
    }
    if (res.status === 403) {
      setStatus('forbidden')
      return
    }
    if (!res.ok) {
      setError('读取管理后台失败')
      setStatus('ready')
      return
    }
    const body = (await res.json()) as Integrations
    setData({ ...body, apis: body.apis || [] })
    setAccount({
      issuer: body.account.issuer,
      clientId: body.account.clientId || 'rishi',
      clientSecret: '',
      redirectUri: body.account.redirectUri,
      scopes: body.account.scopes,
      enabled: body.account.enabled,
    })
    setPlatform({
      apiUrl: body.platform.apiUrl,
      clientId: body.platform.clientId || 'rishi',
      serviceToken: '',
      enabled: body.platform.enabled,
    })
    setStatus('ready')
  }

  useEffect(() => {
    void load()
  }, [])

  const summary = useMemo(() => {
    const apis = data?.apis || []
    return {
      account: data?.account.enabled ? '已接入' : '未启用',
      platform: data?.platform.enabled ? '已接入' : '未启用',
      apis: `${apis.filter((item) => item.enabled).length} / ${apis.length} 启用`,
    }
  }, [data])

  async function saveCore() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const res = await daysFetch('/api/days/admin/integrations', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          account: {
            issuer: account.issuer,
            clientId: account.clientId,
            clientSecret: account.clientSecret,
            redirectUri: account.redirectUri,
            scopes: account.scopes,
            enabled: account.enabled,
          },
          platform: {
            apiUrl: platform.apiUrl,
            clientId: platform.clientId,
            serviceToken: platform.serviceToken,
            enabled: platform.enabled,
          },
        }),
      })
      const body = (await res.json()) as Integrations & { message?: string; error?: string }
      if (!res.ok) {
        setError(body.message || body.error || '保存失败')
        return
      }
      setData({ ...body, apis: body.apis || [] })
      setAccount((prev) => ({ ...prev, clientSecret: '' }))
      setPlatform((prev) => ({ ...prev, serviceToken: '' }))
      setNotice('已保存。密钥只写不读，页面不再显示明文。')
    } catch {
      setError('保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function testAccount() {
    setAccountChecks([])
    const res = await daysFetch('/api/days/admin/integrations/account/test', { method: 'POST' })
    const body = (await res.json()) as { checks?: Check[]; error?: string; message?: string }
    setAccountChecks(body.checks || [{ name: 'account', ok: false, detail: body.message || body.error || '测试失败' }])
  }

  async function testPlatform() {
    setPlatformChecks([])
    const res = await daysFetch('/api/days/admin/integrations/platform/test', { method: 'POST' })
    const body = (await res.json()) as { checks?: Check[]; error?: string; message?: string }
    setPlatformChecks(body.checks || [{ name: 'platform', ok: false, detail: body.message || body.error || '测试失败' }])
  }

  function startEdit(api: ProductApiView) {
    setEditingId(api.id)
    setDraft({
      id: api.id,
      name: api.name,
      baseUrl: api.baseUrl,
      authType: api.authType,
      headerName: api.headerName,
      secret: '',
      testPath: api.testPath,
      enabled: api.enabled,
    })
    setNotice('')
    setError('')
  }

  function startCreate() {
    setEditingId(null)
    setDraft(emptyApiDraft())
    setNotice('')
    setError('')
  }

  async function saveApi() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const path = editingId
        ? `/api/days/admin/integrations/apis/${encodeURIComponent(editingId)}`
        : '/api/days/admin/integrations/apis'
      const res = await daysFetch(path, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: draft.id || undefined,
          name: draft.name,
          baseUrl: draft.baseUrl,
          authType: draft.authType,
          headerName: draft.headerName,
          secret: draft.secret,
          testPath: draft.testPath,
          enabled: draft.enabled,
        }),
      })
      const body = (await res.json()) as { api?: ProductApiView; message?: string; error?: string }
      if (!res.ok) {
        setError(body.message || body.error || '保存接口失败')
        return
      }
      await load()
      setDraft(emptyApiDraft())
      setEditingId(null)
      setNotice('产品接口已保存。密钥只写不读。')
    } catch {
      setError('保存接口失败')
    } finally {
      setSaving(false)
    }
  }

  async function removeApi(id: string) {
    if (!confirm('删除这条产品接口？密钥会一起清掉。')) return
    const res = await daysFetch(`/api/days/admin/integrations/apis/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = (await res.json()) as { message?: string; error?: string }
      setError(body.message || body.error || '删除失败')
      return
    }
    if (editingId === id) {
      setEditingId(null)
      setDraft(emptyApiDraft())
    }
    await load()
    setNotice('已删除产品接口')
  }

  async function testApi(id: string) {
    const res = await daysFetch(`/api/days/admin/integrations/apis/${encodeURIComponent(id)}/test`, { method: 'POST' })
    const body = (await res.json()) as { checks?: Check[]; error?: string; message?: string }
    setApiChecks((prev) => ({
      ...prev,
      [id]: body.checks || [{ name: 'api', ok: false, detail: body.message || body.error || '测试失败' }],
    }))
  }

  if (status === 'loading') {
    return (
      <div className="shell">
        <main className="main">
          <section className="view">
            <p className="muted">正在检查站长权限…</p>
          </section>
        </main>
      </div>
    )
  }

  if (status === 'signin') {
    return (
      <div className="shell">
        <main className="main">
          <section className="view card">
            <h2>日事管理后台</h2>
            <p className="muted">请先用账号中心登录，再进入站长设置。</p>
            <a className="btn primary" href={loginUrl()}>
              登录
            </a>
          </section>
        </main>
      </div>
    )
  }

  if (status === 'forbidden') {
    return (
      <div className="shell">
        <main className="main">
          <section className="view card">
            <h2>仅站长可进入</h2>
            <p className="muted">把你的 usr_ 写进服务器 RISHI_ADMIN_SUBS，或使用账号中心 ADMIN 角色登录。</p>
            <a className="btn ghost" href="#today">
              返回日事
            </a>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="shell admin-shell">
      <aside className="admin-side">
        <div className="brand">
          <span className="mark">管</span>
          <div>
            <strong>日事后台</strong>
            <p>站长专用</p>
          </div>
        </div>
        <nav className="admin-nav" aria-label="管理后台">
          {NAV.map((item) => (
            <a key={item.id} className={section === item.id ? 'active' : ''} href={item.href}>
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </a>
          ))}
        </nav>
        <a className="btn ghost" href="#today">
          返回日事
        </a>
      </aside>

      <main className="main admin-integrations">
        {error ? <p className="muted">{error}</p> : null}
        {notice ? <p className="muted">{notice}</p> : null}
        {data && !data.encryptionKeyConfigured ? (
          <p className="muted">服务器还没配 RISHI_CONFIG_ENCRYPTION_KEY，保存会被拒绝。</p>
        ) : null}

        {section === 'overview' ? (
          <section className="card col">
            <header className="card-head">
              <h2>接入概览</h2>
            </header>
            <p className="muted">这是颗秒日事自己的产品后台。密钥只写在这台 BFF 上，不进 Git、浏览器或 APK。</p>
            <div className="admin-overview">
              <a className="card col" href="#admin/account">
                <strong>Account</strong>
                <p>{summary.account}</p>
                <p className="muted">{data?.account.issuer || '未填 issuer'}</p>
              </a>
              <a className="card col" href="#admin/platform">
                <strong>Platform</strong>
                <p>{summary.platform}</p>
                <p className="muted">{data?.platform.apiUrl || '未填 API 地址'}</p>
              </a>
              <a className="card col" href="#admin/apis">
                <strong>产品 API</strong>
                <p>{summary.apis}</p>
                <p className="muted">OSS / 通义等密钥仍放 Platform，这里只接日事自己的接口。</p>
              </a>
            </div>
          </section>
        ) : null}

        {section === 'account' ? (
          <section className="card col">
            <header className="card-head">
              <h2>Account</h2>
              <label>
                <input
                  type="checkbox"
                  checked={account.enabled}
                  onChange={(e) => setAccount((prev) => ({ ...prev, enabled: e.target.checked }))}
                />{' '}
                启用
              </label>
            </header>
            <label>
              ACCOUNT_ISSUER
              <input className="input" value={account.issuer} onChange={(e) => setAccount((prev) => ({ ...prev, issuer: e.target.value }))} />
            </label>
            <label>
              ACCOUNT_CLIENT_ID
              <input className="input" value={account.clientId} onChange={(e) => setAccount((prev) => ({ ...prev, clientId: e.target.value }))} />
            </label>
            <label>
              ACCOUNT_CLIENT_SECRET（只写）
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder={data ? secretLabel(data.account.clientSecret) : '未配置'}
                value={account.clientSecret}
                onChange={(e) => setAccount((prev) => ({ ...prev, clientSecret: e.target.value }))}
              />
            </label>
            <label>
              ACCOUNT_REDIRECT_URI
              <input className="input" value={account.redirectUri} onChange={(e) => setAccount((prev) => ({ ...prev, redirectUri: e.target.value }))} />
            </label>
            <label>
              ACCOUNT_SCOPES
              <input className="input" value={account.scopes} onChange={(e) => setAccount((prev) => ({ ...prev, scopes: e.target.value }))} />
            </label>
            <div className="row wrap">
              <button className="btn primary" type="button" onClick={() => void saveCore()} disabled={saving}>
                {saving ? '保存中…' : '保存 Account'}
              </button>
              <button className="btn ghost" type="button" onClick={() => void testAccount()}>
                测试连接
              </button>
            </div>
            <Checks items={accountChecks} />
          </section>
        ) : null}

        {section === 'platform' ? (
          <section className="card col">
            <header className="card-head">
              <h2>Platform</h2>
              <label>
                <input
                  type="checkbox"
                  checked={platform.enabled}
                  onChange={(e) => setPlatform((prev) => ({ ...prev, enabled: e.target.checked }))}
                />{' '}
                启用
              </label>
            </header>
            <label>
              PLATFORM_API_URL
              <input className="input" value={platform.apiUrl} onChange={(e) => setPlatform((prev) => ({ ...prev, apiUrl: e.target.value }))} />
            </label>
            <label>
              PLATFORM_CLIENT_ID
              <input className="input" value={platform.clientId} onChange={(e) => setPlatform((prev) => ({ ...prev, clientId: e.target.value }))} />
            </label>
            <label>
              PLATFORM_SERVICE_TOKEN（只写）
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder={data ? secretLabel(data.platform.serviceToken) : '未配置'}
                value={platform.serviceToken}
                onChange={(e) => setPlatform((prev) => ({ ...prev, serviceToken: e.target.value }))}
              />
            </label>
            <div className="row wrap">
              <button className="btn primary" type="button" onClick={() => void saveCore()} disabled={saving}>
                {saving ? '保存中…' : '保存 Platform'}
              </button>
              <button className="btn ghost" type="button" onClick={() => void testPlatform()}>
                测试连接
              </button>
            </div>
            <Checks items={platformChecks} />
          </section>
        ) : null}

        {section === 'apis' ? (
          <>
            <section className="card col">
              <header className="card-head">
                <h2>{editingId ? `编辑 ${editingId}` : '新增产品接口'}</h2>
                {editingId ? (
                  <button className="btn ghost" type="button" onClick={startCreate}>
                    取消编辑
                  </button>
                ) : null}
              </header>
              <label>
                名称
                <input className="input" value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="例如 课表助手" />
              </label>
              <label>
                接口地址
                <input className="input" value={draft.baseUrl} onChange={(e) => setDraft((prev) => ({ ...prev, baseUrl: e.target.value }))} placeholder="https://api.example.com" />
              </label>
              <label>
                鉴权方式
                <select className="input" value={draft.authType} onChange={(e) => setDraft((prev) => ({ ...prev, authType: e.target.value === 'header' ? 'header' : 'bearer' }))}>
                  <option value="bearer">Bearer Token</option>
                  <option value="header">自定义请求头</option>
                </select>
              </label>
              {draft.authType === 'header' ? (
                <label>
                  请求头名
                  <input className="input" value={draft.headerName} onChange={(e) => setDraft((prev) => ({ ...prev, headerName: e.target.value }))} />
                </label>
              ) : null}
              <label>
                密钥（只写）
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  placeholder={editingId && data ? secretLabel(data.apis.find((item) => item.id === editingId)?.secret || { configured: false, hint: '' }) : '保存后不再回显'}
                  value={draft.secret}
                  onChange={(e) => setDraft((prev) => ({ ...prev, secret: e.target.value }))}
                />
              </label>
              <label>
                测试路径
                <input className="input" value={draft.testPath} onChange={(e) => setDraft((prev) => ({ ...prev, testPath: e.target.value }))} />
              </label>
              <label>
                <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))} /> 启用
              </label>
              <div className="row wrap">
                <button className="btn primary" type="button" onClick={() => void saveApi()} disabled={saving}>
                  {saving ? '保存中…' : editingId ? '保存修改' : '添加接口'}
                </button>
              </div>
            </section>

            <section className="card col">
              <header className="card-head">
                <h2>已接入接口</h2>
              </header>
              {(data?.apis || []).length === 0 ? <p className="muted">还没有产品接口。上面填名称、地址和密钥即可。</p> : null}
              <ul className="admin-api-list">
                {(data?.apis || []).map((api) => (
                  <li key={api.id} className="card col">
                    <header className="card-head">
                      <div>
                        <strong>{api.name}</strong>
                        <p className="muted">
                          {api.id} · {api.enabled ? '启用' : '停用'} · {secretLabel(api.secret)}
                        </p>
                      </div>
                    </header>
                    <p className="muted">{api.baseUrl}{api.testPath}</p>
                    <div className="row wrap">
                      <button className="btn ghost" type="button" onClick={() => startEdit(api)}>
                        编辑
                      </button>
                      <button className="btn ghost" type="button" onClick={() => void testApi(api.id)}>
                        测试连接
                      </button>
                      <button className="btn ghost" type="button" onClick={() => void removeApi(api.id)}>
                        删除
                      </button>
                    </div>
                    <Checks items={apiChecks[api.id] || []} />
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
