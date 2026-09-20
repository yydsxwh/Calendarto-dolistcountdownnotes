/**
 * 客户端 → 日事 BFF。
 *
 * 这里**不会**直接访问账号中心。登录、令牌交换、身份校验全部发生在日事服务端
 * （`server/auth`），浏览器只拿得到一个 HttpOnly 的日事会话 Cookie。原生外壳
 * 因为跨 origin 带不上 Cookie，改用日事自己签发的 Bearer 会话令牌——那同样
 * 不是账号中心的 access token。
 */
import type { AppData } from '../types'
import { isNativeApp } from './native'

/** 原生外壳必须给出绝对地址；网页版与 BFF 同源，留空即可。 */
const CONFIGURED_API_BASE = (import.meta.env.VITE_RISHI_API_BASE || '').replace(/\/$/, '')
const NATIVE_API_BASE = 'https://rishi.yydsxwh.com'

const NATIVE_TOKEN_KEY = 'kemiao-days-session-token'

export function apiBase(): string {
  if (CONFIGURED_API_BASE) return CONFIGURED_API_BASE
  return isNativeApp() ? NATIVE_API_BASE : ''
}

function apiUrl(path: string): string {
  return `${apiBase()}${path}`
}

/**
 * 原生外壳的会话令牌。网页版永远走 HttpOnly Cookie，不碰这里，
 * 所以浏览器里的 JavaScript 依然拿不到任何凭据。
 */
function nativeToken(): string | null {
  if (!isNativeApp()) return null
  try {
    return window.localStorage.getItem(NATIVE_TOKEN_KEY)
  } catch {
    return null
  }
}

export function storeNativeToken(token: string): void {
  try {
    window.localStorage.setItem(NATIVE_TOKEN_KEY, token)
  } catch {
    // 隐私模式下写不进去，只影响「下次免登录」
  }
}

export function clearNativeToken(): void {
  try {
    window.localStorage.removeItem(NATIVE_TOKEN_KEY)
  } catch {
    // 同上
  }
}

const CHECKPOINT_KEY = 'kemiao-days-sync-checkpoint'

/**
 * 本机上一次与某个账号同步到哪一步。
 *
 * 有了它，重新打开页面时才能分清「这台设备本来就是同步的」和「本机与云端
 * 真的分叉了」——否则每次刷新都会拿同一个问题去烦用户。
 */
export interface SyncCheckpoint {
  accountUserId: string
  version: number
  snapshot: string
}

export function readCheckpoint(): SyncCheckpoint | null {
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncCheckpoint>
    if (typeof parsed.accountUserId !== 'string' || typeof parsed.version !== 'number') return null
    if (typeof parsed.snapshot !== 'string') return null
    return { accountUserId: parsed.accountUserId, version: parsed.version, snapshot: parsed.snapshot }
  } catch {
    return null
  }
}

export function writeCheckpoint(checkpoint: SyncCheckpoint): void {
  try {
    window.localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint))
  } catch {
    // 写不进去只会让下次多问一次，不影响数据
  }
}

export function clearCheckpoint(): void {
  try {
    window.localStorage.removeItem(CHECKPOINT_KEY)
  } catch {
    // 同上
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = nativeToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(apiUrl(path), { ...init, headers, credentials: 'include', cache: 'no-store' })
}

export interface AccountUser {
  id: string
  accountUserId: string
  displayName: string | null
  email: string | null
  avatarUrl: string | null
}

export interface SessionState {
  authenticated: boolean
  user: AccountUser | null
}

export interface RemoteDocument {
  version: number
  updatedAt: number | null
  data: Partial<AppData> | null
}

export class SyncError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'SyncError'
    this.code = code
  }
}

async function toSyncError(response: Response): Promise<SyncError> {
  try {
    const body = (await response.json()) as { error?: string; message?: string }
    return new SyncError(body.error ?? `http_${response.status}`, body.message ?? '同步失败，请稍后再试。')
  } catch {
    return new SyncError(`http_${response.status}`, '同步失败，请稍后再试。')
  }
}

export async function fetchSession(): Promise<SessionState> {
  const response = await call('/api/auth/session')
  if (!response.ok) throw await toSyncError(response)
  return (await response.json()) as SessionState
}

export async function pullDaysData(): Promise<RemoteDocument> {
  const response = await call('/api/sync')
  if (response.status === 401) throw new SyncError('unauthenticated', '请先登录。')
  if (!response.ok) throw await toSyncError(response)
  return (await response.json()) as RemoteDocument
}

export async function pushDaysData(
  data: AppData,
  baseVersion: number,
): Promise<{ version: number; updatedAt: number }> {
  const response = await call('/api/sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, baseVersion }),
  })
  if (response.status === 401) throw new SyncError('unauthenticated', '请先登录。')
  if (response.status === 409) throw new SyncError('version_conflict', '数据已在其他设备更新。')
  if (!response.ok) throw await toSyncError(response)
  return (await response.json()) as { version: number; updatedAt: number }
}

export async function logout(): Promise<void> {
  const response = await call('/api/auth/logout', { method: 'POST' })
  clearNativeToken()
  if (!response.ok && response.status !== 401) throw await toSyncError(response)
}

/** 用原生外壳深链接带回的一次性交接码换取日事会话令牌。 */
export async function exchangeNativeHandoff(handoff: string): Promise<AccountUser> {
  const response = await call('/api/auth/native/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handoff }),
  })
  if (!response.ok) throw await toSyncError(response)
  const body = (await response.json()) as { token: string; user: AccountUser }
  storeNativeToken(body.token)
  return body.user
}

/**
 * 跳转到日事 BFF 的登录入口，由服务端再跳账号中心。
 *
 * 前端不构造授权 URL，也不接触 client_id / state / nonce / PKCE，
 * 这些只存在于服务端。
 */
export function startLogin(returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`): void {
  const query = new URLSearchParams({ returnTo })
  if (isNativeApp()) query.set('client', 'native')
  window.location.href = apiUrl(`/api/auth/login?${query.toString()}`)
}

const AUTH_ERROR_MESSAGE: Record<string, string> = {
  login_cancelled: '你在账号中心取消了登录。',
  invalid_state: '登录请求已失效，请重新点击登录。',
  invalid_request: '登录请求参数不完整，请重新发起登录。',
  token_exchange_failed: '账号中心换取登录凭证失败，请稍后再试。',
  id_token_invalid: '账号中心返回的身份凭证未通过校验，登录已中止。',
  missing_subject: '账号中心未返回用户标识，登录已中止。',
  account_unavailable: '暂时连不上账号中心，请稍后再试。',
  session_failed: '创建日事登录状态失败，请重试。',
  handoff_invalid: '客户端登录凭据已失效，请重新登录。',
  native_disabled: '当前服务未开启客户端登录。',
  server_error: '服务暂时不可用，请稍后再试。',
}

/**
 * 读取回调带回的 `auth_error` 并把它从地址栏擦掉，避免用户刷新时
 * 反复看到同一条报错。
 */
export function consumeAuthError(): string | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('auth_error')
  if (!code) return null

  params.delete('auth_error')
  const search = params.toString()
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
  )
  return AUTH_ERROR_MESSAGE[code] ?? '登录失败，请重试。'
}
