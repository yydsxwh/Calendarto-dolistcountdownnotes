import type { Remark, RemarkKind } from '../types'

export function dayRemarkId(date: string): string {
  return `day:${date}`
}

export function courseRemarkId(courseId: string): string {
  return `course:${courseId}`
}

export function occurrenceKey(courseId: string, date: string, startTime: string): string {
  return `${courseId}:${date}:${startTime}`
}

export function occurrenceRemarkId(courseId: string, date: string, startTime: string): string {
  return `occ:${occurrenceKey(courseId, date, startTime)}`
}

export function remarkById(remarks: Remark[] | undefined, id: string): Remark | undefined {
  return (remarks ?? []).find((item) => item.id === id)
}

/** 同一 id 只保留一条。正文为空时不新增。 */
export function upsertRemark(remarks: Remark[] | undefined, next: Omit<Remark, 'revision' | 'createdAt'> & { createdAt?: number }, now = Date.now()): Remark[] {
  const list = remarks ?? []
  const body = next.body.replace(/\r\n/g, '\n')
  const existing = list.find((item) => item.id === next.id)
  if (!body.trim()) return list
  const saved: Remark = {
    id: next.id,
    kind: next.kind,
    date: next.date,
    courseId: next.courseId,
    occurrenceKey: next.occurrenceKey,
    body,
    createdAt: existing?.createdAt ?? next.createdAt ?? now,
    updatedAt: now,
    revision: (existing?.revision ?? 0) + 1,
  }
  return existing ? list.map((item) => (item.id === saved.id ? saved : item)) : [...list, saved]
}

export function withoutRemark(remarks: Remark[] | undefined, id: string): Remark[] {
  return (remarks ?? []).filter((item) => item.id !== id)
}

export function makeRemark(kind: RemarkKind, body: string, target: { date?: string; courseId?: string; startTime?: string }): Omit<Remark, 'revision' | 'createdAt'> {
  if (kind === 'day') {
    const date = target.date || ''
    return { id: dayRemarkId(date), kind, date, body, updatedAt: 0 }
  }
  if (kind === 'course') {
    const courseId = target.courseId || ''
    return { id: courseRemarkId(courseId), kind, courseId, body, updatedAt: 0 }
  }
  const courseId = target.courseId || ''
  const date = target.date || ''
  const startTime = target.startTime || ''
  return { id: occurrenceRemarkId(courseId, date, startTime), kind, date, courseId, occurrenceKey: occurrenceKey(courseId, date, startTime), body, updatedAt: 0 }
}

export function hydrateRemarks(raw: unknown): Remark[] {
  if (!Array.isArray(raw)) return []
  const out: Remark[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<Remark>
    if (typeof row.id !== 'string' || (row.kind !== 'day' && row.kind !== 'course' && row.kind !== 'occurrence')) continue
    if (typeof row.body !== 'string') continue
    out.push({
      id: row.id,
      kind: row.kind,
      date: typeof row.date === 'string' ? row.date : undefined,
      courseId: typeof row.courseId === 'string' ? row.courseId : undefined,
      occurrenceKey: typeof row.occurrenceKey === 'string' ? row.occurrenceKey : undefined,
      body: row.body,
      createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
      updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
      revision: typeof row.revision === 'number' ? row.revision : 1,
    })
  }
  return out
}
