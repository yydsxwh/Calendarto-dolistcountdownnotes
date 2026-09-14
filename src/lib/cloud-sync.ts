import type { AppData } from '../types'

export const ACCOUNT_CENTER_URL = (import.meta.env.VITE_ACCOUNT_CENTER_URL || 'https://account.yydsxwh.com').replace(/\/$/, '')
export const DAYS_SYNC_URL = `${ACCOUNT_CENTER_URL}/api/products/days/sync`

export type SyncResult = {
  authenticated: boolean
  data: AppData | null
  version: number
  updatedAt: string | null
  user?: { id: string; name: string; email: string; avatarUrl?: string }
}

export async function pullDaysData(): Promise<SyncResult> {
  const response = await fetch(DAYS_SYNC_URL, { credentials: 'include', cache: 'no-store' })
  if (response.status === 401) return { authenticated: false, data: null, version: 0, updatedAt: null }
  if (!response.ok) throw new Error(`SYNC_GET_${response.status}`)
  return response.json() as Promise<SyncResult>
}

export async function pushDaysData(data: AppData, baseVersion: number): Promise<{ version: number; updatedAt: string }> {
  const response = await fetch(DAYS_SYNC_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, baseVersion }),
  })
  if (response.status === 401) throw new Error('UNAUTHORIZED')
  if (response.status === 409) throw new Error('VERSION_CONFLICT')
  if (!response.ok) throw new Error(`SYNC_POST_${response.status}`)
  return response.json()
}

export function loginUrl(): string {
  return `${ACCOUNT_CENTER_URL}/login?next=${encodeURIComponent(window.location.href)}`
}
