import { describe, expect, it } from 'vitest'
import { emptyData } from './store'
import { planFires } from './reminder-rules'
import type { ReminderRule } from '../types'

function rule(partial: Partial<ReminderRule>): ReminderRule {
  return {
    id: partial.id || 'r',
    targetType: partial.targetType || 'todo',
    targetId: partial.targetId || 't',
    delivery: partial.delivery || 'alarm',
    triggerMode: partial.triggerMode || 'absolute',
    triggerAt: partial.triggerAt,
    offsetMinutes: partial.offsetMinutes,
    timezone: 'Asia/Shanghai',
    enabled: partial.enabled ?? true,
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
  }
}

describe('闹钟计划', () => {
  it('10:00 事项可以有 09:55 和 09:58 两个闹钟', () => {
    const data = emptyData()
    data.todos = [{ id: 't', title: '抢票', done: false, dueDate: '2026-09-25', dueTime: '10:00', priority: 'high', remindMinutes: 0, createdAt: 1 }]
    data.reminderRules = [
      rule({ id: 'a', triggerAt: '2026-09-25T09:55' }),
      rule({ id: 'b', triggerAt: '2026-09-25T09:58' }),
    ]
    const fires = planFires(data, new Date(2026, 8, 25, 9, 0), 2).map((item) => item.fireAt)
    expect(fires).toEqual(['2026-09-25T09:55', '2026-09-25T09:58'])
  })

  it('18:00 聚餐可以 17:00 响', () => {
    const data = emptyData()
    data.calendarEvents = [{ id: 'e', title: '聚餐', date: '2026-09-25', startTime: '18:00', allDay: false, color: '#2563eb', priority: 'medium', remindMinutes: 0, repeat: 'none', createdAt: 1 }]
    data.reminderRules = [rule({ id: 'c', targetType: 'event', targetId: 'e', triggerMode: 'relative', offsetMinutes: 60 })]
    expect(planFires(data, new Date(2026, 8, 25, 12, 0), 2)[0]?.fireAt).toBe('2026-09-25T17:00')
  })

  it('改时间后旧 occurrence 不再出现，完成或删除后取消', () => {
    const data = emptyData()
    data.exams = [{ id: 'x', name: '考试', kind: 'final', date: '2026-09-26', startTime: '08:00', remindMinutes: 0, createdAt: 1 }]
    data.reminderRules = [
      rule({ id: 'd1', targetType: 'exam', targetId: 'x', triggerMode: 'absolute', triggerAt: '2026-09-25T20:00' }),
      rule({ id: 'd2', targetType: 'exam', targetId: 'x', triggerMode: 'absolute', triggerAt: '2026-09-26T07:00' }),
    ]
    expect(planFires(data, new Date(2026, 8, 25, 12, 0), 2)).toHaveLength(2)
    data.exams[0].startTime = '09:00'
    data.reminderRules = [rule({ id: 'd2', targetType: 'exam', targetId: 'x', triggerMode: 'relative', offsetMinutes: 60, revision: 2 })]
    const next = planFires(data, new Date(2026, 8, 25, 12, 0), 2)
    expect(next.map((item) => item.fireAt)).toEqual(['2026-09-26T08:00'])
    data.exams = []
    expect(planFires(data, new Date(2026, 8, 25, 12, 0), 2)).toHaveLength(0)
  })

  it('课程按每次上课提前 10 分钟，默认关闭的规则不响', () => {
    const data = emptyData()
    data.courses = [{ id: 'c', name: '高数', weekday: 1, startTime: '09:00', endTime: '09:45', color: '#2563eb', remindMinutes: 15, createdAt: 1 }]
    data.reminderRules = [rule({ id: 'k', targetType: 'course', targetId: 'c', triggerMode: 'relative', offsetMinutes: 10, enabled: false })]
    expect(planFires(data, new Date(2026, 8, 21, 8, 0), 14)).toHaveLength(0)
    data.reminderRules[0].enabled = true
    const fires = planFires(data, new Date(2026, 8, 21, 8, 0), 14)
    expect(fires.every((item) => item.fireAt.endsWith('T08:50'))).toBe(true)
    expect(new Set(fires.map((item) => item.occurrenceKey)).size).toBe(fires.length)
  })
})
