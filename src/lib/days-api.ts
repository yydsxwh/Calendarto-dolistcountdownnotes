import { isNativeApp } from './native'
import { getNativeSessionToken } from './native-auth'
import { absoluteApiUrl } from './public-env'

export function daysApiUrl(path: string): string {
  return absoluteApiUrl(path, isNativeApp())
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
