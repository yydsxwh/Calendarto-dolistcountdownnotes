import { describe, expect, it } from 'vitest'
import { makeRemark, remarkById, upsertRemark, withoutRemark } from './remarks'
import { mergeAppData } from './sync-merge'
import { emptyData } from './store'

describe('备注', () => {
  it('同一天重复保存只有一条，连点不会变两条', () => {
    let remarks = upsertRemark([], makeRemark('day', '第一遍', { date: '2026-09-25' }), 10)
    remarks = upsertRemark(remarks, makeRemark('day', '第二遍', { date: '2026-09-25' }), 11)
    remarks = upsertRemark(remarks, makeRemark('day', '第二遍', { date: '2026-09-25' }), 12)
    expect(remarks).toHaveLength(1)
    expect(remarks[0].body).toBe('第二遍')
    expect(remarks[0].revision).toBe(3)
  })

  it('本次课备注不影响其他课次，整门备注各课次都能读到', () => {
    let remarks = upsertRemark([], makeRemark('occurrence', '带计算器', { courseId: 'c1', date: '2026-09-25', startTime: '08:00' }), 1)
    remarks = upsertRemark(remarks, makeRemark('occurrence', '别的课', { courseId: 'c1', date: '2026-10-02', startTime: '08:00' }), 2)
    remarks = upsertRemark(remarks, makeRemark('course', '教材第三章', { courseId: 'c1' }), 3)
    expect(remarkById(remarks, 'occ:c1:2026-09-25:08:00')?.body).toBe('带计算器')
    expect(remarkById(remarks, 'occ:c1:2026-10-02:08:00')?.body).toBe('别的课')
    expect(remarkById(remarks, 'course:c1')?.body).toBe('教材第三章')
    remarks = withoutRemark(remarks, 'occ:c1:2026-09-25:08:00')
    expect(remarkById(remarks, 'course:c1')?.body).toBe('教材第三章')
    expect(remarkById(remarks, 'occ:c1:2026-10-02:08:00')?.body).toBe('别的课')
  })

  it('删除日期备注不影响日程，较新的远端备注不会被旧的盖掉', () => {
    const base = emptyData()
    const local = {
      ...base,
      calendarEvents: [{ id: 'e', title: '讨论', date: '2026-09-25', allDay: false, color: '#2563eb', priority: 'medium' as const, remindMinutes: 0, createdAt: 1 }],
      remarks: upsertRemark([], makeRemark('day', '旧备注', { date: '2026-09-25' }), 10),
    }
    const remote = {
      ...base,
      calendarEvents: local.calendarEvents,
      remarks: upsertRemark([], makeRemark('day', '新备注', { date: '2026-09-25' }), 20),
    }
    const merged = mergeAppData(local, remote)
    expect(merged.remarks[0].body).toBe('新备注')
    expect(merged.calendarEvents).toHaveLength(1)
    const deleted = mergeAppData({ ...local, remarks: [], tombstones: [{ id: 'day:2026-09-25', deletedAt: 30 }] }, remote)
    expect(deleted.remarks).toHaveLength(0)
    expect(deleted.calendarEvents).toHaveLength(1)
  })

  it('两个账号的备注互不相通', () => {
    const alice = upsertRemark([], makeRemark('day', '甲的备注', { date: '2026-09-25' }), 1)
    const bob = upsertRemark([], makeRemark('day', '乙的备注', { date: '2026-09-25' }), 1)
    expect(alice[0].body).toBe('甲的备注')
    expect(bob[0].body).toBe('乙的备注')
    expect(alice).not.toEqual(bob)
  })

  it('本地日期标识不会因为时区改到另一天', () => {
    expect(makeRemark('day', '备注', { date: '2026-09-25' }).id).toBe('day:2026-09-25')
    expect(makeRemark('occurrence', '作业', { courseId: 'c1', date: '2026-09-25', startTime: '08:00' }).id).toBe('occ:c1:2026-09-25:08:00')
  })
})
