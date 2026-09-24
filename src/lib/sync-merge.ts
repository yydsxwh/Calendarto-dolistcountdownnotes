import { emptyData } from './store'
import type { AppData } from '../types'

/**
 * 两台设备同时改了同一个账号时怎么办。
 *
 * 这里的立场是**宁可多留，不可丢失**：按 id 取并集，两边都有的取内容较新的一份。
 * 极端情况下，一台设备删掉的条目可能被另一台设备的旧副本带回来 —— 这比把用户
 * 真写过的东西静默删掉要好得多，而且用户自己再删一次就行。
 *
 * 日常不会走到这里：单用户、少设备、推送有防抖，冲突很罕见。
 */

type Identified = { id: string }

/** 条目的"最后改动时间"。只有便签记了 updatedAt，其余用 createdAt 兜底。 */
function stamp(item: unknown): number {
  const record = item as { updatedAt?: unknown; createdAt?: unknown }
  if (typeof record.updatedAt === 'number') return record.updatedAt
  if (typeof record.createdAt === 'number') return record.createdAt
  return 0
}

function mergeTombstones(
  mine: { id: string; deletedAt: number }[] = [],
  theirs: { id: string; deletedAt: number }[] = [],
) {
  const merged = new Map<string, { id: string; deletedAt: number }>()
  for (const item of [...mine, ...theirs]) {
    const existing = merged.get(item.id)
    if (!existing || item.deletedAt > existing.deletedAt) merged.set(item.id, item)
  }
  return [...merged.values()]
}

function rejectTombstoned<T extends Identified>(items: T[], tombstones: { id: string; deletedAt: number }[]): T[] {
  const deleted = new Map(tombstones.map((item) => [item.id, item.deletedAt]))
  return items.filter((item) => {
    const at = deleted.get(item.id)
    return at == null || stamp(item) > at
  })
}

export function mergeById<T extends Identified>(mine: T[], theirs: T[]): T[] {
  const merged = new Map<string, T>()
  for (const item of mine) merged.set(item.id, item)
  for (const item of theirs) {
    const existing = merged.get(item.id)
    if (!existing || stamp(item) > stamp(existing)) merged.set(item.id, item)
  }
  return [...merged.values()]
}

/**
 * 合并两份完整数据。列表按 id 取并集；设置类字段以 `preferred` 为准，
 * 因为它们是整体开关，逐字段猜测反而会让人困惑。
 */
export function mergeAppData(preferred: AppData, other: AppData): AppData {
  const base = emptyData()
  const tombstones = mergeTombstones(preferred.tombstones ?? [], other.tombstones ?? [])
  return {
    ...base,
    ...other,
    ...preferred,
    todos: rejectTombstoned(mergeById(preferred.todos ?? [], other.todos ?? []), tombstones),
    countdowns: rejectTombstoned(mergeById(preferred.countdowns ?? [], other.countdowns ?? []), tombstones),
    notes: rejectTombstoned(mergeById(preferred.notes ?? [], other.notes ?? []), tombstones),
    courses: rejectTombstoned(mergeById(preferred.courses ?? [], other.courses ?? []), tombstones),
    exams: rejectTombstoned(mergeById(preferred.exams ?? [], other.exams ?? []), tombstones),
    selfSchedules: rejectTombstoned(mergeById(preferred.selfSchedules ?? [], other.selfSchedules ?? []), tombstones),
    calendarEvents: rejectTombstoned(mergeById(preferred.calendarEvents ?? [], other.calendarEvents ?? []), tombstones),
    recurringReminders: rejectTombstoned(mergeById(preferred.recurringReminders ?? [], other.recurringReminders ?? []), tombstones),
    reminderRules: rejectTombstoned(mergeById(preferred.reminderRules ?? [], other.reminderRules ?? []), tombstones),
    holidayFavorites: rejectTombstoned(mergeById(preferred.holidayFavorites ?? [], other.holidayFavorites ?? []), tombstones),
    terms: mergeById(preferred.terms ?? [], other.terms ?? []),
    tombstones,
  }
}

/** 有没有任何用户内容。空数据可以被云端安全覆盖，不需要问人。 */
export function isEmptyData(data: AppData | null | undefined): boolean {
  if (!data) return true
  return (
    (data.todos?.length ?? 0) === 0 &&
    (data.countdowns?.length ?? 0) === 0 &&
    (data.notes?.length ?? 0) === 0 &&
    (data.courses?.length ?? 0) === 0 &&
    (data.exams?.length ?? 0) === 0 &&
    (data.selfSchedules?.length ?? 0) === 0 &&
    (data.calendarEvents?.length ?? 0) === 0 &&
    (data.recurringReminders?.length ?? 0) === 0
  )
}

/** 只比较用户内容，忽略字段顺序。用来判断"要不要推送"。 */
export function fingerprint(data: AppData): string {
  return JSON.stringify([
    data.todos,
    data.countdowns,
    data.notes,
    data.courses,
    data.exams,
    data.selfSchedules,
    data.calendarEvents,
    data.recurringReminders,
    data.tombstones,
    data.terms,
    data.currentTermId,
    data.reminderSettings,
    data.reminderRules,
    data.holidaySettings,
    data.holidayFavorites,
    data.timetableView,
    data.termStart,
  ])
}
