import { useEffect, useRef, useState } from 'react'
import type { AccountSyncState } from '../hooks/useAccountSync'
import type { AppData } from '../types'

const ACCOUNT_CENTER_URL = 'https://account.yydsxwh.com'

const STATE_TEXT: Record<AccountSyncState['status'], string> = {
  checking: '正在检查登录…',
  'signed-out': '未登录，数据只存在这台设备',
  syncing: '正在同步…',
  synced: '已同步到云端',
  error: '同步出错，改动已保存在本机',
}

function syncTone(status: AccountSyncState['status']): string {
  if (status === 'error') return 'warn'
  if (status === 'syncing' || status === 'checking') return 'busy'
  if (status === 'synced') return 'ok'
  return 'idle'
}

function avatarInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? [...trimmed][0].toUpperCase() : '我'
}

export default function AccountCenter({ account, data }: { account: AccountSyncState; data: AppData }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onAway = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onAway)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onAway)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const { user, status, notice, sync, signOut, startLogin } = account
  const tone = syncTone(status)

  if (!user) {
    return (
      <div className="account-wrap" ref={wrapRef}>
        <button className="btn primary slim" type="button" onClick={() => startLogin()}>
          {status === 'checking' ? '检查登录中…' : '登录'}
        </button>
      </div>
    )
  }

  const name = user.displayName ?? user.email ?? '我'
  const counts = [
    { label: '待办', value: data.todos.filter((t) => !t.done).length },
    { label: '倒数日', value: data.countdowns.length },
    { label: '便签', value: data.notes.length },
    { label: '课程', value: data.courses.length },
    { label: '考试', value: data.exams.length },
  ]

  return (
    <div className="account-wrap" ref={wrapRef}>
      <button
        className="avatar-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`个人中心：${name}`}
        title={name}
      >
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span className="avatar-initial">{avatarInitial(name)}</span>}
        <span className={`avatar-dot ${tone}`} aria-hidden />
      </button>

      {open && (
        <div className="account-panel" role="dialog" aria-label="个人中心">
          <header className="account-head">
            {user.avatarUrl ? (
              <img className="account-face" src={user.avatarUrl} alt="" />
            ) : (
              <span className="account-face initial">{avatarInitial(name)}</span>
            )}
            <div>
              <strong>{name}</strong>
              <p className="muted">统一账号 · 颗秒日事</p>
            </div>
          </header>

          <div className={`sync-line ${tone}`}>
            <span className="sync-dot" aria-hidden />
            <div>
              <strong>{STATE_TEXT[status]}</strong>
              {notice && <p className="muted">{notice}</p>}
            </div>
          </div>

          <p className="account-hint">改动会自动保存到日事云端，其他设备登录同一个账号后可以继续使用。</p>

          <button className="btn primary block" onClick={() => void sync()} disabled={status === 'syncing' || status === 'checking'}>
            {status === 'syncing' ? '同步中…' : '立即同步'}
          </button>

          <dl className="account-stats">
            {counts.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>{c.value}</dd>
              </div>
            ))}
          </dl>

          <div className="account-links">
            <a href={ACCOUNT_CENTER_URL} target="_blank" rel="noreferrer">
              账号中心设置
            </a>
            <button type="button" onClick={() => void signOut()}>退出登录</button>
          </div>
        </div>
      )}
    </div>
  )
}
