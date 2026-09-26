import type { AuthClient, SessionUser } from '@yydsxwh/shared/auth/identity'
import { daysApiUrl } from './days-api'
import { ACCOUNT_CENTER_URL, fetchSiteUser } from './site-session'
import { isNativeApp } from './native'
import { clearNativeSession, startNativeLogin } from './native-auth'

export async function toSessionUser(): Promise<SessionUser | null> {
  const user = await fetchSiteUser()
  if (!user) return null
  return {
    sub: user.sub || user.id,
    name: user.name,
    email: user.email || null,
    emailVerified: false,
    phoneNumber: null,
    picture: user.avatarUrl || null,
    roles: [],
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

export const rishiAuthClient: AuthClient = {
  getSession: toSessionUser,
  async getAuthorizeUrl(input) {
    if (isNativeApp()) return daysApiUrl('/api/days/auth/login?native=1')
    return daysApiUrl(`/api/days/auth/login?returnTo=${encodeURIComponent(input.returnTo)}`)
  },
  async signOut(input) {
    await clearNativeSession()
    const back = input?.returnTo || (typeof window === 'undefined' ? '/products/days/' : window.location.href)
    window.location.href = daysApiUrl(`/api/days/auth/logout?returnTo=${encodeURIComponent(back)}`)
  },
  async getAuthMethods() {
    return { enabled: ['PASSWORD', 'EMAIL', 'SMS', 'WECHAT_OAUTH'], preferred: 'PASSWORD' }
  },
}

export { ACCOUNT_CENTER_URL, startNativeLogin }
