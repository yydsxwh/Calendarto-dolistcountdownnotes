import { isNativeApp } from './native'
import { getNativeSessionToken } from './native-auth'

export const DAYS_API_ORIGIN = 'https://www.yydsxwh.com'

export function daysApiUrl(path: string): string {
  if (typeof window === 'undefined') return `${DAYS_API_ORIGIN}${path}`
  if (isNativeApp()) return `${DAYS_API_ORIGIN}${path}`
  const { protocol, origin } = window.location
  if (protocol === 'http:' || protocol === 'https:') return `${origin}${path}`
  return `${DAYS_API_ORIGIN}${path}`
}

export async function daysFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = await getNativeSessionToken()
  if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
  return fetch(daysApiUrl(path), {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
    cache: init.cache ?? 'no-store',
  })
}
