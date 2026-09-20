import type { AppData } from '../types'
import { daysFetch } from './days-api'

/**
 * 日事云端挂在 /api/days/sync。身份来自 rishi session（Cookie 或 Bearer），
 * 客户端提交的 userId / sub 一律不是鉴权依据。
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
    response = await daysFetch(SYNC_PATH, { signal })
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
    response = await daysFetch(SYNC_PATH, {
      method: 'PUT',
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
