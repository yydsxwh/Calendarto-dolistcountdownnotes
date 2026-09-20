import { useEffect, useState } from 'react'
import { daysFetch } from '../lib/days-api'
import { loginUrl } from '../lib/site-session'

type SecretHint = { configured: boolean; hint: string }
type Check = { name: string; ok: boolean; detail: string }

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
  encryptionKeyConfigured: boolean
}

function secretLabel(hint: SecretHint) {
  if (!hint.configured) return '未配置'
  return hint.hint ? `已配置 ${hint.hint}` : '已配置'
}

export default function AdminIntegrations() {
  const [status, setStatus] = useState<'loading' | 'signin' | 'forbidden' | 'ready'>('loading')
  const [data, setData] = useState<Integrations | null>(null)
  const [account, setAccount] = useState({ issuer: '', clientId: 'rishi', clientSecret: '', redirectUri: '', scopes: '', enabled: true })
  const [platform, setPlatform] = useState({ apiUrl: '', clientId: 'rishi', serviceToken: '', enabled: true })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [accountChecks, setAccountChecks] = useState<Check[]>([])
  const [platformChecks, setPlatformChecks] = useState<Check[]>([])
  const [saving, setSaving] = useState(false)

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
      setError('读取集成设置失败')
      setStatus('ready')
      return
    }
    const body = (await res.json()) as Integrations
    setData(body)
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

  async function save() {
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
      setData(body)
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
            <h2>集成设置</h2>
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
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">设</span>
          <div>
            <strong>集成设置</strong>
            <p>站长专用 · Account / Platform</p>
          </div>
        </div>
        <a className="btn ghost" href="#today">
          返回日事
        </a>
      </header>
      <main className="main admin-integrations">
        {error ? <p className="muted">{error}</p> : null}
        {notice ? <p className="muted">{notice}</p> : null}
        {data && !data.encryptionKeyConfigured ? (
          <p className="muted">服务器还没配 RISHI_CONFIG_ENCRYPTION_KEY，保存会被拒绝。</p>
        ) : null}

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
            <button className="btn primary" type="button" onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '保存 Account'}
            </button>
            <button className="btn ghost" type="button" onClick={() => void testAccount()}>
              测试连接
            </button>
          </div>
          <ul className="mini-list">
            {accountChecks.map((item) => (
              <li key={item.name}>
                {item.ok ? '✓' : '✗'} {item.name} · {item.detail}
              </li>
            ))}
          </ul>
        </section>

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
            <button className="btn primary" type="button" onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '保存 Platform'}
            </button>
            <button className="btn ghost" type="button" onClick={() => void testPlatform()}>
              测试连接
            </button>
          </div>
          <ul className="mini-list">
            {platformChecks.map((item) => (
              <li key={item.name}>
                {item.ok ? '✓' : '✗'} {item.name} · {item.detail}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
