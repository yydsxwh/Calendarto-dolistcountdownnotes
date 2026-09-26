import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import catalog from '../../src/lib/holidays/catalog.json'
import type { HolidayOccurrence } from '../../src/lib/holidays/build'
import type { DaysConfig } from './config'
import { requireAdmin } from './admin'
import { readBody, sendJson } from './http'

const KINDS = new Set(['public_holiday', 'day_off', 'adjusted_workday', 'traditional_festival', 'observance'])
const DATE = /^\d{4}-\d{2}-\d{2}$/

function asOccurrence(raw: unknown): HolidayOccurrence | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as HolidayOccurrence
  if (typeof item.id !== 'string' || typeof item.stableKey !== 'string' || typeof item.date !== 'string') return null
  if (!DATE.test(item.date) || (item.region !== 'CN' && item.region !== 'US') || !KINDS.has(item.kind)) return null
  if (typeof item.name !== 'string' || typeof item.isDayOff !== 'boolean' || typeof item.isAdjustedWorkday !== 'boolean') return null
  if (item.isAdjustedWorkday && item.isDayOff) return null
  return item
}

async function readOverlay(config: DaysConfig): Promise<HolidayOccurrence[]> {
  try {
    const text = await readFile(join(config.dataDir, 'holidays-overlay.json'), 'utf8')
    const parsed = JSON.parse(text) as { occurrences?: unknown[] }
    return (parsed.occurrences ?? []).flatMap((item) => {
      const row = asOccurrence(item)
      return row ? [row] : []
    })
  } catch {
    return []
  }
}

function merged(base: HolidayOccurrence[], overlay: HolidayOccurrence[]): HolidayOccurrence[] {
  const map = new Map(base.map((item) => [item.id, item]))
  for (const item of overlay) map.set(item.id, item)
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

export async function handleHolidays(req: IncomingMessage, res: ServerResponse, url: URL, config: DaysConfig) {
  const overlay = await readOverlay(config)
  const all = merged(catalog.occurrences as HolidayOccurrence[], overlay)
  const from = url.searchParams.get('from') || `${catalog.generatedFrom}-01-01`
  const to = url.searchParams.get('to') || `${catalog.generatedTo}-12-31`
  const region = url.searchParams.get('region')
  const kind = url.searchParams.get('kind')
  const occurrences = all.filter((item) => item.date >= from && item.date <= to && (!region || item.region === region) && (!kind || item.kind === kind))
  const body = {
    version: catalog.version,
    updatedAt: catalog.updatedAt,
    source: 'bundled+overlay',
    from,
    to,
    count: occurrences.length,
    occurrences,
  }
  const etag = `"holidays-${catalog.version}-${overlay.length}-${occurrences.length}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'cache-control': 'public, max-age=3600' })
    res.end()
    return
  }
  sendJson(res, 200, body, { ETag: etag, 'cache-control': 'public, max-age=3600' })
}

export async function handleHolidayImport(req: IncomingMessage, res: ServerResponse, config: DaysConfig) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }
  try {
    await requireAdmin(req, config)
  } catch (error) {
    const code = error instanceof Error && error.message === 'ADMIN_ONLY' ? 403 : 401
    sendJson(res, code, { error: code === 403 ? 'admin_only' : 'unauthorized' })
    return
  }
  const raw = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8')) as { occurrences?: unknown[]; replaceYear?: number }
  const incoming = (raw.occurrences ?? []).map(asOccurrence)
  if (incoming.some((item) => item == null)) {
    sendJson(res, 400, { error: 'invalid_holiday' })
    return
  }
  const rows = incoming as HolidayOccurrence[]
  const ids = rows.map((item) => item.id)
  if (new Set(ids).size !== ids.length) {
    sendJson(res, 400, { error: 'duplicate_id' })
    return
  }
  const byDate = new Map<string, HolidayOccurrence[]>()
  for (const item of rows) {
    const list = byDate.get(item.date) ?? []
    if (list.some((other) => other.stableKey === item.stableKey && other.kind === item.kind)) {
      sendJson(res, 400, { error: 'date_conflict', date: item.date })
      return
    }
    list.push(item)
    byDate.set(item.date, list)
  }
  const current = await readOverlay(config)
  const kept = raw.replaceYear
    ? current.filter((item) => item.sourceYear !== raw.replaceYear)
    : current.filter((item) => !ids.includes(item.id))
  const next = [...kept, ...rows]
  await mkdir(config.dataDir, { recursive: true })
  await writeFile(join(config.dataDir, 'holidays-overlay.json'), JSON.stringify({ updatedAt: new Date().toISOString(), occurrences: next }))
  sendJson(res, 200, { ok: true, count: next.length, preview: rows.slice(0, 20) })
}
