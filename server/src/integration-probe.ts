import { createPkcePair } from './crypto'

export type ProbeCheck = { name: string; ok: boolean; detail: string }

async function fetchJson(url: string, init: RequestInit = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(8000) })
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { status: response.status, json }
}

export async function probeAccount(input: {
  issuer: string
  clientId: string
  redirectUri: string
}): Promise<{ ok: boolean; checks: ProbeCheck[] }> {
  const issuer = input.issuer.replace(/\/+$/, '')
  const checks: ProbeCheck[] = []
  if (!issuer) {
    return { ok: false, checks: [{ name: 'issuer', ok: false, detail: 'ACCOUNT_ISSUER 未填' }] }
  }
  let discovery: Record<string, unknown> = {}
  try {
    const res = await fetchJson(`${issuer}/.well-known/openid-configuration`)
    discovery = res.json
    checks.push({
      name: 'discovery',
      ok: res.status === 200 && Boolean(discovery.issuer),
      detail: res.status === 200 ? 'openid-configuration 可读' : `discovery ${res.status}`,
    })
  } catch (error) {
    checks.push({
      name: 'discovery',
      ok: false,
      detail: error instanceof Error ? error.message : 'discovery 失败',
    })
    return { ok: false, checks }
  }

  const discoveredIssuer = String(discovery.issuer || '').replace(/\/+$/, '')
  checks.push({
    name: 'issuer',
    ok: discoveredIssuer === issuer,
    detail: discoveredIssuer === issuer ? discoveredIssuer : `discovery.issuer=${discoveredIssuer || '空'}`,
  })

  const authorize = String(discovery.authorization_endpoint || '')
  checks.push({
    name: 'authorize',
    ok: /^https?:\/\//.test(authorize),
    detail: authorize || '缺少 authorization_endpoint',
  })

  const token = String(discovery.token_endpoint || '')
  checks.push({
    name: 'token',
    ok: /^https?:\/\//.test(token),
    detail: token || '缺少 token_endpoint',
  })

  const jwksUri = String(discovery.jwks_uri || `${issuer}/.well-known/jwks.json`)
  try {
    const jwks = await fetchJson(jwksUri)
    const keys = Array.isArray(jwks.json.keys) ? jwks.json.keys : []
    const rs256 = keys.some((key) => {
      const item = key as { kty?: string; alg?: string }
      return item.kty === 'RSA' || item.alg === 'RS256'
    })
    checks.push({
      name: 'jwks',
      ok: jwks.status === 200 && keys.length > 0,
      detail: keys.length ? `${keys.length} 把密钥` : `jwks ${jwks.status}`,
    })
    checks.push({
      name: 'rs256',
      ok: rs256 || String(discovery.id_token_signing_alg_values_supported || '').includes('RS256'),
      detail: 'ID Token 使用 RS256',
    })
  } catch (error) {
    checks.push({ name: 'jwks', ok: false, detail: error instanceof Error ? error.message : 'jwks 失败' })
    checks.push({ name: 'rs256', ok: false, detail: '无法读取 JWKS' })
  }

  const methods = Array.isArray(discovery.code_challenge_methods_supported)
    ? (discovery.code_challenge_methods_supported as string[])
    : []
  const pkce = methods.includes('S256') || methods.length === 0
  const pair = createPkcePair()
  checks.push({
    name: 'pkce_s256',
    ok: pkce && Boolean(pair.challenge && pair.verifier),
    detail: methods.length ? methods.join(' ') : '将按 S256 发送 code_challenge',
  })

  if (authorize && input.clientId && input.redirectUri) {
    try {
      const url = new URL(authorize)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', input.clientId)
      url.searchParams.set('redirect_uri', input.redirectUri)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('code_challenge', pair.challenge)
      checks.push({
        name: 'authorize_shape',
        ok: url.searchParams.get('code_challenge_method') === 'S256',
        detail: '授权 URL 已带 PKCE S256',
      })
    } catch {
      checks.push({ name: 'authorize_shape', ok: false, detail: 'authorization_endpoint 不是合法 URL' })
    }
  }

  return { ok: checks.every((item) => item.ok), checks }
}

export async function probePlatform(input: {
  apiUrl: string
  serviceToken: string
  clientId: string
}): Promise<{ ok: boolean; checks: ProbeCheck[] }> {
  const base = input.apiUrl.replace(/\/+$/, '')
  const checks: ProbeCheck[] = []
  if (!base) {
    return { ok: false, checks: [{ name: 'api_url', ok: false, detail: 'PLATFORM_API_URL 未填' }] }
  }

  for (const path of ['/health', '/ready']) {
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(8000) })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string }
      const healthy =
        path === '/health'
          ? res.status === 200 && json.ok !== false
          : res.status === 200 && (json.status === 'ready' || json.ok === true || json.status === 'ok')
      checks.push({
        name: path.slice(1),
        ok: healthy,
        detail: `${path} ${res.status}`,
      })
    } catch (error) {
      checks.push({
        name: path.slice(1),
        ok: false,
        detail: error instanceof Error ? error.message : `${path} 失败`,
      })
    }
  }

  if (!input.serviceToken) {
    checks.push({ name: 'service_auth', ok: false, detail: 'PLATFORM_SERVICE_TOKEN 未配置' })
    return { ok: false, checks }
  }

  try {
    const res = await fetch(`${base}/v1/catalog/products`, {
      headers: {
        authorization: `Bearer ${input.serviceToken}`,
        'x-platform-client': input.clientId || 'rishi',
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })
    checks.push({
      name: 'service_auth',
      ok: res.status !== 401 && res.status !== 0,
      detail: res.status === 401 ? '服务凭证被拒绝' : `catalog ${res.status}`,
    })
  } catch (error) {
    checks.push({
      name: 'service_auth',
      ok: false,
      detail: error instanceof Error ? error.message : '服务身份请求失败',
    })
  }

  return { ok: checks.every((item) => item.ok), checks }
}
