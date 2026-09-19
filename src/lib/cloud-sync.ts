import type { AppData } from '../types'
import { siteApiUrl } from './note-doc'

/**
 * 日事的云端是主站上的一个小同步服务，挂在同源的 /api/days/ 下，用主站登录态
 * 认人。浏览器不需要自己带 token：cookie 同源自动发送。
 */
export const SYNC_PATH = '/api/days/sync'

export type RemoteSnapshot = {
  authenticated: boolean
  data: AppData | null
  version: number
  updatedAt: string | null
}

export class SyncUnauthorized extends Error {}
export class SyncConflict extends Error {
  constructor(readonly remote: RemoteSnapshot) {
    super('VERSION_CONFLICT')
  }
}
export class SyncUnavailable extends Error {}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new SyncUnavailable(`BAD_JSON_${response.status}`)
  }
}

export async function pullRemote(signal?: AbortSignal): Promise<RemoteSnapshot> {
  let response: Response
  try {
    response = await fetch(siteApiUrl(SYNC_PATH), { credentials: 'include', cache: 'no-store', signal })
  } catch {
    throw new SyncUnavailable('NETWORK')
  }
  if (response.status === 401) return { authenticated: false, data: null, version: 0, updatedAt: null }
  if (!response.ok) throw new SyncUnavailable(`GET_${response.status}`)
  const body = (await readJson(response)) as RemoteSnapshot
  return { ...body, authenticated: true }
}

export async function pushRemote(data: AppData, baseVersion: number): Promise<{ version: number; updatedAt: string }> {
  let response: Response
  try {
    response = await fetch(siteApiUrl(SYNC_PATH), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, baseVersion }),
    })
  } catch {
    throw new SyncUnavailable('NETWORK')
  }
  if (response.status === 401) throw new SyncUnauthorized('UNAUTHORIZED')
  if (response.status === 409) {
    const remote = (await readJson(response)) as RemoteSnapshot
    throw new SyncConflict({ ...remote, authenticated: true })
  }
  if (!response.ok) throw new SyncUnavailable(`PUT_${response.status}`)
  return (await readJson(response)) as { version: number; updatedAt: string }
}
