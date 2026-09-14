import { useEffect, useRef, useState } from 'react'
import type { AppData } from '../types'
import { loginUrl, pullDaysData, pushDaysData } from '../lib/cloud-sync'

type Props = { data: AppData; replace: (next: AppData) => void }

export default function AccountSync({ data, replace }: Props) {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [status, setStatus] = useState<'checking'|'offline'|'syncing'|'synced'|'error'>('checking')
  const [version, setVersion] = useState(0)
  const hydrated = useRef(false)
  const timer = useRef<number | null>(null)

  const pull = async () => {
    setStatus('syncing')
    try {
      const result = await pullDaysData()
      if (!result.authenticated) {
        setUser(null); setStatus('offline'); hydrated.current = true; return
      }
      setUser(result.user ? { name: result.user.name, email: result.user.email } : null)
      setVersion(result.version)
      if (result.data) replace(result.data)
      hydrated.current = true
      setStatus('synced')
    } catch {
      hydrated.current = true
      setStatus('error')
    }
  }

  useEffect(() => { void pull() }, [])

  useEffect(() => {
    if (!hydrated.current || !user) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      setStatus('syncing')
      try {
        const result = await pushDaysData(data, version)
        setVersion(result.version)
        setStatus('synced')
      } catch (error) {
        if (error instanceof Error && error.message === 'VERSION_CONFLICT') {
          // Another client changed the account. Pull the server snapshot and make it the canonical state.
          try { await pull() } catch { setStatus('error') }
        } else if (error instanceof Error && error.message === 'UNAUTHORIZED') {
          setUser(null); setStatus('offline')
        } else setStatus('error')
      }
    }, 1200)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [data, user, version])

  if (!user) {
    return <button onClick={() => { window.location.href = loginUrl() }}>登录/注册账号中心</button>
  }

  const label = status === 'syncing' ? '同步中…' : status === 'error' ? '同步失败，重试' : '已同步'
  return <>
    <span className="sync-status" title={user.email}>☁️ {user.name} · {label}</span>
    <button onClick={() => void pull()}>立即同步</button>
  </>
}
