import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DaysConfig } from './config'
import { sha256Hex } from './crypto'
import { rememberLegacyId } from './users'

export type SyncRecord = {
  data: unknown | null
  version: number
  updatedAt: string | null
}

export function dataFile(config: DaysConfig, userKey: string) {
  return join(config.dataDir, `${sha256Hex(userKey)}.json`)
}

export async function readRecord(config: DaysConfig, userKey: string): Promise<SyncRecord> {
  try {
    const parsed = JSON.parse(await readFile(dataFile(config, userKey), 'utf8')) as SyncRecord
    return {
      data: parsed.data ?? null,
      version: Number(parsed.version) || 0,
      updatedAt: parsed.updatedAt ?? null,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { data: null, version: 0, updatedAt: null }
    throw error
  }
}

export async function writeRecord(config: DaysConfig, userKey: string, record: SyncRecord): Promise<void> {
  const target = dataFile(config, userKey)
  await mkdir(dirname(target), { recursive: true })
  const temp = `${target}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(record))
  await rename(temp, target)
}

function isEmptyData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return true
  const record = data as Record<string, unknown>
  const lists = ['todos', 'countdowns', 'notes', 'courses', 'exams', 'selfSchedules', 'calendarEvents', 'recurringReminders']
  return lists.every((key) => !Array.isArray(record[key]) || record[key].length === 0)
}

/** 第一次用 account sub 登录时，把旧主站 userId 那份云端数据迁过来，空云端不能盖掉有内容的旧文件。 */
export async function migrateLegacyIfNeeded(
  config: DaysConfig,
  accountSub: string,
  legacyId: string | null,
): Promise<void> {
  if (!legacyId || legacyId === accountSub) return
  const current = await readRecord(config, accountSub)
  if (!isEmptyData(current.data)) return
  const legacy = await readRecord(config, legacyId)
  if (isEmptyData(legacy.data)) return
  await writeRecord(config, accountSub, legacy)
  await rememberLegacyId(config, accountSub, legacyId)
}
