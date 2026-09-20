/**
 * Error vocabulary shared by the HTTP layer.
 *
 * Every failure the user can observe is reduced to a stable machine code plus
 * a short Chinese message. Stack traces, database errors and provider
 * responses stay on the server; see `toErrorBody`.
 */

export type AuthErrorCode =
  | 'login_cancelled'
  | 'invalid_state'
  | 'invalid_request'
  | 'token_exchange_failed'
  | 'id_token_invalid'
  | 'missing_subject'
  | 'account_unavailable'
  | 'session_failed'
  | 'handoff_invalid'
  | 'native_disabled'
  | 'server_error'

export type ApiErrorCode =
  | AuthErrorCode
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'version_conflict'
  | 'invalid_payload'
  | 'payload_too_large'
  | 'csrf_origin_rejected'
  | 'account_link_expired'

const MESSAGES: Record<ApiErrorCode, string> = {
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
  unauthenticated: '请先登录。',
  forbidden: '没有权限访问该资源。',
  not_found: '资源不存在。',
  version_conflict: '数据已在其他设备更新，请先同步。',
  invalid_payload: '提交的数据格式不正确。',
  payload_too_large: '数据过大，无法同步。',
  csrf_origin_rejected: '请求来源不被信任。',
  account_link_expired: '与账号中心的授权已过期，请重新登录。',
}

const STATUS: Record<ApiErrorCode, number> = {
  login_cancelled: 400,
  invalid_state: 400,
  invalid_request: 400,
  token_exchange_failed: 502,
  id_token_invalid: 502,
  missing_subject: 502,
  account_unavailable: 503,
  session_failed: 500,
  handoff_invalid: 400,
  native_disabled: 404,
  server_error: 500,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  version_conflict: 409,
  invalid_payload: 400,
  payload_too_large: 413,
  csrf_origin_rejected: 403,
  account_link_expired: 401,
}

export class ApiError extends Error {
  override readonly name = 'ApiError'
  readonly code: ApiErrorCode
  readonly status: number
  /** Server-only detail for logs; never serialised into a response. */
  readonly internal: string | undefined

  constructor(code: ApiErrorCode, internal?: string) {
    super(MESSAGES[code])
    this.code = code
    this.status = STATUS[code]
    this.internal = internal
  }
}

export function apiError(code: ApiErrorCode, internal?: string): ApiError {
  return new ApiError(code, internal)
}

export function messageFor(code: ApiErrorCode): string {
  return MESSAGES[code]
}

export function isAuthErrorCode(value: string): value is AuthErrorCode {
  return value in MESSAGES
}

export function toErrorBody(error: ApiError): { error: ApiErrorCode; message: string } {
  return { error: error.code, message: error.message }
}
