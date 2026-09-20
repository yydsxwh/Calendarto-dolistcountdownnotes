import { isNativeApp } from './native'

const TOKEN_KEY = 'rishi-session-token'

let memoryToken: string | null = null

async function prefs() {
  return import('@capacitor/preferences')
}

export async function getNativeSessionToken(): Promise<string | null> {
  if (memoryToken) return memoryToken
  if (!isNativeApp()) return null
  try {
    const { Preferences } = await prefs()
    const { value } = await Preferences.get({ key: TOKEN_KEY })
    memoryToken = value
    return value
  } catch {
    return memoryToken
  }
}

export async function setNativeSessionToken(token: string | null): Promise<void> {
  memoryToken = token
  if (!isNativeApp()) return
  const { Preferences } = await prefs()
  if (token) await Preferences.set({ key: TOKEN_KEY, value: token })
  else await Preferences.remove({ key: TOKEN_KEY })
}

export async function startNativeLogin(): Promise<void> {
  const { Browser } = await import('@capacitor/browser')
  const url = `${window.location.protocol === 'https:' || window.location.protocol === 'http:' ? '' : 'https://www.yydsxwh.com'}`
  const login = isNativeApp()
    ? `https://www.yydsxwh.com/api/days/auth/login?native=1`
    : `${url}/api/days/auth/login?native=1`
  await Browser.open({ url: login })
}

export async function consumeNativeHandoff(code: string): Promise<{ token: string; user: { sub: string; name: string; avatarUrl: string } }> {
  const response = await fetch('https://www.yydsxwh.com/api/days/auth/handoff', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!response.ok) throw new Error('HANDOFF_FAILED')
  const body = (await response.json()) as { token: string; user: { sub: string; name: string; avatarUrl: string } }
  if (!body.token || !body.user?.sub) throw new Error('HANDOFF_FAILED')
  await setNativeSessionToken(body.token)
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.close()
  } catch {
    // already closed
  }
  return body
}

export async function listenNativeHandoff(onReady: () => void): Promise<() => void> {
  if (!isNativeApp()) return () => undefined
  const { App } = await import('@capacitor/app')
  const handle = await App.addListener('appUrlOpen', (event) => {
    try {
      const url = new URL(event.url)
      const code = url.searchParams.get('handoff')
      if (!code) return
      void consumeNativeHandoff(code).then(onReady)
    } catch {
      // ignore
    }
  })
  return () => {
    void handle.remove()
  }
}

export async function clearNativeSession(): Promise<void> {
  await setNativeSessionToken(null)
}
