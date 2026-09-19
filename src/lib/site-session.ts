import { siteApiUrl } from './note-doc'

/**
 * 日事跑在 www.yydsxwh.com/products/days/ 下，和主站同源，所以直接读主站的登录态
 * 就行：不需要日事自己存密码，也不需要跨域。未登录时主站返回 { user: null }
 * 而不是 401，方便壳层轮询。
 */
export type SiteUser = { id: string; name: string; avatarUrl: string }

export const LOGIN_PATH = '/login'
export const ACCOUNT_CENTER_URL = 'https://account.yydsxwh.com'

export async function fetchSiteUser(signal?: AbortSignal): Promise<SiteUser | null> {
  const response = await fetch(siteApiUrl('/api/auth/session'), {
    credentials: 'include',
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`SESSION_${response.status}`)
  const body = (await response.json()) as { user?: SiteUser | null }
  if (!body.user?.id) return null
  return { id: body.user.id, name: body.user.name || '我', avatarUrl: body.user.avatarUrl || '' }
}

/** 登录发生在主站，回来后停在当前页面。日事自己不做注册表单。 */
export function loginUrl(): string {
  const back = typeof window === 'undefined' ? '/products/days/' : window.location.href
  return `${siteApiUrl(LOGIN_PATH)}?next=${encodeURIComponent(back)}`
}

export function logoutUrl(): string {
  const back = typeof window === 'undefined' ? '/products/days/' : window.location.href
  return `${siteApiUrl('/api/auth/logout')}?next=${encodeURIComponent(back)}`
}

/** 取名字里的第一个字做头像占位，没有头像图时用。 */
export function avatarInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? [...trimmed][0].toUpperCase() : '我'
}
